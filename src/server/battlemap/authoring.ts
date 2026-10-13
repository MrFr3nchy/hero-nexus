import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';

import {
  defaultLevelId,
  emptyTerrain,
  normalizeBoard,
  MATERIALS,
  VOID,
} from '@/@shared/battlemap/types';

import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { getCampaignImage } from '../campaign-images';
import { bumpVersion } from '../live-hub';
import { setAmbience } from '../audio';
import { staff, staffForMap } from './shared';

/**
 * Laying out, importing, naming and putting a battle board in play.
 */
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
 * A board from a Universal VTT map (7c): the geometry the browser read out
 * of the file, on a stone floor the size of the map, with the map's picture
 * as the ground floor's backdrop. The picture was uploaded first (it is far
 * too big for this request); this checks it belongs to this campaign.
 * Everything else goes through `normalizeBoard`, which drops anything off
 * the board.
 */
export async function importUvttBoard(
  campaignId: string,
  input: {
    name: string;
    w: number;
    h: number;
    walls: unknown[];
    lights: unknown[];
    imageId: string | null;
  }
): Promise<string> {
  const { userId } = await staff(campaignId);
  if (input.imageId) {
    const image = await getCampaignImage(input.imageId);
    if (!image || image.campaignId !== campaignId) throw new Error('NOT_FOUND');
  }
  const stone = MATERIALS.findIndex(m => m.key === 'stone');
  const terrain = normalizeBoard({
    ...emptyTerrain(input.w, input.h, stone > 0 ? stone : VOID),
    walls: input.walls,
    lights: input.lights,
    ...(input.imageId
      ? { backdrop: { imageId: input.imageId, opacity: 1 } }
      : {}),
  });
  const [row] = await db
    .insert(battleMaps)
    .values({
      campaignId,
      name: input.name.trim().slice(0, 120) || 'Imported map',
      terrain,
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
  // A player reads only the board in play, and only when it is shown
  // (`getBattleMapState`), so painting one that is hidden or out of play
  // changes nothing a player can see. The DM painting in the workshop
  // used to make every player re-read the whole table every save.
  bumpVersion(
    map.campaignId,
    map.isActive && map.visibility === 'shared' ? 'everyone' : 'staff'
  );
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
