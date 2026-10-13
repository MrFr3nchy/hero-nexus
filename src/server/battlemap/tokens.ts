import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import {
  canStand,
  footprintTiles,
  standingIssue,
  visibleFrom,
  type Occupant,
} from '@/@creator/campaign/lib/battlemap';
import {
  defaultLevelId,
  FACINGS,
  footprintForSize,
  inBounds,
  ITEM_STATES,
  levelOf,
  normalizeBoard,
  VOID,
  type Facing,
  type ItemState,
} from '@/@shared/battlemap/types';
import type { CharacterSheet } from '@/@creator/character/schema';

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
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { getCampaignImage } from '../campaign-images';
import { requireCampaignRole } from '../campaigns';
import { bumpVersion, publish } from '../live-hub';
import { rateLimit } from '../rate-limit';
import { resolveContentRefs } from '../content';
import { heroDarkvision } from '@/@creator/campaign/lib/vision';
import {
  blocksStanding,
  normalizeThingEffect,
} from '@/@shared/battlemap/types';
import { isStaffRole, levelFor, revealedOf, staffForMap } from './shared';
import { refuseStanding } from './movement';
import { bindBoardToFight } from './authoring';
import { PARTY_SIGHT_FEET } from './fog';
import { nameOf } from './thing-actions';

/**
 * What stands on the board: placing, editing, hiding and removing tokens,
 * and a ping.
 */
export async function occupantsExcept(
  mapId: string,
  exceptId: string | null,
  levelId: string
): Promise<Occupant[]> {
  const rows = await db
    .select({
      id: battleMapTokens.id,
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      level: battleMapTokens.level,
      footprint: battleMapTokens.footprint,
      state: battleMapTokens.state,
      effect: battleMapTokens.effect,
    })
    .from(battleMapTokens)
    .where(
      and(eq(battleMapTokens.mapId, mapId), eq(battleMapTokens.level, levelId))
    );
  // An open door and a smashed chest are walked through, and so is a plate
  // that fires when stepped on; the same rule the boards apply when they
  // light a token's reach. One floor at a time: a barrel in the cellar is
  // not under the foyer.
  return rows.filter(r => r.id !== exceptId && blocksStanding(r));
}

export interface TokenInput {
  entryId?: string | null;
  label?: string;
  visionFeet?: number | null;
  lightFeet?: number | null;
  x: number;
  y: number;
  /** The floor; the ground floor when absent. */
  level?: string;
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
  entries: { id: string; creatureRef: unknown; characterId?: string | null }[]
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
      bySize.set(key, footprintForSize(d.size));
    }
  }
  // Heroes off the sheet's size (09): a Small halfling and a Large hero
  // under Enlarge both read the same table the monsters do.
  const characterIds = entries
    .map(e => e.characterId ?? null)
    .filter((id): id is string => id !== null);
  const heroSize = new Map<string, number>();
  if (characterIds.length > 0) {
    const rows = await db
      .select({ id: characters.id, sheet: characters.sheet })
      .from(characters)
      .where(inArray(characters.id, characterIds));
    for (const r of rows) {
      heroSize.set(
        r.id,
        footprintForSize((r.sheet as CharacterSheet).identity?.size)
      );
    }
  }
  const out = new Map<string, number>();
  for (const e of entries) {
    const ref = e.creatureRef as ContentRef | null;
    out.set(
      e.id,
      ref
        ? (bySize.get(refKey(ref)) ?? 1)
        : e.characterId
          ? (heroSize.get(e.characterId) ?? 1)
          : 1
    );
  }
  return out;
}

/**
 * How far each combatant sees in the dark (08): a monster's darkvision off
 * its block, a hero's off the sheet's `senses` or their species. Null for
 * normal sight. Shared by the deal and by placing one by hand.
 */
