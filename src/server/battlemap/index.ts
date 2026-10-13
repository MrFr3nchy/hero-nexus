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
 *
 * The module is split by what a caller is doing, and this index is its whole
 * public surface — import from `@/server/battlemap`, never from a part:
 *
 * - `shared` — the row types and the staff checks every part uses
 * - `read` — the board as a viewer may see it, fog applied
 * - `authoring` — laying out, importing, naming and putting a board in play
 * - `fog` — revealing tiles, by hand and from where the party stands
 * - `tokens` — placing, editing and removing what stands on the board
 * - `movement` — moving a token, taking a stair, and what a move provokes
 * - `thing-actions` — operating, picking and breaking a thing
 * - `traps` — things that fire, and searching for hidden ones
 */
export type { BattleMapRow, BattleMapState, BattleTokenRow } from './shared';
export {
  getBattleMapState,
  getBoardTerrain,
  getWorkshopBoard,
  listBattleMaps,
  revealRoomsAround,
} from './read';
export type { WorkshopBoard, WorkshopToken } from './read';
export {
  activeBoardId,
  bindBoardToFight,
  createBattleMap,
  deleteBattleMap,
  importUvttBoard,
  renameBattleMap,
  saveTerrain,
  setBattleMapActive,
  setBattleMapVisibility,
} from './authoring';
export { resetFog, revealFromParty, revealTiles } from './fog';
export {
  dealEncounterIn,
  dropThingNear,
  pingBoard,
  placeToken,
  removeToken,
  setAllTokenVisibility,
  setThingEffect,
  updateToken,
} from './tokens';
export type { TokenInput } from './tokens';
export { moveToken, takeLink } from './movement';
export { damageThing, operateThing, pickLock } from './thing-actions';
export { fireThing, searchNearby } from './traps';
