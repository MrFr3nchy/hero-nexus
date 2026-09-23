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
  canSee,
  canStand,
  distanceFeet,
  floodFill,
  foggedBoard,
  footprintTiles,
  landingFor,
  linkCostFeet,
  linksUnder,
  reachFor,
  standingIssue,
  visibleFrom,
  type Occupant,
  type Tile,
} from '@/@creator/campaign/lib/battlemap';
import {
  blocksTile,
  defaultLevelId,
  emptyTerrain,
  FACINGS,
  footprintForSize,
  inBounds,
  ITEM_STATES,
  levelOf,
  linkOtherEnd,
  normalizeBoard,
  VOID,
  withLevel,
  type BoardDoc,
  type Facing,
  type ItemState,
  type LevelDoc,
} from '@/@shared/battlemap/types';
import { skillBonus } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  d20Faces,
  d20Result,
  rollDie,
  type NotationRoll,
} from '@/@shared/lib/dice';
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
import { rateLimit } from './rate-limit';
import { recordUndo } from './undo';
import { setAmbience } from './audio';
import { resolveContentRefs } from './content';
import { effectiveRules, fence } from './table-rules';
import { claimedFaces } from './dice-claims';
import { spendMovement } from './turn';
import { parseTurn } from '@/@creator/campaign/lib/turn';
import {
  applyTerrainChanges,
  isTerrainChange,
  pathBetween,
  seesTile,
  type Torch,
} from '@/@creator/campaign/lib/things';
import { heroDarkvision } from '@/@creator/campaign/lib/vision';
import { adjustDamage } from '@/@creator/campaign/lib/attack';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import {
  abilityModifier,
  passivePerception,
  savingThrow,
} from '@/@creator/character/lib/derive';
import type { AbilityKey } from '@/@creator/character/schema';
import { rollNotation } from '@/@shared/lib/dice';
import {
  blocksStanding,
  normalizeThingEffect,
  type ThingEffect,
} from '@/@shared/battlemap/types';
import { putEffect } from './effects';
import { applyHpUnchecked } from './hp';

export interface BattleTokenRow {
  id: string;
  /** The combatant this stands for, or null for scenery. */
  entryId: string | null;
  /** Only meaningful when `entryId` is null. Otherwise read the entry. */
  label: string;
  x: number;
  y: number;
  /** The floor it stands on: a `LevelDoc` id in `terrain.levels`. */
  level: string;
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
  /**
   * Whether it stops a creature standing on its tile (08). False for open
   * and broken things and for anything that fires when stepped on — a plate
   * in plain sight is a plate you can step on. Everybody.
   */
  blocks: boolean;
  /** Which way a picture faces: the camera, or a compass side, standing still. */
  facing: Facing;
  /** What it does when used (08). Staff only; null on the wire otherwise. */
  effect: ThingEffect | null;
  /** Darkvision in feet; null for normal sight (08). */
  visionFeet: number | null;
  /** A carried light's bright radius; null for none (08). */
  lightFeet: number | null;
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
  /**
   * The board, floors and stairs. Fogged for a player — floor by floor,
   * and a floor the party has not set foot on or been shown is not in the
   * list at all; whole for staff.
   */
  terrain: BoardDoc;
  /** Revealed tile indices by floor id. Staff only; a player's is empty. */
  revealed: Record<string, number[]>;
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

/**
 * What the party has been shown, by floor. A stored array — every board
 * before floors — is the ground floor's; a floor the board no longer has
 * keeps nothing.
 */
function revealedOf(raw: unknown, board: BoardDoc): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const l of board.levels) out.set(l.id, new Set());
  const put = (levelId: string, list: unknown) => {
    const set = out.get(levelId);
    if (!set || !Array.isArray(list)) return;
    for (const v of list) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0) set.add(n);
    }
  };
  if (Array.isArray(raw)) put(defaultLevelId(board), raw);
  else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      put(k, v);
    }
  }
  return out;
}

/** The revealed map as the row stores it. */
function storeRevealed(
  revealed: Map<string, Set<number>>
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of revealed) out[k] = [...v];
  return out;
}

/** The floor a token stands on, as a terrain document. */
function levelFor(board: BoardDoc, token: { level: string }): LevelDoc {
  return levelOf(board, token.level);
}

/* --- reading ----------------------------------------------------------- */

