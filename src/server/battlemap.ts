/**
 * The sand table — a battlefield with a fight on it.
 *
 * **Not `maps.ts`.** That is the region map: a picture with pins. This is a
 * room, authored as a tile grid, with the encounter's combatants standing on
 * it. Structured to match `maps.ts` all the same — `staff()`, `staffForMap()`,
 * bare `Error` codes — because that house style is good.
 *
 * Three rules this file exists to enforce, all of them server-side:
 *
 * 1. **Fog of war is a filter here, or it is decoration.** `getBattleMapState`
 *    builds a player a new document containing only revealed tiles, walls
 *    bounding revealed tiles, and tokens standing on revealed tiles. Never the
 *    stored document with parts hidden. Decision 6 in the handoff.
 * 2. **A position the browser produced is a claim, not a record.** Moves are
 *    validated against the rules in `lib/battlemap.ts` — bounds, void,
 *    occupancy — and refused rather than trusted.
 * 3. **A token is a position for an `initiativeEntries` row.** Its name, hit
 *    points and side come off the entry, through `LiveState`'s already
 *    role-filtered `entries`. This module never copies them.
 */
import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import {
  canStand,
  fogged,
  footprintTiles,
  visibleFrom,
  type Occupant,
} from '@/@creator/campaign/lib/battlemap';
import {
  emptyTerrain,
  inBounds,
  normalizeTerrain,
  VOID,
  type TerrainDoc,
} from '@/@shared/battlemap/types';
import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignMembers,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { bumpVersion } from './live-hub';

export interface BattleTokenRow {
  id: string;
  /** The combatant this stands for, or null for scenery. */
  entryId: string | null;
  /** Only meaningful when `entryId` is null. Otherwise read the entry. */
  label: string;
  x: number;
  y: number;
  altitude: number;
  footprint: number;
  tint: string;
  visibility: 'dm' | 'shared';
  /** Whether the reader may move it. */
  mine: boolean;
}

export interface BattleMapRow {
  id: string;
  encounterId: string | null;
  name: string;
  visibility: 'dm' | 'shared';
  isActive: boolean;
  /** Fogged for a player; whole for staff. */
  terrain: TerrainDoc;
  /** Revealed tile indices. Staff only; a player's is the empty list. */
  revealed: number[];
  tokens: BattleTokenRow[];
  updatedAt: string;
}

/** What `LiveState` carries: the board on the table, if any. */
export type BattleMapState = BattleMapRow | null;

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function staffForMap(mapId: string) {
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const { userId } = await staff(map.campaignId);
  return { map, userId };
}

function revealedOf(raw: unknown): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(raw)) return out;
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) out.add(n);
  }
  return out;
}

/* --- reading ----------------------------------------------------------- */

/**
 * The board on the table, as this viewer is allowed to have it.
 *
 * Staff get the stored document and every token. A player gets:
 * - nothing at all if the board is `dm`;
 * - a **new** terrain document with every unrevealed tile void at 0 —
 *   `fogged` builds it; this function never hands back the stored one;
 * - only `shared` tokens, and only those standing on a revealed tile — an
 *   ambush in the dark room is not on the board until the room is.
 *
 * Rides `LiveState`, so it is read on every nudge and there is one filter for
 * everything a player sees of a fight.
 */
