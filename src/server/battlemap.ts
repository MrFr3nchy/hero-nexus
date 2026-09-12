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
 *    stored document with parts hidden.
 * 2. **A position the browser produced is a claim, not a record.** Moves are
 *    validated against the rules in `lib/battlemap.ts` — bounds, void,
 *    occupancy — and refused rather than trusted. Standing in lava is the
 *    one refusal the table's Advise / Enforce switch governs (`fence`):
 *    advising, the board says it is lava and lets you; enforcing, it
 *    refuses, and staff may rule past it.
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
  standingIssue,
  visibleFrom,
  type Occupant,
} from '@/@creator/campaign/lib/battlemap';
import {
  blocksTile,
  emptyTerrain,
  FACINGS,
  inBounds,
  ITEM_STATES,
  normalizeTerrain,
  VOID,
  type Facing,
  type ItemState,
  type TerrainDoc,
} from '@/@shared/battlemap/types';
import { skillBonus } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import { rollDie } from '@/@shared/lib/dice';
import { randomUUID } from 'node:crypto';
import {
  parseContentData,
  refKey,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEncounters,
  initiativeEntries,
  users,
} from '@/db/schema';
import { getCampaignImage, imageUrl } from './campaign-images';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { resolveContentRefs } from './content';
import { effectiveRules, fence } from './table-rules';

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
  /**
   * What it is, when it is a thing rather than a somebody: open, closed,
   * locked or broken. Null for a boulder, and for every combatant. Open and
   * broken things do not block their tile.
   */
  state: ItemState | null;
  /** What picking the lock is rolled against. Staff only; null on the wire otherwise. */
  lockDc: number | null;
  /** Hit points, for a thing that can be broken. Staff only; null for players. */
  hpCurrent: number | null;
  hpMax: number | null;
  /** Whether it can be broken at all — true when it has hit points. Everybody. */
  breakable: boolean;
  /** Which way a picture faces: the camera, or a compass side, standing still. */
  facing: Facing;
  /** The campaign image it stands up as, if the DM gave it one. */
  imageId: string | null;
  /**
   * That image's URL, composed here so neither board learns the route. The
   * route is role-checked on its own, so a player who guesses one gets the
   * same answer the handout route gives.
   */
  imageUrl: string | null;
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
      state: t.state,
      // The DC and the numbers are the DM's, the way a foe's are: a player
      // sees that a thing is locked and that it can be broken, not what it
      // takes.
      lockDc: isStaff ? t.lockDc : null,
      hpCurrent: isStaff ? t.hpCurrent : null,
      hpMax: isStaff ? t.hpMax : null,
      breakable: t.hpMax !== null,
      facing: t.facing,
      imageId: t.imageId,
      imageUrl: t.imageId ? imageUrl(campaignId, t.imageId) : null,
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

/**
 * Tiles a side, by creature size. Tiny through Medium share a tile; Large is
 * two, Huge three, and Gargantuan is capped at the board's three — the
 * token model's ceiling, and a 20-foot dragon on a 40-foot board is a
 * different problem.
 */
const FOOTPRINT_BY_SIZE: Record<string, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 3,
};

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

/**
 * One board's whole terrain, for staff planning on it. Not `getBattleMapState`:
 * that is the table's fogged, role-filtered read of the active board; this
 * is the DM looking at any board of theirs in prep.
 */