/**
 * The board on the table, as this viewer is allowed to have it.
 *
 * Staff get the stored document and every token. A player gets:
 * - nothing at all if the board is `dm`;
 * - a **new** board with every unrevealed tile void at 0, floor by floor,
 *   and only the floors the party has seen anything of or is standing on —
 *   `foggedBoard` builds it; this function never hands back the stored one;
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

  const stored = normalizeBoard(map.terrain);
  const revealed = revealedOf(map.revealed, stored);

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

  const inFight = tokenRows.filter(
    t => t.entryId === null || inOrder.has(t.entryId)
  );
  /*
   * A player's floors: the ones the party has been shown something of, and
   * the ones a party member is standing on — a hero who climbs into the
   * dark attic is still on the board, and the attic is shown as far as
   * they have seen it, which the climb itself reveals.
   */
  const partyIds = new Set<string>();
  if (!isStaff && map.encounterId) {
    const rows = await db
      .select({ id: initiativeEntries.id })
      .from(initiativeEntries)
      .where(
        and(
          eq(initiativeEntries.encounterId, map.encounterId),
          eq(initiativeEntries.side, 'party')
        )
      );
    for (const r of rows) partyIds.add(r.id);
  }
  const trodden = new Set(
    inFight
      .filter(
        t => t.visibility === 'shared' && t.entryId && partyIds.has(t.entryId)
      )
      .map(t => levelFor(stored, t).id)
  );
  const terrain = isStaff ? stored : foggedBoard(stored, revealed, trodden);
  const shownLevels = new Set(terrain.levels.map(l => l.id));

  const tokens: BattleTokenRow[] = inFight
    .filter(t => {
      if (isStaff) return true;
      if (t.visibility !== 'shared') return false;
      const level = levelFor(stored, t);
      if (!shownLevels.has(level.id)) return false;
      // Every tile of the footprint must be revealed. A large creature half
      // in the dark is still a creature the party has not seen. A floor the
      // party always sees is revealed whole.
      if (level.seen === 'always') return true;
      const shown = revealed.get(level.id) ?? new Set<number>();
      return footprintTiles(level, t).every(i => shown.has(i));
    })
    .map(t => ({
      id: t.id,
      entryId: t.entryId,
      label: t.label,
      x: t.x,
      y: t.y,
      level: levelFor(stored, t).id,
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
      blocks: blocksStanding(t),
      effect: isStaff ? normalizeThingEffect(t.effect) : null,
      visionFeet: t.visionFeet,
      lightFeet: t.lightFeet,
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
    revealed: isStaff ? storeRevealed(revealed) : {},
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
    levels: number;
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
    const t = normalizeBoard(r.terrain);
    return {
      id: r.id,
      name: r.name,
      w: t.w,
      h: t.h,
      levels: t.levels.length,
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
  terrain: BoardDoc;
  /** Where things already stand, so a plan does not put a goblin in the well. */
  taken: { x: number; y: number; level: string; footprint: number }[];
}> {
  const { map } = await staffForMap(mapId);
  const board = normalizeBoard(map.terrain);
  const tokens = await db
    .select({
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      level: battleMapTokens.level,
      footprint: battleMapTokens.footprint,
      state: battleMapTokens.state,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  return {
    id: map.id,
    name: map.name,
    terrain: board,
    taken: tokens
      .filter(t => blocksTile(t.state as ItemState | null))
      .map(t => ({
        x: t.x,
        y: t.y,
        level: levelFor(board, t).id,
        footprint: t.footprint,
      })),
  };
}

/**
 * A board as the workshop has it: the whole document, every token with
 * the name and side off its entry, and what the party has been shown.
 * Staff only — it is the DM's bench. Not `getBattleMapState`: that is the
 * table's fogged read of the active board; this is any board of theirs,
 * on the table or on the shelf.
 */
/** A token on the bench: the board's row, with its side off the entry. */
export type WorkshopToken = BattleTokenRow & {
  side: 'party' | 'foe' | 'other' | null;
};

export interface WorkshopBoard {
  id: string;
  campaignId: string;
  name: string;
  visibility: 'dm' | 'shared';
  isActive: boolean;
  encounterId: string | null;
  terrain: BoardDoc;
  revealed: Record<string, number[]>;
  tokens: WorkshopToken[];
  updatedAt: string;
}

export async function getWorkshopBoard(mapId: string): Promise<WorkshopBoard> {
  const { map } = await staffForMap(mapId);
  const board = normalizeBoard(map.terrain);
  const revealed = revealedOf(map.revealed, board);
  const rows = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const entryIds = rows
    .map(t => t.entryId)
    .filter((id): id is string => id !== null);
  const entries = new Map(
    (entryIds.length > 0
      ? await db
          .select({
            id: initiativeEntries.id,
            label: initiativeEntries.label,
            side: initiativeEntries.side,
            encounterId: initiativeEntries.encounterId,
          })
          .from(initiativeEntries)
          .where(inArray(initiativeEntries.id, entryIds))
      : []
    ).map(e => [e.id, e])
  );
  return {
    id: map.id,
    campaignId: map.campaignId,
    name: map.name,
    visibility: map.visibility,
    isActive: map.isActive,
    encounterId: map.encounterId,
    terrain: board,
    revealed: storeRevealed(revealed),
    tokens: rows
      // Last week's goblins, still standing where they fell in an order
      // that no longer exists, are not on the bench.
      .filter(
        t =>
          t.entryId === null ||
          entries.get(t.entryId)?.encounterId === map.encounterId
      )
      .map(t => {
        const e = t.entryId ? entries.get(t.entryId) : undefined;
        return {
          id: t.id,
          entryId: t.entryId,
          label: e?.label ?? t.label,
          side: e ? (e.side as 'party' | 'foe' | 'other') : null,
          x: t.x,
          y: t.y,
          level: levelFor(board, t).id,
          altitude: t.altitude,
          footprint: t.footprint,
          tint: t.tint,
          visibility: t.visibility,
          mine: true,
          state: t.state,
          lockDc: t.lockDc,
          hpCurrent: t.hpCurrent,
          hpMax: t.hpMax,
          breakable: t.hpMax !== null,
          blocks: blocksStanding(t),
          facing: t.facing,
          effect: normalizeThingEffect(t.effect),
          visionFeet: t.visionFeet,
          lightFeet: t.lightFeet,
          imageId: t.imageId,
          imageUrl: t.imageId ? imageUrl(map.campaignId, t.imageId) : null,
        };
      }),
    updatedAt: map.updatedAt,
  };
}

/**
 * Show the party the rooms they are standing in (the workshop's fog
 * panel): for every shared party token on a floor, the flood of its own
 * room — bounded by walls and closed doors, the way the fill tool is.
 */
export async function revealRoomsAround(
  mapId: string,
  levelId: string
): Promise<number> {
  const { map } = await staffForMap(mapId);
  const board = normalizeBoard(map.terrain);
  const level = levelOf(board, levelId);
  const partyIds = new Set<string>();
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
    for (const r of rows) partyIds.add(r.id);
  }
  const tokens = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const revealed = revealedOf(map.revealed, board);
  const shown = revealed.get(level.id)!;
  const before = shown.size;
  for (const t of tokens) {
    if (t.visibility !== 'shared' || !t.entryId || !partyIds.has(t.entryId)) {
      continue;
    }
    if (levelFor(board, t).id !== level.id) continue;
    for (const i of floodFill(level, { x: t.x, y: t.y })) shown.add(i);
  }
  await db
    .update(battleMaps)
    .set({
      revealed: storeRevealed(revealed),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
  return shown.size - before;
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
      terrain: normalizeBoard(
        emptyTerrain(input.w, input.h, input.material ?? VOID)
      ),
      revealed: {},
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
  const doc = normalizeBoard(terrain);

  // Tokens that no longer have a floor under them are moved nowhere — they
  // stay, and the board shows them standing on nothing until the DM moves
  // them. Deleting a combatant's position because the DM erased a tile is a
  // silent loss; a token in the void is a visible one. A token whose whole
  // floor was removed drops to the ground floor for the same reason.
  const ids = new Set(doc.levels.map(l => l.id));
  const tokens = await db
    .select({ id: battleMapTokens.id, level: battleMapTokens.level })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, mapId));
  const orphans = tokens.filter(t => !ids.has(t.level)).map(t => t.id);
  if (orphans.length > 0) {
    await db
      .update(battleMapTokens)
      .set({ level: defaultLevelId(doc), updatedAt: new Date().toISOString() })
      .where(inArray(battleMapTokens.id, orphans));
  }
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
    /*
     * In play means the party can see it.
     *
     * These were two switches — `isActive` and `visibility` — and the state
     * they could reach between them that nobody ever wanted was "the board
     * the table is playing on, which the table cannot see". A first-timer
     * got there by pressing one button and not the other. Putting a board in
     * play shows it; hiding it again is the odd case and stays its own,
     * quieter switch.
     */
    await db
      .update(battleMaps)
      .set({
        isActive: true,
        visibility: 'shared',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(battleMaps.id, mapId));
    if (fight) await bindBoardToFight(mapId, fight.id);
    // A board with a track starts it when lit (12); the fight ending stops
    // it again, unless the DM keeps it.
    if (map.audioId) {
      await setAmbience(
        map.campaignId,
        { audioId: map.audioId },
        { fromBoard: true }
      ).catch(() => {});
    }
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
  indices: number[],
  levelId?: string
): Promise<void> {
  const { map } = await staffForMap(mapId);
  const board = normalizeBoard(map.terrain);
  const level = levelOf(board, levelId);
  const n = board.w * board.h;
  const revealed = revealedOf(map.revealed, board);
  const set = revealed.get(level.id)!;
  for (const i of indices) {
    if (Number.isInteger(i) && i >= 0 && i < n) set.add(i);
  }
  await db
    .update(battleMaps)
    .set({
      revealed: storeRevealed(revealed),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/**
 * Hide everything again — one floor, or the whole house. The one exception
 * to "additive": a DM resetting a room.
 */
export async function resetFog(mapId: string, levelId?: string): Promise<void> {
  const { map } = await staffForMap(mapId);
  const board = normalizeBoard(map.terrain);
  const revealed = revealedOf(map.revealed, board);
  if (levelId) revealed.set(levelOf(board, levelId).id, new Set());
  else for (const k of revealed.keys()) revealed.set(k, new Set());
  await db
    .update(battleMaps)
    .set({
      revealed: storeRevealed(revealed),
      updatedAt: new Date().toISOString(),
    })
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
  radiusFeet = PARTY_SIGHT_FEET,
  only?: { tokenId: string }
): Promise<number> {
  const { map } = await staffForMap(mapId);
  return revealFromPartyUnchecked(map, radiusFeet, only);
}

/**
 * `revealFromParty` without the role check, for the server's own use: a
 * hero who takes the stairs looks around when they land, whoever moved
 * them. `only` narrows the looking to one token.
 */
async function revealFromPartyUnchecked(
  map: typeof battleMaps.$inferSelect,
  radiusFeet = PARTY_SIGHT_FEET,
  only?: { tokenId: string }
): Promise<number> {
  const board = normalizeBoard(map.terrain);
  const tokens = await db
    .select({
      id: battleMapTokens.id,
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      level: battleMapTokens.level,
      footprint: battleMapTokens.footprint,
      entryId: battleMapTokens.entryId,
      visibility: battleMapTokens.visibility,
      visionFeet: battleMapTokens.visionFeet,
      lightFeet: battleMapTokens.lightFeet,
    })
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, map.id));

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

  /*
   * Per token (08): a tile is revealed to the party if some party token can
   * see it — a clear line, and either the tile is lit (the floor's ambient
   * light, a brazier, a torch anybody carries) or it is within that token's
   * own darkvision. Floor by floor: a torch downstairs lights nothing up
   * here. On a bright board this is `visibleFrom` as it always was.
   */
  const revealed = revealedOf(map.revealed, board);
  const before = [...revealed.values()].reduce((n, v) => n + v.size, 0);
  const r = Math.ceil(radiusFeet / 5);
  for (const t of tokens) {
    if (only && t.id !== only.tokenId) continue;
    if (t.visibility !== 'shared') continue;
    if (!t.entryId || !partyEntries.has(t.entryId)) continue;
    const doc = levelFor(board, t);
    const shown = revealed.get(doc.id)!;
    const torches: Torch[] = tokens
      .filter(
        o => o.lightFeet && o.lightFeet > 0 && levelFor(board, o).id === doc.id
      )
      .map(o => ({ x: o.x, y: o.y, radiusFeet: o.lightFeet as number }));
    const seer = {
      x: t.x,
      y: t.y,
      footprint: t.footprint,
      visionFeet: t.visionFeet,
    };
    for (let y = t.y - r; y <= t.y + r; y++) {
      for (let x = t.x - r; x <= t.x + r; x++) {
        if (!inBounds(doc, x, y)) continue;
        if (seesTile(doc, seer, { x, y }, torches, canSee, radiusFeet)) {
          shown.add(y * doc.w + x);
        }
      }
    }
  }

  await db
    .update(battleMaps)
    .set({
      revealed: storeRevealed(revealed),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMaps.id, map.id));
  bumpVersion(map.campaignId);
  const after = [...revealed.values()].reduce((n, v) => n + v.size, 0);
  return after - before;
}

/* --- tokens ------------------------------------------------------------ */

async function occupantsExcept(
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
 * bounds, void, occupancy — and refused rather than trusted.
 *
 * Distance is the table's call (01 + 05): on the mover's own turn the move
 * is priced by the cheapest path and spent from the turn's budget. Advising,
 * a long move is recorded and the strip says so; enforcing with
 * `movementFence`, it is refused as `TOO_FAR`, which staff may overrule. Off
 * the mover's turn — the DM tidying the board — nobody's feet are spent.
 *
 * Then the offer: every hostile with its reaction whose reach the mover just
 * left, without Disengaging, is told it may take an opportunity attack.
 * Told, not made to — the app never swings for anybody.
 */
export async function moveToken(
  tokenId: string,
  destination: { x: number; y: number },
  opts: { ruling?: boolean } = {}
): Promise<void> {
  let to = { x: destination.x, y: destination.y };
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

  const board = normalizeBoard(map.terrain);
  const doc = levelFor(board, token);
  if (!inBounds(doc, to.x, to.y)) throw new Error('CANNOT_STAND_THERE');
  const who = { isStaff: isStaffRole(role), ruling: opts.ruling };
  await refuseStanding(
    standingIssue(
      doc,
      { x: to.x, y: to.y, footprint: token.footprint },
      await occupantsExcept(map.id, tokenId, doc.id)
    ),
    map.campaignId,
    map.encounterId,
    who
  );

  /*
   * The turn's feet. Priced the way the board lights reach — the cheapest
   * path through this terrain among these tokens — so a player is refused
   * only what the board already showed them was out of reach. Where no path
   * exists (a wall between, and they were dragged over it) the straight
   * distance stands in. Before the write, so a refusal moves nothing.
   */
  const entry = token.entryId
    ? await db.query.initiativeEntries.findFirst({
        where: eq(initiativeEntries.id, token.entryId),
      })
    : null;
  // Everything on this floor. The floors below and above are as far away
  // as another board: nothing there blocks, threatens or prices this move.
  const all = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => levelFor(board, t).id === doc.id);
  const entryIds = all
    .map(t => t.entryId)
    .filter((id): id is string => id !== null);
  const entries =
    entryIds.length > 0
      ? await db
          .select()
          .from(initiativeEntries)
          .where(inArray(initiativeEntries.id, entryIds))
      : [];
  const sideOf = new Map(entries.map(e => [e.id, e.side as string]));

  /*
   * The path, tile by tile, before anything is written: a plate on the
   * way goes off under the mover and the move stops there (08). A move no
   * path reaches — staff dragging over a wall — is a jump that crosses
   * nothing. The destination `to` may move here; everything after reads it.
   */
  let trap: {
    thing: typeof battleMapTokens.$inferSelect;
    stopAt: Tile;
  } | null = null;
  if (entry && (token.x !== to.x || token.y !== to.y)) {
    const blockedTiles = new Set<number>();
    for (const t of all) {
      if (t.id === token.id || !blocksStanding(t)) continue;
      // Allies are walked through; only the destination tile is refused,
      // and `standingIssue` already did that.
      const ally = t.entryId && entry.side === (sideOf.get(t.entryId) ?? null);
      if (ally) continue;
      for (const i of footprintTiles(doc, t)) blockedTiles.add(i);
    }
    const path = pathBetween(doc, { x: token.x, y: token.y }, to, blockedTiles);
    if (path) {
      trap = await trapOnPath(map, doc, path, {
        footprint: token.footprint,
        side: entry.side,
      });
      if (trap) to = { x: trap.stopAt.x, y: trap.stopAt.y };
    }
  }

  const me: Occupant = { x: to.x, y: to.y, footprint: token.footprint };
  let spent: { ruling: boolean } | null = null;
  if (entry && (token.x !== to.x || token.y !== to.y)) {
    const asReach = (t: typeof token) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      footprint: t.footprint,
      side: t.entryId ? (sideOf.get(t.entryId) ?? null) : null,
    });
    const costs = reachFor(
      doc,
      asReach(token),
      all.filter(t => t.id !== token.id && blocksStanding(t)).map(asReach),
      10_000
    );
    const cost =
      costs.get(to.y * doc.w + to.x) ??
      distanceFeet({ x: token.x, y: token.y }, to);
    spent = await spendMovement(entry, cost, who);
  }

  await db
    .update(battleMapTokens)
    .set({ x: to.x, y: to.y, updatedAt: new Date().toISOString() })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
  // The DM's undo (11): the square it stood on, and the feet it spent.
  if (isStaffRole(role) && (token.x !== to.x || token.y !== to.y)) {
    const from = { x: token.x, y: token.y };
    const turnBefore = entry?.turn ?? null;
    recordUndo(map.campaignId, {
      label: `Move ${entry?.label ?? token.label ?? 'a token'} back to ${from.x},${from.y}`,
      inverse: async () => {
        await db
          .update(battleMapTokens)
          .set({ x: from.x, y: from.y, updatedAt: new Date().toISOString() })
          .where(eq(battleMapTokens.id, tokenId));
        if (entry && turnBefore !== null) {
          await db
            .update(initiativeEntries)
            .set({ turn: turnBefore })
            .where(eq(initiativeEntries.id, entry.id));
        }
      },
    });
  }

  if (entry && spent && !parseTurn(entry.turn).disengaged) {
    await offerOpportunityAttacks(
      map.campaignId,
      entry,
      { x: token.x, y: token.y, footprint: token.footprint },
      me,
      all.filter(t => t.id !== token.id),
      entries,
      userId
    );
  }

  // The plate goes off under them; then, standing still, whether they are
  // beside anything else they have not found.
  if (entry && trap) {
    await fireThing(trap.thing.id, { userId, actorName: entry.label });
  }
  if (entry) await nudgeNearHidden(map, { ...to, level: doc.id }, entry);
}

/**
 * Take the stairs. The one move that changes floors.
 *
 * The token must be standing on the link — every link stands on both of
 * its floors — and lands on the far floor on the same tile, or the first
 * tile of the stairwell with room. Priced as the climb (`linkCostFeet`)
 * and spent from the turn the way a step is, under the same fence; a
 * player takes only their own token, staff anybody's. A hidden stair is
 * the DM's to offer: a player is refused it as if it were not there.
 *
 * Leaving a floor is leaving every hostile's reach on it, so the offer of
 * opportunity attacks is made from where the token stood. A hero who
 * lands looks around: the far floor is revealed from where they stand,
 * so a player whose token climbs into the dark sees their own landing.
 */
export async function takeLink(
  tokenId: string,
  linkId: string,
  opts: { ruling?: boolean } = {}
): Promise<{ level: string; x: number; y: number }> {
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
  const isStaff = isStaffRole(role);
  if (!isStaff) {
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

  const board = normalizeBoard(map.terrain);
  const here = levelFor(board, token);
  const link = board.links.find(l => l.id === linkId);
  if (!link || (link.hidden && !isStaff)) throw new Error('NO_SUCH_STAIR');
  const otherId = linkOtherEnd(link, here.id);
  if (otherId === null) throw new Error('NOT_ON_THE_STAIR');
  const me: Occupant = { x: token.x, y: token.y, footprint: token.footprint };
  if (!linksUnder(board, here.id, me).some(l => l.id === link.id)) {
    throw new Error('NOT_ON_THE_STAIR');
  }
  const there = levelOf(board, otherId);
  const others = await occupantsExcept(map.id, tokenId, there.id);
  const landing = landingFor(there, link, me, others);
  if (!landing) throw new Error('NO_ROOM_THERE');
  const who = { isStaff, ruling: opts.ruling };
  await refuseStanding(
    standingIssue(there, { ...landing, footprint: token.footprint }, others),
    map.campaignId,
    map.encounterId,
    who
  );

  const entry = token.entryId
    ? await db.query.initiativeEntries.findFirst({
        where: eq(initiativeEntries.id, token.entryId),
      })
    : null;
  let spent: { ruling: boolean } | null = null;
  if (entry) {
    spent = await spendMovement(entry, linkCostFeet(board, link, here.id), who);
  }

  // Who could swing as they leave: everybody hostile on the floor they are
  // leaving, from where they stood. Read before the write.
  const onThisFloor = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => t.id !== token.id && levelFor(board, t).id === here.id);
  const entryIds = onThisFloor
    .map(t => t.entryId)
    .filter((id): id is string => id !== null);
  const entries =
    entryIds.length > 0
      ? await db
          .select()
          .from(initiativeEntries)
          .where(inArray(initiativeEntries.id, entryIds))
      : [];

  await db
    .update(battleMapTokens)
    .set({
      x: landing.x,
      y: landing.y,
      level: there.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);

  if (isStaff) {
    const from = { x: token.x, y: token.y, level: here.id };
    const turnBefore = entry?.turn ?? null;
    recordUndo(map.campaignId, {
      label: `Put ${entry?.label ?? token.label ?? 'a token'} back on the ${here.name || 'floor below'}`,
      inverse: async () => {
        await db
          .update(battleMapTokens)
          .set({ ...from, updatedAt: new Date().toISOString() })
          .where(eq(battleMapTokens.id, tokenId));
        if (entry && turnBefore !== null) {
          await db
            .update(initiativeEntries)
            .set({ turn: turnBefore })
            .where(eq(initiativeEntries.id, entry.id));
        }
      },
    });
  }

  if (entry && spent && !parseTurn(entry.turn).disengaged) {
    await offerOpportunityAttacks(
      map.campaignId,
      entry,
      me,
      // Gone from the floor: further than any reach.
      { x: -1000, y: -1000, footprint: token.footprint },
      onThisFloor,
      entries,
      userId
    );
  }

  if (entry?.side === 'party' && token.visibility === 'shared') {
    await revealFromPartyUnchecked(map, PARTY_SIGHT_FEET, { tokenId });
  }
  if (entry) {
    await nudgeNearHidden(map, { ...landing, level: there.id }, entry);
  }
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName: entry?.label ?? token.label ?? 'Somebody',
    name: link.name || (link.kind === 'ladder' ? 'the ladder' : 'the stairs'),
    what: there.feet > here.feet ? 'climbed' : 'descended',
    detail: there.name,
  });
  return { level: there.id, x: landing.x, y: landing.y };
}

/**
 * Who could swing as the mover leaves. A hostile is any combatant on another
 * side; its reach is 5 ft, or 10 when its block says so. The mover was in
 * reach and is not any more, and the hostile has its reaction: an
 * `opportunity` event goes to the hostile's owner — staff for a foe, the
 * seated player for a hero — and it is theirs to take or leave.
 */
async function offerOpportunityAttacks(
  campaignId: string,
  mover: typeof initiativeEntries.$inferSelect,
  from: Occupant,
  to: Occupant,
  others: (typeof battleMapTokens.$inferSelect)[],
  entries: (typeof initiativeEntries.$inferSelect)[],
  byUserId: string
): Promise<void> {
  const byId = new Map(entries.map(e => [e.id, e]));
  for (const t of others) {
    const hostile = t.entryId ? byId.get(t.entryId) : undefined;
    if (!hostile || hostile.side === mover.side) continue;
    if (parseTurn(hostile.turn).reaction) continue;
    // Down, incapacitated or otherwise unable to react: no offer.
    if (hostile.hpCurrent !== null && hostile.hpCurrent <= 0) continue;
    const reach = await reachOf(hostile);
    const at = { x: t.x, y: t.y, footprint: t.footprint };
    const before = distanceFeet(from, at);
    const after = distanceFeet(to, at);
    if (before > reach || after <= reach) continue;

    let audience: 'staff' | { users: string[] } = 'staff';
    if (hostile.characterId) {
      const seat = await db.query.campaignMembers.findFirst({
        columns: { userId: true },
        where: and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.characterId, hostile.characterId)
        ),
      });
      if (seat) audience = { users: [seat.userId] };
    }
    publish(
      campaignId,
      {
        kind: 'opportunity',
        id: randomUUID(),
        at: new Date().toISOString(),
        by: byUserId,
        attackerLabel: hostile.label,
        attackerEntryId: hostile.id,
        moverLabel: mover.label,
      },
      audience
    );
  }
}

/**
 * How far a combatant can swing: 10 ft when its block's actions say
 * "reach 10 ft.", else 5. A hero's reach weapon is not read here yet — the
 * equipped weapon is 06's business, and 5 ft is the honest default.
 */
async function reachOf(
  entry: typeof initiativeEntries.$inferSelect
): Promise<number> {
  if (!entry.creatureRef) return 5;
  const resolved = await resolveContentRefs([entry.creatureRef as ContentRef]);
  const block = [...resolved.values()][0];
  if (!block) return 5;
  const d = parseContentData('creature', block.data) as CreatureData;
  const text = d.actions.map(a => a.desc).join(' ');
  return /reach\s+10\s*ft/i.test(text) ? 10 : 5;
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
      level: battleMapTokens.level,
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
  const board = normalizeBoard(map.terrain);
  return mine.some(
    m =>
      levelFor(board, m).id === levelFor(board, thing).id &&
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
  const actorName = await nameOf(userId, map.campaignId);
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName,
    name: thing.label || 'Something',
    what: next === 'open' ? 'opened' : 'closed',
  });
  // A lever does what it does (08).
  if (normalizeThingEffect(thing.effect)?.trigger === 'operate') {
    await fireThing(tokenId, { userId, actorName });
  }
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
  mode: 'straight' | 'advantage' | 'disadvantage' = 'straight',
  faces?: number[]
): Promise<{
  total: number;
  opened: boolean;
  /** The roll as the log has it, for the tray. */
  roll: NotationRoll;
  physical: boolean;
}> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (thing.state !== 'locked') throw new Error('NOT_LOCKED');
  if (!(await withinReach(map, thing, userId, role))) {
    throw new Error('OUT_OF_REACH');
  }
  const claimed = await claimedFaces(map.campaignId, isStaffRole(role), faces);

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

  const dice = d20Faces(mode, claimed);
  if (!dice) throw new Error('BAD_FACES');
  const { face, dropped } = d20Result(mode, dice);
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
    dropped,
    modifier: bonus,
    total,
    visibility: 'table',
    physical: claimed !== undefined,
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
  return {
    total,
    opened,
    roll: {
      notation: `${dice.length}d20${bonus >= 0 ? '+' : ''}${bonus}`,
      dice,
      dropped,
      modifier: bonus,
      total,
    },
    physical: claimed !== undefined,
  };
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
  const actorName = await nameOf(userId, map.campaignId);
  if (broken && before > 0) {
    publish(map.campaignId, {
      kind: 'thing',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName,
      name: thing.label || 'Something',
      what: 'broken',
    });
  }
  // A cracked dam, a collapsing pillar (08).
  const effect = normalizeThingEffect(thing.effect);
  if (delta < 0 && effect?.trigger === 'damage') {
    await fireThing(tokenId, { userId, actorName });
  } else if (broken && before > 0 && effect?.trigger === 'destroy') {
    await fireThing(tokenId, { userId, actorName });
  }
}

