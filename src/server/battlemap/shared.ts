import 'server-only';
import { eq } from 'drizzle-orm';

import {
  defaultLevelId,
  levelOf,
  type BoardDoc,
  type Facing,
  type ItemState,
  type LevelDoc,
} from '@/@shared/battlemap/types';

import { db } from '@/db';
import { battleMaps } from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from '../campaigns';

import { type ThingEffect } from '@/@shared/battlemap/types';

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

export function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

export async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

export async function staffForMap(mapId: string) {
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
export function revealedOf(
  raw: unknown,
  board: BoardDoc
): Map<string, Set<number>> {
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
export function storeRevealed(
  revealed: Map<string, Set<number>>
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of revealed) out[k] = [...v];
  return out;
}

/** The floor a token stands on, as a terrain document. */
export function levelFor(board: BoardDoc, token: { level: string }): LevelDoc {
  return levelOf(board, token.level);
}
