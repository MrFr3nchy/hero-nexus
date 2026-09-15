/**
 * What a condition does — to a roll, to speed, to what a turn may hold.
 *
 * `conditions.ts` is the vocabulary: a key, a label, the one line a DM reads
 * mid-turn. This is the arithmetic behind that line, in one place, so that
 * RollPanel, AttacksPanel, the Asking's answer, the board's lit reach and the
 * action strip (05) all ask here and none of them hardcodes "poisoned means
 * disadvantage" on its own.
 *
 * Everything here is *advice* in the sense `improvements.txt` uses the word:
 * these functions say what the 2024 rules say. Whether a surface defaults to
 * it, insists on it, or merely mentions it is that surface's call under the
 * table's mode (01). A player can always flip a default back.
 *
 * Pure — no React, no DB, no `server-only`. Safe on both sides of the wire.
 */
import type { AbilityKey } from '@/@creator/character/schema';
import { CONDITIONS, type ConditionKey } from './conditions';

export type RollMode = 'flat' | 'advantage' | 'disadvantage';
export type D20Kind = 'attack' | 'check' | 'save';

/** A default roll mode, and the words that justify it beside the picker. */
export interface RollAdvice {
  mode: RollMode;
  /** "Poisoned · disadvantage". Empty when the mode is flat for no reason. */
  because: string[];
}

const LABEL = new Map(CONDITIONS.map(c => [c.key, c.label]));
const label = (key: ConditionKey) => LABEL.get(key) ?? key;