/* --- things that do something (08) -------------------------------------------- */

type ThingRow = typeof battleMapTokens.$inferSelect;
type MapRowT = typeof battleMaps.$inferSelect;

/**
 * Who stands on these tiles: every combatant token whose footprint touches
 * one, with its entry, for a change that lands damage or a condition.
 */
async function standingOn(
  map: MapRowT,
  tiles: readonly number[],
  levelId: string
): Promise<
  { token: ThingRow; entry: typeof initiativeEntries.$inferSelect }[]
> {
  if (tiles.length === 0) return [];
  const board = normalizeBoard(map.terrain);
  const doc = levelOf(board, levelId);
  const set = new Set(tiles);
  const tokens = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, map.id));
  const hit = tokens.filter(
    t =>
      t.entryId &&
      levelFor(board, t).id === doc.id &&
      footprintTiles(doc, t).some(i => set.has(i))
  );
  if (hit.length === 0) return [];
  const entries = await db
    .select()
    .from(initiativeEntries)
    .where(
      inArray(
        initiativeEntries.id,
        hit.map(t => t.entryId as string)
      )
    );
  const byId = new Map(entries.map(e => [e.id, e]));
  return hit
    .map(t => ({ token: t, entry: byId.get(t.entryId as string)! }))
    .filter(x => x.entry);
}

