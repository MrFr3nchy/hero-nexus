import 'server-only';
import { type ContentRef } from '@/@shared/content';

import { type CampaignRole } from '../campaigns';
import { type BattleMapState } from '../battlemap';
import type { TableKind } from '@/@creator/campaign/lib/screen';
import {
  type TableRules,
  type TableRulesPatch,
} from '@/@creator/campaign/lib/table-rules';
import { type CheckRow } from '../checks';
import type { EffectRow } from '@/@creator/campaign/lib/effects';
import { type RollOutcome } from '@/@creator/campaign/lib/attack';
import { type TurnState } from '@/@creator/campaign/lib/turn';
import { type MapRow } from '../maps';
import { type PlayState } from '../play';
import type { EntryForm } from '@/@creator/campaign/lib/casting';
import { type Watcher } from '../live-hub';
import { type WhisperRow } from '../whispers';
import { type WorldClock } from '../world-time';
import { type RestRow } from '../rests';
import { type Legendary } from '@/@creator/campaign/lib/monsters';
import { type Ambience } from '../audio';

/** How much of the roll log the live view carries. */
export const ROLL_LOG_LIMIT = 40;

/**
 * How many copies of one monster may be dealt into a fight at once.
 *
 * Shared with the encounter planner so a line saying 30 kobolds does not
 * quietly become 20 when it is dealt out.
 */
export const MAX_CREATURE_COPIES = 50;

export interface EncounterRow {
  id: string;
  name: string;
  isActive: boolean;
  /**
   * `setup` while the fight is being laid out — tokens placed, foes shown,
   * nobody's turn — and `fighting` once somebody has rolled for initiative.
   */
  phase: 'setup' | 'fighting';
  round: number;
  turnIndex: number;
  /** What this fight does differently from the campaign. `{}` is nothing. */
  ruleOverrides: TableRulesPatch;
}

export type EntrySide = 'party' | 'foe' | 'other';

export interface EntryRow {
  id: string;
  label: string;
  characterId: string | null;
  initiative: number;
  hpCurrent: number | null;
  hpMax: number | null;
  hpTemp: number;
  armorClass: number | null;
  conditions: string;
  conditionKeys: string;
  concentrating: boolean;
  side: EntrySide;
  sort: number;
  /** Where the block is. Staff only; null for a player and for a hand-typed foe. */
  creatureRef: ContentRef | null;
  /** What this combatant has spent since their turn began (05). */
  turn: TurnState;
  /** The spell being concentrated on, as a `refKey` (07). Null when none is named. */
  concentrationSpell: string | null;
  /** Another shape worn for now (07): its label, hit points and AC. Null when itself. */
  form: EntryForm | null;
  /**
   * Feet a turn: the sheet's or the block's speed after conditions and
   * exhaustion (`speedFor`). The board lights `movementBudget(turn, speed)`
   * of it on the combatant's own turn, and the strip counts against it.
   */
  speed: number;
  /** Rows sharing one act on one turn (11). Null acts alone. */
  groupId: string | null;
  /**
   * Legendary actions and resistances left, and whether the lair fights
   * (11). Staff only — a player is not told how many resistances a lich has
   * left — so null for them, and for the ordinary.
   */
  legendary: Legendary | null;
}

export interface RollRow {
  id: string;
  actorName: string;
  characterId: string | null;
  label: string;
  notation: string;
  dice: number[];
  dropped: number[];
  modifier: number;
  total: number;
  visibility: 'table' | 'dm';
  /** The faces were read off real dice; the sum is still the server's. */
  physical: boolean;
  createdAt: string;
  /**
   * What an attack decided (06), or null for a plain roll. Already filtered
   * for the reader: a player never sees the AC, and sees hit / miss only
   * where the table shows it.
   */
  outcome: RollOutcome | null;
}

export interface HandoutRow {
  id: string;
  kind: 'image' | 'note';
  title: string;
  body: string | null;
  filePath: string | null;
  mime: string | null;
  visibility: 'dm' | 'shared' | 'selected';
  createdAt: string;
  /** Who a `selected` handout went to. Names, for the DM's list. */
  targetNames: string[];
}