/** The conditions that carry `incapacitated` with them. */
const INCAPACITATING: ReadonlySet<ConditionKey> = new Set<ConditionKey>([
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

/** Speed 0, whatever the sheet says. */
const ROOTED: ReadonlySet<ConditionKey> = new Set<ConditionKey>([
  'grappled',
  'restrained',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

/**
 * Advantage and disadvantage cancel, however many of each — one rule the
 * 2024 book keeps from 2014. Everything below folds through this.
 */
function fold(advantage: number, disadvantage: number): RollMode {
  if (advantage > 0 && disadvantage > 0) return 'flat';
  if (advantage > 0) return 'advantage';
  if (disadvantage > 0) return 'disadvantage';
  return 'flat';
}

/**
 * The mode a d20 test made *by* somebody under these conditions defaults to.
 *
 * Exhaustion is deliberately absent: the 2024 rule is a flat penalty
 * (`d20PenaltyFor`), not disadvantage. Frightened is included though the
 * rule depends on the source being in sight, because the app cannot see and
 * the DM can — the words say so, and the player flips it if the DM agrees.
 */
export function rollAdvice(
  conditions: readonly ConditionKey[],
  what: D20Kind,
  ability?: AbilityKey | null,
  turn?: TurnFlags
): RollAdvice {
  const because: string[] = [];
  let advantage = 0;
  let disadvantage = 0;
  const has = (k: ConditionKey) => conditions.includes(k);
  const worse = (k: ConditionKey, note?: string) => {
    disadvantage += 1;
    because.push(`${label(k)} · disadvantage${note ? ` ${note}` : ''}`);
  };

  if (what === 'attack' || what === 'check') {
    if (has('poisoned')) worse('poisoned');
    if (has('frightened')) worse('frightened', 'while the source is in sight');
  }
  if (what === 'attack') {
    if (has('blinded')) worse('blinded');
    if (has('prone')) worse('prone');
    if (has('restrained')) worse('restrained');
    if (has('grappled')) worse('grappled', 'against anything but the grappler');
    if (has('invisible')) {
      advantage += 1;
      because.push('Invisible · advantage');
    }
  }
  if (what === 'save' && ability === 'dexterity' && has('restrained')) {
    worse('restrained');
  }
  // Dodge (05): advantage on DEX saves until the next turn — unless the
  // dodger is incapacitated or rooted, when the book says it lapses.
  if (
    what === 'save' &&
    ability === 'dexterity' &&
    turn?.dodging &&
    dodgeHolds(conditions)
  ) {
    advantage += 1;
    because.push('Dodging · advantage');
  }

  // When both sides claimed it the mode is flat and the words stay, so the
  // picker explains a straight roll rather than pretending nothing applied.
  return { mode: fold(advantage, disadvantage), because };
}

/** `rollAdvice(...).mode`, for callers that want only the answer. */
export function rollModeFor(
  conditions: readonly ConditionKey[],
  what: D20Kind,
  ability?: AbilityKey | null,
  turn?: TurnFlags
): RollMode {
  return rollAdvice(conditions, what, ability, turn).mode;
}

/**
 * The turn-state flags that bear on a roll (05). Only what a roll needs,
 * so this module does not have to know the whole `TurnState`.
 */
export interface TurnFlags {
  dodging?: boolean;
}

/** Dodge lapses while incapacitated or at speed 0. */
export function dodgeHolds(conditions: readonly ConditionKey[]): boolean {
  return (
    !conditions.some(k => INCAPACITATING.has(k)) &&
    !conditions.some(k => ROOTED.has(k))
  );
}

/** 2024 exhaustion: −2 on every d20 test per level. Level 6 is death. */
export function d20PenaltyFor(exhaustion: number): number {
  const level = Math.max(0, Math.min(6, Math.trunc(exhaustion)));
  // `0 - x`, not `-2 * 0`: the latter is `-0`, which a template renders as "-0".
  return level === 0 ? 0 : 0 - 2 * level;
}

/**
 * Speed in feet, after conditions and exhaustion.
 *
 * Grappled and restrained are 0 whatever the sheet says; prone crawls at
 * half; exhaustion takes 5 ft per level off whatever is left. Never negative.
 */
export function speedFor(
  baseSpeed: number,
  conditions: readonly ConditionKey[],
  exhaustion = 0
): number {
  if (conditions.some(k => ROOTED.has(k))) return 0;
  let speed = Math.max(0, baseSpeed);
  if (conditions.includes('prone')) speed = Math.floor(speed / 2 / 5) * 5;
  speed -= 5 * Math.max(0, Math.min(6, Math.trunc(exhaustion)));
  return Math.max(0, speed);
}

/**
 * Why the speed is what it is, for a status line — "Grappled · speed 0",
 * "Prone · crawling", "Exhaustion 2 · −10 ft". Empty when nothing applies.
 */
export function speedReasons(
  conditions: readonly ConditionKey[],
  exhaustion = 0
): string[] {
  const out: string[] = [];
  const rooted = conditions.find(k => ROOTED.has(k));
  if (rooted) out.push(`${label(rooted)} · speed 0`);
  else if (conditions.includes('prone')) out.push('Prone · crawling');
  const level = Math.max(0, Math.min(6, Math.trunc(exhaustion)));
  if (level > 0 && !rooted) out.push(`Exhaustion ${level} · −${level * 5} ft`);
  return out;
}

/** What a turn may hold. `incapacitated` and its kin take all but movement. */
export interface TurnAllowance {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  move: boolean;
}

export function canAct(conditions: readonly ConditionKey[]): TurnAllowance {
  const incapacitated = conditions.some(k => INCAPACITATING.has(k));
  const rooted = conditions.some(k => ROOTED.has(k));
  return {
    action: !incapacitated,
    bonus: !incapacitated,
    reaction: !incapacitated,
    move: !rooted,
  };
}

/**
 * The mode an attack made *against* somebody under these conditions defaults
 * to. `melee` matters for prone: easier to hit on the ground, harder from
 * across the room.
 */
export function attackedWith(
  targetConditions: readonly ConditionKey[],
  melee: boolean,
  targetTurn?: TurnFlags
): RollMode {
  let advantage = 0;
  let disadvantage = 0;
  if (targetTurn?.dodging && dodgeHolds(targetConditions)) disadvantage += 1;
  for (const key of targetConditions) {
    switch (key) {
      case 'blinded':
      case 'paralyzed':
      case 'petrified':
      case 'restrained':
      case 'stunned':
      case 'unconscious':
        advantage += 1;
        break;
      case 'prone':
        if (melee) advantage += 1;
        else disadvantage += 1;
        break;
      case 'invisible':
        disadvantage += 1;
        break;
      default:
        break;
    }
  }
  return fold(advantage, disadvantage);
}