/** A combatant's save bonus, off the sheet or the block; 0 for a hand-typed foe. */
async function saveBonusOf(
  entry: typeof initiativeEntries.$inferSelect,
  ability: AbilityKey
): Promise<number> {
  if (entry.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    if (c) return savingThrow(c.sheet as CharacterSheet, ability);
  }
  const ref = entry.creatureRef as ContentRef | null;
  if (!ref) return 0;
  const resolved = await resolveContentRefs([ref]);
  const block = [...resolved.values()][0];
  if (!block) return 0;
  const d = parseContentData('creature', block.data) as CreatureData;
  return (
    d.saving_throws[ability] ?? abilityModifier(d.ability_scores[ability] ?? 10)
  );
}

async function defensesOf(entry: typeof initiativeEntries.$inferSelect) {
  if (entry.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    const sheet = c?.sheet as CharacterSheet | undefined;
    if (sheet) {
      return {
        resistances: sheet.combat?.damageResistances ?? [],
        immunities: sheet.combat?.damageImmunities ?? [],
        vulnerabilities: sheet.combat?.damageVulnerabilities ?? [],
      };
    }
  }
  const ref = entry.creatureRef as ContentRef | null;
  const block = ref ? [...(await resolveContentRefs([ref])).values()][0] : null;
  const d = block
    ? (parseContentData('creature', block.data) as CreatureData)
    : null;
  return {
    resistances: d?.damage_resistances ?? [],
    immunities: d?.damage_immunities ?? [],
    vulnerabilities: d?.damage_vulnerabilities ?? [],
  };
}

