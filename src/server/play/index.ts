/**
 *
 *
 * Split by what a caller is doing; this index is the whole public surface —
 * import from `@/server/play`, never from a part:
 *
 * - `shared` — `PlayState`, who may touch a sheet, and reading one
 * - `state` — reading and patching the numbers that move in play
 * - `loadout` — what is in hand and what is prepared today
 * - `trading` — giving items and coin to another hero
 * - `vitals` — death saves, hit dice, rests and conditions
 * - `items` — using a thing from the pack
 */
export type { PlayPatch, PlayState } from './shared';
export {
  applyPlayPatch,
  applyPlayPatchUnchecked,
  getPlayState,
  listPartyPlayState,
} from './state';
export { COIN_KEYS, applyLoadoutPatch, getPlayLoadout } from './loadout';
export type {
  CoinKey,
  Coins,
  LoadoutItem,
  LoadoutPatch,
  LoadoutSpell,
  PlayLoadout,
  Seat,
} from './loadout';
export { coinsLine, giveCoin, giveItem } from './trading';
export type { GiveCoinInput, GiveItemInput } from './trading';
export {
  applyRestUnchecked,
  rollDeathSave,
  setOwnConditions,
  setPlayConditions,
  spendHitDice,
} from './vitals';
export type { DeathSaveResult, HitDiceResult } from './vitals';
export { consumeItem } from './items';
export type { UseItemResult } from './items';