export async function getBattleMapState(
  campaignId: string,
  viewer: { userId: string; role: CampaignRole }
): Promise<BattleMapState> {
  const map = await db.query.battleMaps.findFirst({
    where: and(
      eq(battleMaps.campaignId, campaignId),
      eq(battleMaps.isActive, true)
    ),
  });
  if (!map) return null;

  const isStaff = isStaffRole(viewer.role);
  if (!isStaff && map.visibility !== 'shared') return null;

  const stored = normalizeTerrain(map.terrain);
  const revealed = revealedOf(map.revealed);
  const terrain = isStaff ? stored : fogged(stored, revealed);

  const tokenRows = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, map.id));

  // Which entries belong to this reader's own character, so the board can say
  // "yours" without a second read.
  const membership = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, viewer.userId)
    ),
  });
  const myEntries = new Set<string>();
  if (membership?.characterId && map.encounterId) {
    const rows = await db
      .select({ id: initiativeEntries.id })
      .from(initiativeEntries)
      .where(
        and(
          eq(initiativeEntries.encounterId, map.encounterId),
          eq(initiativeEntries.characterId, membership.characterId)
        )
      );
    for (const r of rows) myEntries.add(r.id);
  }

  // Tokens for entries of another fight are not drawn even where a board
  // was bound before `bindBoardToFight` existed and still carries them.
  const inOrder = new Set(
    map.encounterId
      ? (
          await db
            .select({ id: initiativeEntries.id })
            .from(initiativeEntries)
            .where(eq(initiativeEntries.encounterId, map.encounterId))
        ).map(r => r.id)
      : []
  );

  const tokens: BattleTokenRow[] = tokenRows
    .filter(t => t.entryId === null || inOrder.has(t.entryId))
    .filter(t => {
      if (isStaff) return true;
      if (t.visibility !== 'shared') return false;
      // Every tile of the footprint must be revealed. A large creature half
      // in the dark is still a creature the party has not seen.
      return footprintTiles(stored, t).every(i => revealed.has(i));
    })
    .map(t => ({
      id: t.id,
      entryId: t.entryId,
      label: t.label,
      x: t.x,
      y: t.y,
      altitude: t.altitude,
      footprint: t.footprint,
      tint: t.tint,
      visibility: t.visibility,
      mine: isStaff || (t.entryId !== null && myEntries.has(t.entryId)),
    }));

  return {
    id: map.id,
    encounterId: map.encounterId,
    name: map.name,
    visibility: map.visibility,
    isActive: map.isActive,
    terrain,
    revealed: isStaff ? [...revealed] : [],
    tokens,
    updatedAt: map.updatedAt,
  };
}

/** Every board this campaign has authored. Staff only — it is the DM's shelf. */
export async function listBattleMaps(campaignId: string): Promise<
  {
    id: string;
    name: string;
    w: number;
    h: number;
    visibility: 'dm' | 'shared';
    isActive: boolean;
    encounterId: string | null;
    updatedAt: string;
  }[]
> {
  await staff(campaignId);
  const rows = await db
    .select()
    .from(battleMaps)
    .where(eq(battleMaps.campaignId, campaignId));
  return rows.map(r => {
    const t = normalizeTerrain(r.terrain);
    return {
      id: r.id,
      name: r.name,
      w: t.w,
      h: t.h,
      visibility: r.visibility,
      isActive: r.isActive,
      encounterId: r.encounterId,
      updatedAt: r.updatedAt,
    };
  });
}

/* --- authoring --------------------------------------------------------- */

export async function createBattleMap(
  campaignId: string,
  input: { name?: string; w: number; h: number }
): Promise<string> {
  const { userId } = await staff(campaignId);
  const [row] = await db
    .insert(battleMaps)
    .values({
      campaignId,
      name: (input.name ?? '').trim().slice(0, 120),
      terrain: emptyTerrain(input.w, input.h),
      revealed: [],
      createdBy: userId,
    })
    .returning({ id: battleMaps.id });
  return row.id;
}

/**
 * Replace the terrain. Whole document, normalised, every time.
 *
 * Whole rather than patched because terrain changes in prep and not mid-fight,
 * and a document written whole cannot be left half-edited by a dropped
 * request. Bumps are coalesced in the hub, so a DM painting is not a storm.
 */