/**
 * A thing does what it does.
 *
 * The document changes land on a copy of the terrain and are written once;
 * a `toggle` remembers what it undid so the next pull puts it back. A change
 * to another thing sets its state with no reach check — the lever is the
 * reach. Damage and conditions find whoever stands on the tiles, roll the
 * save on the server (a trap fires before anyone can decide anything) with
 * every roll in the log, and land through the same paths a spell uses. A
 * hidden thing that fires is seen by everybody now. Returns false when the
 * thing had nothing to do or was spent.
 */
export async function fireThing(
  tokenId: string,
  cause: { userId: string | null; actorName: string }
): Promise<boolean> {
  const thing = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!thing) throw new Error('NOT_FOUND');
  const effect = normalizeThingEffect(thing.effect);
  if (!effect) return false;
  if (effect.repeat === 'once' && effect.spent) return false;
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, thing.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const campaignId = map.campaignId;
  const name = thing.label || 'Something';

  // A toggle on its second pull runs what put the first back.
  const undoing = effect.repeat === 'toggle' && (effect.undo?.length ?? 0) > 0;
  const changes = undoing ? effect.undo! : effect.changes;

  // 1. The document — the floor the thing is on. A lever in the cellar
  // moves the cellar's walls; its tiles are the cellar's indices.
  const board = normalizeBoard(map.terrain);
  const doc = levelFor(board, thing);
  const terrainChanges = changes.filter(isTerrainChange);
  const applied = applyTerrainChanges(doc, terrainChanges);
  const nextBoard = withLevel(board, { ...doc, ...applied.doc });
  const revealed = revealedOf(map.revealed, board);
  const shown = revealed.get(doc.id)!;
  for (const c of changes) {
    if (c.kind === 'reveal') for (const i of c.tiles) shown.add(i);
  }
  await db
    .update(battleMaps)
    .set({
      terrain: nextBoard,
      revealed: storeRevealed(revealed),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMaps.id, map.id));

  // 2. Other things.
  for (const c of changes) {
    if (c.kind !== 'thing') continue;
    await db
      .update(battleMapTokens)
      .set({ state: c.to, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(battleMapTokens.id, c.tokenId),
          eq(battleMapTokens.mapId, map.id)
        )
      );
  }

  // 3. Whoever stands there.
  const lines: string[] = [];
  for (const c of changes) {
    if (c.kind === 'damage') {
      const rolled = rollNotation(c.dice);
      if (!rolled) continue;
      await db.insert(campaignRolls).values({
        campaignId,
        actorUserId: cause.userId,
        characterId: null,
        actorName: name,
        label: `${name} · ${c.type} damage`.slice(0, 80),
        notation: rolled.notation.slice(0, 60),
        dice: rolled.dice,
        dropped: rolled.dropped,
        modifier: rolled.modifier,
        total: rolled.total,
        visibility: 'table',
      });
      for (const { entry } of await standingOn(
        { ...map, terrain: nextBoard },
        c.area,
        doc.id
      )) {
        let amount = rolled.total;
        if (c.save) {
          const ability = c.save.ability as AbilityKey;
          const modifier = await saveBonusOf(entry, ability);
          const die = rollDie(20);
          const passed = die + modifier >= c.save.dc;
          await db.insert(campaignRolls).values({
            campaignId,
            actorUserId: null,
            characterId: entry.characterId,
            actorName: entry.label,
            label:
              `${ability.charAt(0).toUpperCase() + ability.slice(1)} save vs ${name} · DC ${c.save.dc}`.slice(
                0,
                80
              ),
            notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
            dice: [die],
            dropped: [] as number[],
            modifier,
            total: die + modifier,
            visibility: entry.side === 'party' ? 'table' : 'dm',
          });
          if (passed)
            amount = c.save.effect === 'negates' ? 0 : Math.floor(amount / 2);
        }
        const adjusted = adjustDamage(amount, c.type, await defensesOf(entry));
        if (adjusted.amount > 0) {
          await applyHpUnchecked(entry.id, campaignId, -adjusted.amount);
        }
        lines.push(`${entry.label} takes ${adjusted.amount}`);
      }
    } else if (c.kind === 'condition') {
      const [key] = parseConditions(c.condition);
      if (!key) continue;
      for (const { entry } of await standingOn(
        { ...map, terrain: nextBoard },
        c.area,
        doc.id
      )) {
        if (c.save) {
          const ability = c.save.ability as AbilityKey;
          const modifier = await saveBonusOf(entry, ability);
          const die = rollDie(20);
          const passed = die + modifier >= c.save.dc;
          await db.insert(campaignRolls).values({
            campaignId,
            actorUserId: null,
            characterId: entry.characterId,
            actorName: entry.label,
            label:
              `${ability.charAt(0).toUpperCase() + ability.slice(1)} save vs ${name} · DC ${c.save.dc}`.slice(
                0,
                80
              ),
            notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
            dice: [die],
            dropped: [] as number[],
            modifier,
            total: die + modifier,
            visibility: entry.side === 'party' ? 'table' : 'dm',
          });
          if (passed) continue;
        }
        await putEffect(
          campaignId,
          entry.encounterId,
          [entry.id],
          {
            kind: 'condition',
            conditionKey: key,
            rounds: c.rounds,
            sourceLabel: name,
          },
          cause.userId
        );
      }
    } else if (c.kind === 'sound') {
      lines.push(c.text);
    }
  }

  // 4. The thing itself: spent, toggled, and seen.
  const next: ThingEffect = {
    ...effect,
    ...(effect.repeat === 'once' ? { spent: true } : {}),
    ...(effect.repeat === 'toggle'
      ? { undo: undoing ? [] : applied.undo }
      : {}),
  };
  await db
    .update(battleMapTokens)
    .set({
      effect: next,
      ...(thing.visibility === 'dm' && effect.findDc
        ? { visibility: 'shared' as const }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: cause.userId,
    actorName: cause.actorName,
    name,
    what: 'fired',
    detail: lines.join(' · '),
  });
  return true;
}

