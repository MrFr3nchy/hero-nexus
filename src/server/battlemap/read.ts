import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import {
  floodFill,
  foggedBoard,
  footprintTiles,
} from '@/@creator/campaign/lib/battlemap';
import {
  blocksTile,
  levelOf,
  normalizeBoard,
  type BoardDoc,
  type ItemState,
} from '@/@shared/battlemap/types';

import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignMembers,
  initiativeEntries,
} from '@/db/schema';
import { imageUrl } from '../campaign-images';
import { type CampaignRole } from '../campaigns';
import { bumpVersion } from '../live-hub';

import {
  blocksStanding,
  normalizeThingEffect,
} from '@/@shared/battlemap/types';
import {
  isStaffRole,
  levelFor,
  revealedOf,
  staff,
  staffForMap,
  storeRevealed,
} from './shared';
import type { BattleMapState, BattleTokenRow } from './shared';

/**
 * The board as a viewer may see it. Fog of war is applied here, never in
 * the browser.
 */
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
    /** The track that starts when the board is put in play, if any. */
    audioId: string | null;
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
      audioId: r.audioId,
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