export async function getBoardTerrain(mapId: string): Promise<{
  id: string;
  name: string;
  terrain: TerrainDoc;
  /** Where things already stand, so a plan does not put a goblin in the well. */
  taken: { x: number; y: number; footprint: number }[];
}> {
  const { map } = await staffForMap(mapId);
  const tokens = await db
    .select({
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      footprint: battleMapTokens.footprint,
      state: battleMapTokens.state,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  return {
    id: map.id,
    name: map.name,
    terrain: normalizeTerrain(map.terrain),
    taken: tokens
      .filter(t => blocksTile(t.state as ItemState | null))
      .map(t => ({ x: t.x, y: t.y, footprint: t.footprint })),
  };
}

/* --- authoring --------------------------------------------------------- */

export async function createBattleMap(
  campaignId: string,
  input: { name?: string; w: number; h: number; material?: number }
): Promise<string> {
  const { userId } = await staff(campaignId);
  const [row] = await db
    .insert(battleMaps)
    .values({
      campaignId,
      name: (input.name ?? '').trim().slice(0, 120),
      terrain: emptyTerrain(input.w, input.h, input.material ?? VOID),
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

/** How far the party sees when the board is lit from it or dealt around it. */
const PARTY_SIGHT_FEET = 40;

/**
 * Reveal what the party can see: the union of `visibleFrom` over every
 * `shared` token that belongs to a party-side combatant, within a torch's
 * reach. One press for "you open the door and look in."
 */
export async function revealFromParty(
  mapId: string,
  radiusFeet = PARTY_SIGHT_FEET
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
      state: battleMapTokens.state,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  // An open door and a smashed chest are walked through; the same rule the
  // boards apply when they light a token's reach.
  return rows.filter(r => r.id !== exceptId && blocksTile(r.state));
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
  /** Scenery only: what it stands up as, what it is, what it takes. */
  imageId?: string | null;
  state?: ItemState | null;
  lockDc?: number | null;
  /** Null or absent is indestructible. */
  hpMax?: number | null;
  facing?: Facing;
}

/** Clamp what a thing may be told about itself. */
function itemFields(input: {
  state?: ItemState | null;
  lockDc?: number | null;
  hpMax?: number | null;
  facing?: Facing;
}) {
  const state =
    input.state && ITEM_STATES.includes(input.state) ? input.state : null;
  const lockDc =
    input.lockDc === null || input.lockDc === undefined
      ? null
      : Math.max(1, Math.min(40, Math.trunc(input.lockDc)));
  const hpMax =
    input.hpMax === null || input.hpMax === undefined
      ? null
      : Math.max(1, Math.min(9999, Math.trunc(input.hpMax)));
  const facing =
    input.facing && FACINGS.includes(input.facing) ? input.facing : undefined;
  return { state, lockDc, hpMax, facing };
}

/**
 * How many tiles a side each combatant stands on, read off the creature it
 * was dealt from: an ogre is Large and takes four. Resolved once per distinct
 * creature rather than per copy — six goblins are one bestiary read — and a
 * hand-typed combatant, with no reference to read, is medium. Shared by the
 * deal and by placing one combatant by hand, so the two cannot disagree.
 */
async function footprintsFor(
  entries: { id: string; creatureRef: unknown }[]
): Promise<Map<string, number>> {
  const refs = new Map<string, ContentRef>();
  for (const e of entries) {
    const ref = e.creatureRef as ContentRef | null;
    if (ref) refs.set(refKey(ref), ref);
  }
  const bySize = new Map<string, number>();
  if (refs.size > 0) {
    const resolved = await resolveContentRefs([...refs.values()]);
    for (const [key, entry] of resolved) {
      if (entry.type !== 'creature') continue;
      const d = parseContentData('creature', entry.data) as CreatureData;
      bySize.set(key, FOOTPRINT_BY_SIZE[d.size] ?? 1);
    }
  }
  const out = new Map<string, number>();
  for (const e of entries) {
    const ref = e.creatureRef as ContentRef | null;
    out.set(e.id, ref ? (bySize.get(refKey(ref)) ?? 1) : 1);
  }
  return out;
}

/**
 * Put a token down. Staff only. Refused if the footprint cannot stand there:
 * out of bounds, on void, on somebody — and, through the table's fence, on
 * lava or a pillar.
 *
 * An `entryId` must belong to the board's encounter — a goblin from March's
 * fight is not dealt into tonight's — and the partial unique index refuses a
 * second token for the same combatant. A combatant's footprint comes off its
 * creature unless the caller says otherwise, so "place Ogre 2" stands it on
 * four tiles without the DM knowing an ogre is Large.
 */
export async function placeToken(
  mapId: string,
  input: TokenInput & { ruling?: boolean }
): Promise<string> {
  const { map } = await staffForMap(mapId);
  const doc = normalizeTerrain(map.terrain);

  let footprint = Math.max(1, Math.min(3, Math.trunc(input.footprint ?? 1)));
  if (input.entryId) {
    const entry = await db.query.initiativeEntries.findFirst({
      columns: { id: true, encounterId: true, creatureRef: true },
      where: eq(initiativeEntries.id, input.entryId),
    });
    if (!entry || entry.encounterId !== map.encounterId) {
      throw new Error('NOT_IN_THIS_FIGHT');
    }
    if (input.footprint === undefined) {
      footprint = (await footprintsFor([entry])).get(entry.id) ?? 1;
    }
  }

  const me: Occupant = { x: input.x, y: input.y, footprint };
  await refuseStanding(
    standingIssue(doc, me, await occupantsExcept(mapId, null)),
    map.campaignId,
    map.encounterId,
    { isStaff: true, ruling: input.ruling }
  );

  if (input.imageId) {
    const image = await getCampaignImage(input.imageId);
    if (!image || image.campaignId !== map.campaignId) {
      throw new Error('NO_SUCH_IMAGE');
    }
  }
  // A combatant is a somebody: it is not open, locked or breakable here. Its
  // hit points are on the sheet and in the order.
  const item = input.entryId ? itemFields({}) : itemFields(input);

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
      imageId: input.entryId ? null : (input.imageId ?? null),
      state: item.state,
      lockDc: item.lockDc,
      hpMax: item.hpMax,
      hpCurrent: item.hpMax,
      facing: item.facing ?? 'camera',
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
    .select({
      id: initiativeEntries.id,
      side: initiativeEntries.side,
      creatureRef: initiativeEntries.creatureRef,
    })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, map.encounterId));

  const footprints = await footprintsFor(entries);
  const footprintOf = (e: (typeof entries)[number]) =>
    footprints.get(e.id) ?? 1;

  const existing = await db
    .select({
      entryId: battleMapTokens.entryId,
      x: battleMapTokens.x,
      y: battleMapTokens.y,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const already = new Set(existing.map(e => e.entryId));

  /*
   * What the party can see from where it already stands, so a foe is dealt
   * into the dark rather than into the open: an ambush the party watched
   * being set up is not one. The same radius "reveal from party" uses. With
   * nobody of the party on the board yet, nothing is lit and the foes take
   * the far edge as before.
   */
  const partyIds = new Set(
    entries.filter(e => e.side === 'party').map(e => e.id)
  );
  const lit = new Set<number>();
  for (const t of existing) {
    if (!t.entryId || !partyIds.has(t.entryId)) continue;
    for (const i of visibleFrom(doc, { x: t.x, y: t.y }, PARTY_SIGHT_FEET)) {
      lit.add(i);
    }
  }
  const inTheOpen = (x: number, y: number, footprint: number) =>
    footprintTiles(doc, { x, y, footprint }).some(i => lit.has(i));

  // Walk the board for the first standable tile each, party from the top-left
  // and foes from the bottom-right, so a fresh deal is two lines facing each
  // other rather than a pile in one corner.
  let dealt = 0;
  for (const e of entries) {
    if (already.has(e.id)) continue;
    const footprint = footprintOf(e);
    const others = await occupantsExcept(mapId, null);
    let spot: { x: number; y: number } | null = null;
    const order: number[] = [];
    for (let i = 0; i < doc.w * doc.h; i++) order.push(i);
    if (e.side === 'foe') order.reverse();
    const find = (avoidLit: boolean) => {
      for (const i of order) {
        const x = i % doc.w;
        const y = Math.floor(i / doc.w);
        if (doc.material[i] === VOID) continue;
        if (avoidLit && inTheOpen(x, y, footprint)) continue;
        if (canStand(doc, { x, y, footprint }, others)) return { x, y };
      }
      return null;
    };
    // A foe stands in the dark when there is any; on a board lit end to end
    // it stands where it can, because a fight with no foes on it is worse.
    spot = e.side === 'foe' ? (find(true) ?? find(false)) : find(false);
    if (!spot) break;
    await db.insert(battleMapTokens).values({
      mapId,
      entryId: e.id,
      x: spot.x,
      y: spot.y,
      footprint,
      visibility: e.side === 'foe' ? 'dm' : 'shared',
    });
    dealt += 1;
  }

  bumpVersion(map.campaignId);
  return dealt;
}

/**
 * A standing refusal, sorted into the two kinds `standingIssue` tells apart.
 *
 * Off the board, on no board, or on somebody: refused for everyone, always.
 * Lava or a pillar: the rules, so it goes through the table's fence — nothing
 * advising, a refusal staff can overrule enforcing.
 */
async function refuseStanding(
  issue: ReturnType<typeof standingIssue>,
  campaignId: string,
  encounterId: string | null,
  who: { isStaff: boolean; ruling?: boolean }
): Promise<void> {
  if (issue === null) return;
  if (issue !== 'terrain') throw new Error('CANNOT_STAND_THERE');
  const rules = await effectiveRules(campaignId, encounterId);
  fence('CANNOT_STAND_THERE', rules, who);
}

/**
 * Move a token. The one write a player may make to the board.
 *
 * A player may move a token for their own seated character and nothing else;
 * staff may move anything. The destination is checked against the rules —
 * bounds, void, occupancy — and refused rather than trusted. **Distance is
 * not enforced here** on purpose: a DM says "you can't get there this turn"
 * and the table agrees, and the ghosted reach on the board is advice rather
 * than a fence. The table's `movementFence` rule is where that fence will
 * live once movement is spent per turn (improvements 05).
 */
export async function moveToken(
  tokenId: string,
  to: { x: number; y: number },
  opts: { ruling?: boolean } = {}
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
  await refuseStanding(
    standingIssue(doc, me, await occupantsExcept(map.id, tokenId)),
    map.campaignId,
    map.encounterId,
    { isStaff: isStaffRole(role), ruling: opts.ruling }
  );

  await db
    .update(battleMapTokens)
    .set({ x: to.x, y: to.y, updatedAt: new Date().toISOString() })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
}

export async function updateToken(
  tokenId: string,
  patch: Partial<
    Pick<
      TokenInput,
      | 'label'
      | 'altitude'
      | 'tint'
      | 'visibility'
      | 'imageId'
      | 'state'
      | 'lockDc'
      | 'hpMax'
      | 'facing'
    >
  >
): Promise<void> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const { map } = await staffForMap(token.mapId);

  // A picture from another campaign's library is not this table's to stand
  // up: the id is checked against the campaign before it is kept.
  if (patch.imageId) {
    const image = await getCampaignImage(patch.imageId);
    if (!image || image.campaignId !== map.campaignId) {
      throw new Error('NO_SUCH_IMAGE');
    }
  }

  const item = itemFields(patch);
  // A new maximum resets the current: the DM re-describing a door as "40
  // hit points" is describing a whole door.
  const hp =
    patch.hpMax !== undefined
      ? { hpMax: item.hpMax, hpCurrent: item.hpMax }
      : {};

  await db
    .update(battleMapTokens)
    .set({
      ...(patch.imageId !== undefined ? { imageId: patch.imageId } : {}),
      ...(patch.state !== undefined ? { state: item.state } : {}),
      ...(patch.lockDc !== undefined ? { lockDc: item.lockDc } : {}),
      ...hp,
      ...(item.facing ? { facing: item.facing } : {}),
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

/* --- doing something to a thing ------------------------------------------ */

/**
 * Whether the reader's own character is beside a thing on the board — one
 * tile away from any tile of its footprint. Staff reach everything; a player
 * has to be there, which is what "I open the door" means at a table.
 */
async function withinReach(
  map: typeof battleMaps.$inferSelect,
  thing: typeof battleMapTokens.$inferSelect,
  userId: string,
  role: CampaignRole
): Promise<boolean> {
  if (isStaffRole(role)) return true;
  const seat = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, map.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (!seat?.characterId || !map.encounterId) return false;
  const mine = await db
    .select({
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      footprint: battleMapTokens.footprint,
    })
    .from(battleMapTokens)
    .innerJoin(
      initiativeEntries,
      eq(initiativeEntries.id, battleMapTokens.entryId)
    )
    .where(
      and(
        eq(battleMapTokens.mapId, map.id),
        eq(initiativeEntries.encounterId, map.encounterId),
        eq(initiativeEntries.characterId, seat.characterId)
      )
    );
  const gap = (a: number, aSize: number, b: number, bSize: number) =>
    Math.max(0, Math.max(a, b) - Math.min(a + aSize, b + bSize) + 1);
  return mine.some(
    m =>
      gap(m.x, m.footprint, thing.x, thing.footprint) <= 1 &&
      gap(m.y, m.footprint, thing.y, thing.footprint) <= 1
  );
}

async function thingAndMap(tokenId: string) {
  const thing = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!thing) throw new Error('NOT_FOUND');
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, thing.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const { userId, role } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  // A combatant is not a thing to open.
  if (thing.entryId) throw new Error('NOT_A_THING');
  return { thing, map, userId, role };
}

async function nameOf(userId: string, campaignId: string): Promise<string> {
  const seat = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (seat?.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { name: true },
      where: eq(characters.id, seat.characterId),
    });
    if (c?.name) return c.name;
  }
  const u = await db.query.users.findFirst({
    columns: { name: true },
    where: eq(users.id, userId),
  });
  return u?.name?.trim() || 'The DM';
}

/**
 * Open or close a thing. Anyone beside it; a locked thing refuses, and says
 * so — the lock is picked or the thing is broken, not argued with.
 */
export async function operateThing(
  tokenId: string,
  verb: 'open' | 'close'
): Promise<void> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (thing.state === null) throw new Error('NOTHING_TO_DO');
  if (thing.state === 'broken') throw new Error('BROKEN');
  if (thing.state === 'locked') throw new Error('LOCKED');
  if (!(await withinReach(map, thing, userId, role))) {
    throw new Error('OUT_OF_REACH');
  }
  const next: ItemState = verb === 'open' ? 'open' : 'closed';
  if (next === thing.state) return;
  await db
    .update(battleMapTokens)
    .set({ state: next, updatedAt: new Date().toISOString() })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName: await nameOf(userId, map.campaignId),
    name: thing.label || 'Something',
    what: next === 'open' ? 'opened' : 'closed',
  });
}

/**
 * Pick the lock. Rolled on the server as a Dexterity (Sleight of Hand) check
 * off the reader's own sheet against the DC the DM set, the way every other
 * roll here is — a number the browser produced is a claim, not a record.
 * The roll lands in the shared log either way; the DC does not, and the
 * verdict says only whether the lock gave.
 */
export async function pickLock(
  tokenId: string,
  mode: 'straight' | 'advantage' | 'disadvantage' = 'straight'
): Promise<{ total: number; opened: boolean }> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (thing.state !== 'locked') throw new Error('NOT_LOCKED');
  if (!(await withinReach(map, thing, userId, role))) {
    throw new Error('OUT_OF_REACH');
  }

  const seat = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, map.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  const character = seat?.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, seat.characterId),
      })
    : null;
  const bonus = character
    ? skillBonus(character.sheet as CharacterSheet, 'sleightOfHand')
    : 0;

  const dice = mode === 'straight' ? [rollDie(20)] : [rollDie(20), rollDie(20)];
  const face =
    mode === 'advantage'
      ? Math.max(...dice)
      : mode === 'disadvantage'
        ? Math.min(...dice)
        : dice[0];
  const total = face + bonus;
  // No DC set is a lock that always gives: the DM said "locked" and not how
  // hard, and a lock nobody can ever pick is a wall.
  const opened = total >= (thing.lockDc ?? 10);
  const name = thing.label || 'the lock';

  await db.insert(campaignRolls).values({
    campaignId: map.campaignId,
    actorUserId: userId,
    characterId: character?.id ?? null,
    actorName: character?.name ?? (await nameOf(userId, map.campaignId)),
    label: `Pick the lock — ${name}`.slice(0, 80),
    notation: `${dice.length}d20${bonus >= 0 ? '+' : ''}${bonus}`,
    dice,
    dropped: dice.length === 2 ? [dice[0] === face ? 1 : 0] : [],
    modifier: bonus,
    total,
    visibility: 'table',
  });
  if (opened) {
    await db
      .update(battleMapTokens)
      .set({ state: 'closed', updatedAt: new Date().toISOString() })
      .where(eq(battleMapTokens.id, tokenId));
  }
  bumpVersion(map.campaignId);
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName: character?.name ?? (await nameOf(userId, map.campaignId)),
    name: thing.label || 'Something',
    what: opened ? 'unlocked' : 'held',
  });
  return { total, opened };
}

/**
 * Damage or mend a thing with hit points. Staff only, the way `applyHp` is
 * for a foe: the player rolls at it through the attacks panel and the DM
 * applies what landed. Broken at 0, and a broken thing no longer blocks.
 */
export async function damageThing(
  tokenId: string,
  delta: number
): Promise<void> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (!isStaffRole(role)) throw new Error('FORBIDDEN');
  if (thing.hpMax === null) throw new Error('INDESTRUCTIBLE');
  const before = thing.hpCurrent ?? thing.hpMax;
  const after = Math.max(0, Math.min(thing.hpMax, before + Math.trunc(delta)));
  const broken = after === 0;
  await db
    .update(battleMapTokens)
    .set({
      hpCurrent: after,
      // Mended above zero, a broken thing is closed again, not open: a
      // repaired door is a door.
      state: broken
        ? 'broken'
        : thing.state === 'broken'
          ? 'closed'
          : thing.state,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
  if (broken && before > 0) {
    publish(map.campaignId, {
      kind: 'thing',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName: await nameOf(userId, map.campaignId),
      name: thing.label || 'Something',
      what: 'broken',
    });
  }
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