/**
 * The hidden things a mover's path crosses that would go off under them
 * (08): `enter` triggers, unspent, for their side. Returns the first, and
 * the tile the move stops on — the plate you stepped on, not the far wall.
 */
async function trapOnPath(
  map: MapRowT,
  doc: LevelDoc,
  path: Tile[],
  mover: { footprint: number; side: string | null }
): Promise<{ thing: ThingRow; stopAt: Tile } | null> {
  const things = (
    await db
      .select()
      .from(battleMapTokens)
      .where(
        and(
          eq(battleMapTokens.mapId, map.id),
          eq(battleMapTokens.level, doc.id)
        )
      )
  ).filter(t => t.entryId === null && t.state !== 'broken' && t.effect);
  if (things.length === 0) return null;
  for (const step of path) {
    const covered = new Set(
      footprintTiles(doc, { x: step.x, y: step.y, footprint: mover.footprint })
    );
    for (const t of things) {
      const effect = normalizeThingEffect(t.effect);
      if (!effect || effect.trigger !== 'enter') continue;
      if (effect.repeat === 'once' && effect.spent) continue;
      if (effect.triggers === 'party' && mover.side !== 'party') continue;
      if (effect.triggers === 'foe' && mover.side !== 'foe') continue;
      if (footprintTiles(doc, t).some(i => covered.has(i))) {
        return { thing: t, stopAt: step };
      }
    }
  }
  return null;
}

