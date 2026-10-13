import 'server-only';
import { and, eq } from 'drizzle-orm';
import { canSee } from '@/@creator/campaign/lib/battlemap';
import { inBounds, levelOf, normalizeBoard } from '@/@shared/battlemap/types';

import { db } from '@/db';
import { battleMapTokens, battleMaps, initiativeEntries } from '@/db/schema';
import { bumpVersion } from '../live-hub';
import { seesTile, type Torch } from '@/@creator/campaign/lib/things';
import { levelFor, revealedOf, staffForMap, storeRevealed } from './shared';

/**
 * Fog of war: revealing tiles by hand, and from where the party stands.
 */
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
export const PARTY_SIGHT_FEET = 40;

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
export async function revealFromPartyUnchecked(
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