export async function saveTerrain(
  mapId: string,
  terrain: unknown
): Promise<void> {
  const { map } = await staffForMap(mapId);
  const doc = normalizeTerrain(terrain);

  // Tokens that no longer have a floor under them are moved nowhere — they
  // stay, and the board shows them standing on nothing until the DM moves
  // them. Deleting a combatant's position because the DM erased a tile is a
  // silent loss; a token in the void is a visible one.
  await db
    .update(battleMaps)
    .set({ terrain: doc, updatedAt: new Date().toISOString() })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

export async function renameBattleMap(
  mapId: string,
  name: string
): Promise<void> {
  const { map } = await staffForMap(mapId);
  await db
    .update(battleMaps)
    .set({
      name: name.trim().slice(0, 120),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

export async function setBattleMapVisibility(
  mapId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const { map } = await staffForMap(mapId);
  await db
    .update(battleMaps)
    .set({ visibility, updatedAt: new Date().toISOString() })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/**
 * Put a board on the table, or take it off. At most one is active, cleared
 * first — the same shape `spotlightMap` and `createEncounter` use.
 *
 * Activating also binds the board to the campaign's active encounter, if one
 * is running and the board has none: "the fight on the table" and "the board
 * on the table" are usually the same evening.
 */
/**
 * Bind a board to the fight that is running now, and clear the last one off
 * it.
 *
 * A board keeps the id of the fight it was last used for, so its tokens
 * survive the evening; but the moment a new fight starts, last week's goblins
 * standing where they fell are furniture nobody asked for — they showed on
 * the DM's own board as a row of `?`, because their entries were in an order
 * that no longer exists. Tokens for entries of another fight go; scenery
 * (`entryId` null) stays, because a brazier is on the map and not in the
 * order. Idempotent: binding to the fight already bound touches nothing.
 */
export async function bindBoardToFight(
  mapId: string,
  encounterId: string
): Promise<void> {
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, mapId),
  });
  if (!map || map.encounterId === encounterId) return;

  const rows = await db
    .select({ id: battleMapTokens.id, entryId: battleMapTokens.entryId })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const linked = rows.filter(r => r.entryId !== null);
  if (linked.length > 0) {
    const here = new Set(
      (
        await db
          .select({ id: initiativeEntries.id })
          .from(initiativeEntries)
          .where(eq(initiativeEntries.encounterId, encounterId))
      ).map(r => r.id)
    );
    const stale = linked.filter(r => !here.has(r.entryId as string));
    if (stale.length > 0) {
      await db.delete(battleMapTokens).where(
        inArray(
          battleMapTokens.id,
          stale.map(r => r.id)
        )
      );
    }
  }

  await db
    .update(battleMaps)
    .set({ encounterId, updatedAt: new Date().toISOString() })
    .where(eq(battleMaps.id, mapId));
}

/** The board on the table at this campaign, if one is. */
export async function activeBoardId(
  campaignId: string
): Promise<string | null> {
  const map = await db.query.battleMaps.findFirst({
    columns: { id: true },
    where: and(
      eq(battleMaps.campaignId, campaignId),
      eq(battleMaps.isActive, true)
    ),
  });
  return map?.id ?? null;
}

export async function setBattleMapActive(
  mapId: string,
  active: boolean
): Promise<void> {
  const { map } = await staffForMap(mapId);

  await db
    .update(battleMaps)
    .set({ isActive: false })
    .where(eq(battleMaps.campaignId, map.campaignId));

  if (active) {
    /*
     * Bind to the fight that is running now, whatever the board remembered.
     * A board keeps the id of the last fight it was used for so its tokens
     * survive the evening; but "put it on the table" means tonight's fight,
     * and dealing tonight's combatants into last week's encounter dealt
     * nobody — found when a re-activated board reported "dealt: 0".
     */
    const fight = await db.query.initiativeEncounters.findFirst({
      columns: { id: true },
      where: and(
        eq(initiativeEncounters.campaignId, map.campaignId),
        eq(initiativeEncounters.isActive, true)
      ),
    });
    await db
      .update(battleMaps)
      .set({ isActive: true, updatedAt: new Date().toISOString() })
      .where(eq(battleMaps.id, mapId));
    if (fight) await bindBoardToFight(mapId, fight.id);
  }

  bumpVersion(map.campaignId);
}

export async function deleteBattleMap(mapId: string): Promise<void> {
  const { map } = await staffForMap(mapId);
  await db.delete(battleMaps).where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/* --- fog --------------------------------------------------------------- */

/**
 * Reveal tiles. Additive: a room once seen stays seen. Taking it back would
 * be claiming the party can be un-shown something, and the timeline of what
 * they know already refuses that shape for reveals.
 */
export async function revealTiles(
  mapId: string,
  indices: number[]
): Promise<void> {
  const { map } = await staffForMap(mapId);
  const doc = normalizeTerrain(map.terrain);
  const n = doc.w * doc.h;
  const revealed = revealedOf(map.revealed);
  for (const i of indices) {
    if (Number.isInteger(i) && i >= 0 && i < n) revealed.add(i);
  }
  await db
    .update(battleMaps)
    .set({ revealed: [...revealed], updatedAt: new Date().toISOString() })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/** Hide everything again. The one exception to "additive": a DM resetting a room. */
export async function resetFog(mapId: string): Promise<void> {
  const { map } = await staffForMap(mapId);
  await db
    .update(battleMaps)
    .set({ revealed: [], updatedAt: new Date().toISOString() })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/**
 * Reveal what the party can see: the union of `visibleFrom` over every
 * `shared` token that belongs to a party-side combatant, within a torch's
 * reach. One press for "you open the door and look in."
 */
export async function revealFromParty(
  mapId: string,
  radiusFeet = 40
): Promise<number> {
  const { map } = await staffForMap(mapId);
  const doc = normalizeTerrain(map.terrain);
  const tokens = await db
    .select({
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      entryId: battleMapTokens.entryId,
      visibility: battleMapTokens.visibility,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));

  const partyEntries = new Set<string>();
  if (map.encounterId) {
    const rows = await db
      .select({ id: initiativeEntries.id })
      .from(initiativeEntries)
      .where(
        and(
          eq(initiativeEntries.encounterId, map.encounterId),
          eq(initiativeEntries.side, 'party')
        )
      );
    for (const r of rows) partyEntries.add(r.id);
  }

  const revealed = revealedOf(map.revealed);
  const before = revealed.size;
  for (const t of tokens) {
    if (t.visibility !== 'shared') continue;
    if (!t.entryId || !partyEntries.has(t.entryId)) continue;
    for (const i of visibleFrom(doc, { x: t.x, y: t.y }, radiusFeet)) {
      revealed.add(i);
    }
  }

  await db
    .update(battleMaps)
    .set({ revealed: [...revealed], updatedAt: new Date().toISOString() })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
  return revealed.size - before;
}

/* --- tokens ------------------------------------------------------------ */

async function occupantsExcept(
  mapId: string,
  exceptId: string | null
): Promise<Occupant[]> {
  const rows = await db
    .select({
      id: battleMapTokens.id,
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      footprint: battleMapTokens.footprint,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  return rows.filter(r => r.id !== exceptId);
}

export interface TokenInput {
  entryId?: string | null;
  label?: string;
  x: number;
  y: number;
  footprint?: number;
  altitude?: number;
  tint?: string;
  visibility?: 'dm' | 'shared';
}

/**
 * Put a token down. Staff only. Refused if the footprint cannot stand there:
 * out of bounds, on void, on lava, on a pillar, or on somebody.
 *
 * An `entryId` must belong to the board's encounter — a goblin from March's
 * fight is not dealt into tonight's — and the partial unique index refuses a
 * second token for the same combatant.
 */
export async function placeToken(
  mapId: string,
  input: TokenInput
): Promise<string> {
  const { map } = await staffForMap(mapId);
  const doc = normalizeTerrain(map.terrain);

  if (input.entryId) {
    const entry = await db.query.initiativeEntries.findFirst({
      columns: { encounterId: true },
      where: eq(initiativeEntries.id, input.entryId),
    });
    if (!entry || entry.encounterId !== map.encounterId) {
      throw new Error('NOT_IN_THIS_FIGHT');
    }
  }

  const footprint = Math.max(1, Math.min(3, Math.trunc(input.footprint ?? 1)));
  const me: Occupant = { x: input.x, y: input.y, footprint };
  if (!canStand(doc, me, await occupantsExcept(mapId, null))) {
    throw new Error('CANNOT_STAND_THERE');
  }

  // The partial unique index refuses a second token for one combatant. Named
  // here rather than surfacing as a constraint error, so the DM is told what
  // happened instead of that something did.
  if (input.entryId) {
    const dup = await db.query.battleMapTokens.findFirst({
      columns: { id: true },
      where: and(
        eq(battleMapTokens.mapId, mapId),
        eq(battleMapTokens.entryId, input.entryId)
      ),
    });
    if (dup) throw new Error('ALREADY_ON_THE_BOARD');
  }

  const [row] = await db
    .insert(battleMapTokens)
    .values({
      mapId,
      entryId: input.entryId ?? null,
      label: (input.label ?? '').trim().slice(0, 60),
      x: input.x,
      y: input.y,
      altitude: Math.trunc(input.altitude ?? 0),
      footprint,
      tint: (input.tint ?? '').slice(0, 20),
      visibility: input.visibility ?? 'shared',
    })
    .returning({ id: battleMapTokens.id });

  bumpVersion(map.campaignId);
  return row.id;
}

/**
 * Deal every combatant in the board's encounter onto it, along the top edge,
 * skipping anybody already placed. The board equivalent of
 * `addPartyToEncounter`: pressing it twice is harmless.
 */
export async function dealEncounterIn(mapId: string): Promise<number> {
  const { map: found } = await staffForMap(mapId);
  // Tonight's fight, whatever the board remembered — the same rule
  // `setBattleMapActive` applies, so "Call for initiative → Deal them in"
  // deals tonight's order rather than nobody.
  const fight = await db.query.initiativeEncounters.findFirst({
    columns: { id: true },
    where: and(
      eq(initiativeEncounters.campaignId, found.campaignId),
      eq(initiativeEncounters.isActive, true)
    ),
  });
  if (fight) await bindBoardToFight(mapId, fight.id);
  const map = fight ? { ...found, encounterId: fight.id } : found;
  if (!map.encounterId) throw new Error('NO_FIGHT');
  const doc = normalizeTerrain(map.terrain);

  const entries = await db
    .select({ id: initiativeEntries.id, side: initiativeEntries.side })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, map.encounterId));
  const existing = await db
    .select({ entryId: battleMapTokens.entryId })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const already = new Set(existing.map(e => e.entryId));

  // Walk the board for the first standable tile each, party from the top-left
  // and foes from the bottom-right, so a fresh deal is two lines facing each
  // other rather than a pile in one corner.
  let dealt = 0;
  for (const e of entries) {
    if (already.has(e.id)) continue;
    const others = await occupantsExcept(mapId, null);
    let spot: { x: number; y: number } | null = null;
    const order: number[] = [];
    for (let i = 0; i < doc.w * doc.h; i++) order.push(i);
    if (e.side === 'foe') order.reverse();
    for (const i of order) {
      const x = i % doc.w;
      const y = Math.floor(i / doc.w);
      if (doc.material[i] === VOID) continue;
      if (canStand(doc, { x, y, footprint: 1 }, others)) {
        spot = { x, y };
        break;
      }
    }
    if (!spot) break;
    await db.insert(battleMapTokens).values({
      mapId,
      entryId: e.id,
      x: spot.x,
      y: spot.y,
      visibility: e.side === 'foe' ? 'dm' : 'shared',
    });
    dealt += 1;
  }

  bumpVersion(map.campaignId);
  return dealt;
}

/**
 * Move a token. The one write a player may make to the board.
 *
 * A player may move a token for their own seated character and nothing else;
 * staff may move anything. The destination is checked against the rules —
 * bounds, void, occupancy — and refused rather than trusted. **Distance is
 * not enforced here** on purpose: a DM says "you can't get there this turn"
 * and the table agrees, and the ghosted reach on the board is advice rather
 * than a fence. A later phase can fence it once movement speed is on the
 * sheet.
 */
export async function moveToken(
  tokenId: string,
  to: { x: number; y: number }
): Promise<void> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, token.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');

  const { role, userId } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  if (!isStaffRole(role)) {
    if (!token.entryId) throw new Error('NOT_YOUR_TOKEN');
    const membership = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, map.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    const entry = await db.query.initiativeEntries.findFirst({
      columns: { characterId: true },
      where: eq(initiativeEntries.id, token.entryId),
    });
    if (
      !membership?.characterId ||
      !entry?.characterId ||
      entry.characterId !== membership.characterId
    ) {
      throw new Error('NOT_YOUR_TOKEN');
    }
  }

  const doc = normalizeTerrain(map.terrain);
  if (!inBounds(doc, to.x, to.y)) throw new Error('CANNOT_STAND_THERE');
  const me: Occupant = { x: to.x, y: to.y, footprint: token.footprint };
  if (!canStand(doc, me, await occupantsExcept(map.id, tokenId))) {
    throw new Error('CANNOT_STAND_THERE');
  }

  await db
    .update(battleMapTokens)
    .set({ x: to.x, y: to.y, updatedAt: new Date().toISOString() })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
}

export async function updateToken(
  tokenId: string,
  patch: Partial<Pick<TokenInput, 'label' | 'altitude' | 'tint' | 'visibility'>>
): Promise<void> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const { map } = await staffForMap(token.mapId);
  await db
    .update(battleMapTokens)
    .set({
      ...(patch.label !== undefined
        ? { label: patch.label.trim().slice(0, 60) }
        : {}),
      ...(patch.altitude !== undefined
        ? { altitude: Math.trunc(patch.altitude) }
        : {}),
      ...(patch.tint !== undefined ? { tint: patch.tint.slice(0, 20) } : {}),
      ...(patch.visibility !== undefined
        ? { visibility: patch.visibility }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
}

export async function removeToken(tokenId: string): Promise<void> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const { map } = await staffForMap(token.mapId);
  await db.delete(battleMapTokens).where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
}