/** A countdown the table can watch. `endsAt` is an instant; the browser ticks. */
export interface TimerRow {
  id: string;
  label: string;
  endsAt: string;
  startedAt: string;
  visibility: 'dm' | 'shared';
  stoppedAt: string | null;
  /** Held by an X-card tap (0067). Time left is `endsAt − pausedAt`. */
  pausedAt: string | null;
}

/** The evening being played, when there is one. */
export interface SittingRow {
  id: string;
  number: number;
  title: string;
  startedAt: string | null;
}

export interface LiveState {
  role: CampaignRole;
  /**
   * Which of the three tables the campaign is at. **Derived**: no sitting is
   * the desk; a sitting with no fight running is the table; a sitting with a
   * fight running is the sand table. The DM already has the two verbs that
   * change it, and a stored mode would only ever disagree with them.
   */
  table: TableKind;
  /** The sitting in progress, or null. This is what makes a room a room. */
  sitting: SittingRow | null;
  /**
   * Who has the table open right now.
   *
   * Derived from held connections, never stored: presence is true only while a
   * socket is open, and a row asserting it outlives the truth and needs a
   * reaper that will one day miss somebody who closed their laptop.
   */
  watchers: Watcher[];
  encounter: EncounterRow | null;
  entries: EntryRow[];
  handouts: HandoutRow[];
  rolls: RollRow[];
  /** Running countdowns. Staff see their own hidden ones; players do not. */
  timers: TimerRow[];
  /**
   * What the DM has asked for, role-filtered — a hidden DC never appears.
   *
   * On `LiveState` rather than behind a poller of its own, for the reason
   * `DmScreen` already gives about panels: one answer, one request.
   */
  checks: CheckRow[];
  /**
   * Every seated character's at-the-table numbers.
   *
   * Here rather than behind a read of its own, which is what it had: the party
   * panel loaded once on mount and reloaded only on its own actions, so a
   * player spending a hit die reached the DM's screen whenever the DM happened
   * to remount the panel. One answer, one request — `DmScreen` makes the same
   * argument about pollers.
   */
  party: PlayState[];
  /**
   * The map the DM has put in front of everybody, with the pins this viewer
   * may see on it. Null when nothing is lit.
   */
  spotlight: MapRow | null;
  /**
   * The battlefield on the table, fogged for a player. Null when none is
   * active or a player may not see it. Read here rather than behind a poller
   * of its own, so there is one filter for everything a player sees of a
   * fight.
   */
  battlemap: BattleMapState;
  /**
   * Portrait URLs by character id, for every seated character in the fight.
   * The sand table's token art — `character_portraits` was always this. Each
   * is role-checked by `portraitsFor`, so a viewer only gets the ones they may
   * look at, which at their own table is all of them.
   */
  portraits: Record<string, string>;
  /**
   * The whispering this viewer may read — what they said, what was said to
   * them, and for staff everything. Filtered in `whispers.ts`, which is the
   * one place that decides.
   */
  whispers: WhisperRow[];
  /** The viewer's own linked character, so the tracker can say "your turn". */
  viewerCharacterId: string | null;
  /**
   * The rules in force: the campaign's table rules with the running fight's
   * overrides on top. Role-neutral — nothing in it is secret — and read here
   * so the shelf panels share one object rather than each fetching settings.
   */
  rules: TableRules;
  /**
   * Everything in the fight with a clock on it — timed conditions, named
   * effects, the room's countdowns. A hidden countdown is dropped for a
   * player in `listEffects`, not in a component. Empty with no encounter.
   */
  effects: EffectRow[];
  /**
   * The world's clock (10): the calendar and where it stands, or null when
   * the table has not started counting. Role-neutral — a date is not a
   * secret — and read here so the mode bar and the chronicle share one.
   */
  clock: WorldClock;
  /** The rest in progress, or null. Who has answered is on it. */
  rest: RestRow | null;
  /**
   * Whose turn it is (11): every entry id sharing the current turn — one
   * for an ordinary combatant, all of them for a group. Derived from
   * `turnIndex` over the displayed order, here, so no surface re-derives
   * the group rule.
   */
  turnEntryIds: string[];
  /** The last thing the DM can take back (11). Staff only; null for a player. */
  undo: { label: string; recordedAt: string } | null;
  /** What is playing for the table (12), or null. Listening is the reader's own. */
  ambience: Ambience | null;
}