/**
 * Search the ground within 5 ft (08): a Perception check rolled on the
 * server off the hero's own sheet against each hidden thing's `findDc`.
 * Found, the thing is shared and the table is told. The hero's player, or
 * staff. Returns what was found.
 */
export async function searchNearby(entryId: string): Promise<string[]> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const { role, userId } = await requireCampaignRole(enc.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  if (!isStaffRole(role)) {
    const seat = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, enc.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    if (!entry.characterId || seat?.characterId !== entry.characterId) {
      throw new Error('FORBIDDEN');
    }
  }
  const map = await db.query.battleMaps.findFirst({
    where: and(
      eq(battleMaps.campaignId, enc.campaignId),
      eq(battleMaps.encounterId, entry.encounterId),
      eq(battleMaps.isActive, true)
    ),
  });
  if (!map) return [];
  const me = await db.query.battleMapTokens.findFirst({
    where: and(
      eq(battleMapTokens.mapId, map.id),
      eq(battleMapTokens.entryId, entryId)
    ),
  });
  if (!me) return [];
  const board = normalizeBoard(map.terrain);
  const hidden = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => {
    const effect = normalizeThingEffect(t.effect);
    return (
      t.entryId === null &&
      t.visibility === 'dm' &&
      effect?.findDc &&
      levelFor(board, t).id === levelFor(board, me).id &&
      distanceFeet(me, t) <= 5
    );
  });
  if (hidden.length === 0) return [];

  const character = entry.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, entry.characterId),
      })
    : null;
  const sheet = character?.sheet as CharacterSheet | undefined;
  const modifier = sheet ? skillBonus(sheet, 'perception') : 0;
  const die = rollDie(20);
  const total = die + modifier;
  await db.insert(campaignRolls).values({
    campaignId: enc.campaignId,
    actorUserId: userId,
    characterId: entry.characterId,
    actorName: entry.label,
    label: 'Wisdom (Perception) · searching',
    notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
    dice: [die],
    dropped: [] as number[],
    modifier,
    total,
    visibility: 'table',
  });

  const found: string[] = [];
  for (const t of hidden) {
    const effect = normalizeThingEffect(t.effect)!;
    if (total < (effect.findDc ?? 0)) continue;
    await db
      .update(battleMapTokens)
      .set({ visibility: 'shared', updatedAt: new Date().toISOString() })
      .where(eq(battleMapTokens.id, t.id));
    found.push(t.label || 'something');
    publish(enc.campaignId, {
      kind: 'thing',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName: entry.label,
      name: t.label || 'something hidden',
      what: 'spotted',
    });
  }
  bumpVersion(enc.campaignId);
  return found;
}

