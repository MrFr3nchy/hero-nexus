/**
 * The session: the live view every open table reads, and the fight on it.
 *
 * Split by what a caller is doing; this index is the whole public surface —
 * import from `@/server/session`, never from a part:
 *
 * - `shared` — the row types `LiveState` is made of
 * - `live` — `getLiveState`, the one role-filtered read every view re-reads
 * - `timers` — countdowns at the table
 * - `encounter` — starting, running and ending a fight
 * - `entries` — the combatants in the order, and their hit points
 * - `rolls` — the shared roll log
 * - `handouts` — what is passed across the table
 */
export { MAX_CREATURE_COPIES } from './shared';
export type {
  EncounterRow,
  EntryRow,
  EntrySide,
  HandoutRow,
  LiveState,
  RollRow,
  SittingRow,
  TimerRow,
} from './shared';
export { getLiveState, tableAt } from './live';
export { resumeTimers, startTimer, stopTimer } from './timers';
export {
  advanceTurn,
  createEncounter,
  endEncounter,
  startFight,
} from './encounter';
export type { FightSpoils } from './encounter';
export {
  addCreaturesToEncounter,
  addEntry,
  addPartyToEncounter,
  applyHp,
  removeEntry,
  restoreHp,
  rollInitiative,
  snapshotHp,
  updateEntry,
} from './entries';
export type { EntryInput, HpSnapshot, InitiativeRoll } from './entries';
export { clearRolls, rollForCampaign } from './rolls';
export type { RollInput } from './rolls';
export {
  canViewHandout,
  createImageHandout,
  createNote,
  deleteHandout,
  setHandoutVisibility,
} from './handouts';