async function visionFor(
  entries: { id: string }[]
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (entries.length === 0) return out;
  const rows = await db
    .select({
      id: initiativeEntries.id,
      characterId: initiativeEntries.characterId,
      creatureRef: initiativeEntries.creatureRef,
    })
    .from(initiativeEntries)
    .where(
      inArray(
        initiativeEntries.id,
        entries.map(e => e.id)
      )
    );
  const refs = new Map<string, ContentRef>();
  for (const r of rows) {
    const ref = r.creatureRef as ContentRef | null;
    if (ref) refs.set(refKey(ref), ref);
  }
  const dark = new Map<string, number>();
  if (refs.size > 0) {
    const resolved = await resolveContentRefs([...refs.values()]);
    for (const [key, entry] of resolved) {
      if (entry.type !== 'creature') continue;
      const d = parseContentData('creature', entry.data) as CreatureData;
      dark.set(key, d.darkvision);
    }
  }
  const characterIds = rows
    .map(r => r.characterId)
    .filter((id): id is string => id !== null);
  const sheets = new Map(
    characterIds.length > 0
      ? (
          await db
            .select({ id: characters.id, sheet: characters.sheet })
            .from(characters)
            .where(inArray(characters.id, characterIds))
        ).map(c => [c.id, c.sheet as CharacterSheet])
      : []
  );
  for (const r of rows) {
    const sheet = r.characterId ? sheets.get(r.characterId) : undefined;
    if (sheet) {
      out.set(r.id, heroDarkvision(sheet));
      continue;
    }
    const ref = r.creatureRef as ContentRef | null;
    const feet = ref ? dark.get(refKey(ref)) : undefined;
    out.set(r.id, feet && feet > 0 ? feet : null);
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
  const board = normalizeBoard(map.terrain);
  const doc = levelOf(board, input.level);

  let footprint = Math.max(1, Math.min(3, Math.trunc(input.footprint ?? 1)));
  if (input.entryId) {
    const entry = await db.query.initiativeEntries.findFirst({
      columns: {
        id: true,
        encounterId: true,
        creatureRef: true,
        characterId: true,
      },
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
    standingIssue(doc, me, await occupantsExcept(mapId, null, doc.id)),
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

  const vision =
    input.visionFeet !== undefined
      ? input.visionFeet
      : input.entryId
        ? ((await visionFor([{ id: input.entryId }])).get(input.entryId) ??
          null)
        : null;

  const [row] = await db
    .insert(battleMapTokens)
    .values({
      mapId,
      entryId: input.entryId ?? null,
      label: (input.label ?? '').trim().slice(0, 60),
      x: input.x,
      y: input.y,
      level: doc.id,
      altitude: Math.trunc(input.altitude ?? 0),
      footprint,
      visionFeet: vision,
      lightFeet: input.lightFeet ?? null,
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
 * Drop a thing on the board near a tile — a thrown tankard where it landed
 * (09). Not a door or a chest: a scenery token with a name and nothing to
 * open, on the first tile that can hold it, ringing outward from `near`. No
 * role check: the caller has already decided whose throw it was. Returns
 * the token's id, or null when nothing within two tiles could take it.
 */
export async function dropThingNear(
  mapId: string,
  near: { x: number; y: number; level?: string },
  label: string
): Promise<string | null> {
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, mapId),
  });
  if (!map) return null;
  const board = normalizeBoard(map.terrain);
  const doc = levelOf(board, near.level);
  const others = await occupantsExcept(mapId, null, doc.id);
  const ring: { x: number; y: number }[] = [];
  for (let r = 0; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push({ x: near.x + dx, y: near.y + dy });
      }
    }
  }
  const spot = ring.find(
    t =>
      inBounds(doc, t.x, t.y) && canStand(doc, { ...t, footprint: 1 }, others)
  );
  if (!spot) return null;
  const [row] = await db
    .insert(battleMapTokens)
    .values({
      mapId,
      entryId: null,
      label: label.trim().slice(0, 60) || 'Something',
      x: spot.x,
      y: spot.y,
      level: doc.id,
      footprint: 1,
      visibility: 'shared',
      state: null,
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
  const board = normalizeBoard(map.terrain);

  const entries = await db
    .select({
      id: initiativeEntries.id,
      side: initiativeEntries.side,
      creatureRef: initiativeEntries.creatureRef,
      characterId: initiativeEntries.characterId,
    })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, map.encounterId));

  const footprints = await footprintsFor(entries);
  const footprintOf = (e: (typeof entries)[number]) =>
    footprints.get(e.id) ?? 1;
  const visions = await visionFor(entries);

  const existing = await db
    .select({
      entryId: battleMapTokens.entryId,
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      level: battleMapTokens.level,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const already = new Set(existing.map(e => e.entryId));
  // The floor the party is on, if it is on one; else the ground floor. A
  // deal into a house puts everybody where the fight is.
  const partyIds0 = new Set(
    entries.filter(e => e.side === 'party').map(e => e.id)
  );
  const partyFloor = existing.find(
    t => t.entryId && partyIds0.has(t.entryId)
  )?.level;
  const doc = levelOf(board, partyFloor ?? defaultLevelId(board));

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
    if (levelFor(board, t).id !== doc.id) continue;
    for (const i of visibleFrom(doc, { x: t.x, y: t.y }, PARTY_SIGHT_FEET)) {
      lit.add(i);
    }
  }
  const inTheOpen = (x: number, y: number, footprint: number) =>
    footprintTiles(doc, { x, y, footprint }).some(i => lit.has(i));

  /*
   * Where the party walks in. If the DM has revealed any of this floor in
   * the workshop, that is the approach — the path to the door, the first
   * room — and the party stands on it, at the tile nearest the board's edge,
   * which is the end they came in by. Only with nothing revealed does the
   * old walk from the top-left apply, which on a wooded board put the party
   * in the far corner behind the trees.
   */
  const shownHere = revealedOf(map.revealed, board).get(doc.id);
  const approach: number[] = [];
  if (shownHere && shownHere.size > 0) {
    const edgeDistance = (i: number) => {
      const x = i % doc.w;
      const y = Math.floor(i / doc.w);
      return Math.min(x, y, doc.w - 1 - x, doc.h - 1 - y);
    };
    approach.push(
      ...[...shownHere].sort((a, b) => edgeDistance(a) - edgeDistance(b))
    );
  }

  // Walk the board for the first standable tile each, party from the top-left
  // and foes from the bottom-right, so a fresh deal is two lines facing each
  // other rather than a pile in one corner.
  let dealt = 0;
  for (const e of entries) {
    if (already.has(e.id)) continue;
    const footprint = footprintOf(e);
    const others = await occupantsExcept(mapId, null, doc.id);
    let spot: { x: number; y: number } | null = null;
    const order: number[] = [];
    if (e.side === 'party') order.push(...approach);
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
      level: doc.id,
      footprint,
      visionFeet: visions.get(e.id) ?? null,
      /*
       * Dealt shared, and hidden by the fog rather than by a flag.
       *
       * Foes used to be dealt `dm`-only, which meant six foes were six
       * presses of *Show them* before the party could see any of them —
       * and the fog was already hiding them, because a player is served no
       * token whose footprint is not on a revealed tile. Two mechanisms
       * hiding one thing meant the DM had to remember to undo one of them
       * mid-fight. `dm` is still there for the exception the DM marks by
       * hand: the assassin on the balcony, in plain sight and not to be
       * seen.
       */
      visibility: 'shared',
    });
    dealt += 1;
  }

  bumpVersion(map.campaignId);
  return dealt;
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
      | 'visionFeet'
      | 'lightFeet'
      | 'level'
    >
  >
): Promise<void> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const { map } = await staffForMap(token.mapId);

  // Moved to another floor by hand — the DM's "put the wight in the
  // cellar" — on the same tile, which has to be able to hold it.
  let level: string | undefined;
  if (patch.level !== undefined) {
    const board = normalizeBoard(map.terrain);
    const doc = levelOf(board, patch.level);
    if (doc.id !== levelFor(board, token).id) {
      const issue = standingIssue(
        doc,
        { x: token.x, y: token.y, footprint: token.footprint },
        await occupantsExcept(map.id, tokenId, doc.id)
      );
      if (issue !== null && issue !== 'terrain') {
        throw new Error('CANNOT_STAND_THERE');
      }
      level = doc.id;
    }
  }

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
      ...(level !== undefined ? { level } : {}),
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
      ...(patch.visionFeet !== undefined
        ? {
            visionFeet:
              patch.visionFeet === null
                ? null
                : Math.max(0, Math.min(1000, Math.trunc(patch.visionFeet))) ||
                  null,
          }
        : {}),
      ...(patch.lightFeet !== undefined
        ? {
            lightFeet:
              patch.lightFeet === null
                ? null
                : Math.max(0, Math.min(1000, Math.trunc(patch.lightFeet))) ||
                  null,
          }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
}

/**
 * What a thing does when used (08). Staff only. The whole effect, replaced;
 * null takes it away. A `findDc` hides the thing until found — its
 * visibility flips to `dm` here so the author does not have to remember.
 */
export async function setThingEffect(
  tokenId: string,
  effect: unknown
): Promise<void> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  if (token.entryId) throw new Error('NOT_A_THING');
  const { map } = await staffForMap(token.mapId);
  const clean = normalizeThingEffect(effect);
  await db
    .update(battleMapTokens)
    .set({
      effect: clean,
      ...(clean?.findDc ? { visibility: 'dm' as const } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
}

/**
 * Show, or hide, every token on a board at once — optionally only one side
 * of the fight.
 *
 * The one-at-a-time control is still there and is what a single hidden
 * assassin wants. This is for the other case: a fight of six whose ambush
 * is over, where six presses said nothing six times.
 */
export async function setAllTokenVisibility(
  mapId: string,
  visibility: 'dm' | 'shared',
  side: 'foe' | 'party' | 'all' = 'foe'
): Promise<number> {
  const { map } = await staffForMap(mapId);

  let ids: string[] | null = null;
  if (side !== 'all' && map.encounterId) {
    const entries = await db
      .select({ id: initiativeEntries.id })
      .from(initiativeEntries)
      .where(
        and(
          eq(initiativeEntries.encounterId, map.encounterId),
          eq(initiativeEntries.side, side)
        )
      );
    const wanted = new Set(entries.map(e => e.id));
    const tokens = await db
      .select({ id: battleMapTokens.id, entryId: battleMapTokens.entryId })
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, mapId));
    ids = tokens
      .filter(t => t.entryId !== null && wanted.has(t.entryId))
      .map(t => t.id);
    if (ids.length === 0) return 0;
  }

  await db
    .update(battleMapTokens)
    .set({ visibility })
    .where(
      ids
        ? and(
            eq(battleMapTokens.mapId, mapId),
            inArray(battleMapTokens.id, ids)
          )
        : eq(battleMapTokens.mapId, mapId)
    );

  bumpVersion(map.campaignId);
  return ids ? ids.length : 1;
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

/**
 * Point at a tile, for everybody looking at the board (a ping).
 *
 * A moment, not a fact: nothing is written, and a table that missed it has
 * missed nothing it cannot ask about. Anybody at the table may ping the
 * board in play; staff may ping a board the party cannot see, and then only
 * staff are told. A floor the reader has not been shown is not in their
 * document, and the board drops a ping aimed at one — the payload names a
 * floor id and a tile, never what is on it.
 */
export async function pingBoard(
  mapId: string,
  at: { level: string; x: number; y: number }
): Promise<void> {
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const { userId, role } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const shared = map.isActive && map.visibility === 'shared';
  if (!isStaffRole(role) && !shared) throw new Error('NOT_FOUND');
  const board = normalizeBoard(map.terrain);
  const level = board.levels.find(l => l.id === at.level);
  if (!level || !inBounds(level, at.x, at.y)) throw new Error('NOT_FOUND');
  // A finger held on the board is not a stream of pings.
  if (!rateLimit(`ping:${userId}`, 6, 10_000).ok) {
    throw new Error('SLOW_DOWN');
  }
  publish(
    map.campaignId,
    {
      kind: 'ping',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      mapId,
      level: at.level,
      x: at.x,
      y: at.y,
      name: await nameOf(userId, map.campaignId),
    },
    shared ? 'everyone' : 'staff'
  );
}