/**
 * A nudge to staff (08): the mover stands within 5 ft of something hidden.
 * Advice, not an automatic reveal — the DM decides whether the passive
 * Perception on the line is enough.
 */
async function nudgeNearHidden(
  map: MapRowT,
  mover: { x: number; y: number; level: string },
  entry: typeof initiativeEntries.$inferSelect
): Promise<void> {
  if (entry.side !== 'party') return;
  const board = normalizeBoard(map.terrain);
  const hidden = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => {
    const effect = normalizeThingEffect(t.effect);
    return (
      t.entryId === null &&
      t.visibility === 'dm' &&
      effect?.findDc &&
      levelFor(board, t).id === levelOf(board, mover.level).id &&
      distanceFeet(mover, t) <= 5
    );
  });
  if (hidden.length === 0) return;
  const character = entry.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, entry.characterId),
      })
    : null;
  const passive = character
    ? passivePerception(character.sheet as CharacterSheet)
    : null;
  for (const t of hidden) {
    const effect = normalizeThingEffect(t.effect)!;
    publish(
      map.campaignId,
      {
        kind: 'thing',
        id: randomUUID(),
        at: new Date().toISOString(),
        by: null,
        actorName: entry.label,
        name: t.label || 'something hidden',
        what: 'near',
        detail:
          passive !== null
            ? `passive Perception ${passive} vs DC ${effect.findDc}${passive >= (effect.findDc ?? 0) ? ' — they would notice' : ''}`
            : `DC ${effect.findDc}`,
      },
      'staff'
    );
  }
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
