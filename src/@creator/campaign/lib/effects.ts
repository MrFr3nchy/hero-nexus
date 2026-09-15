/**
 * Effects that end, and the clock that ends them.
 *
 * One row shape for three things a fight counts in rounds — a condition with
 * a duration, a named effect (Rage, Bless), a countdown that belongs to the
 * room — and the pure `tick` that `advanceTurn` runs after every turn. The
 * server owns the rows and the announcements; this module owns the rule of
 * *when* a thing expires, so it can be asserted against a whole round without
 * a database under it.
 *
 * Pure — no React, no DB, no `server-only`.
 */
import type { AbilityKey } from '@/@creator/character/schema';
import { ABILITY_LABELS } from '@/@creator/character/schema';
import { conditionDef, type ConditionKey } from './conditions';

export const EFFECT_KINDS = ['condition', 'effect', 'countdown'] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];
export type EndsOn = 'start' | 'end';

/** Rounds a countdown or a duration may run. Ten minutes of fighting. */
export const MAX_ROUNDS = 100;

export interface EffectRow {
  id: string;
  encounterId: string;
  /** Who it is on. Null for a countdown that belongs to the room. */
  entryId: string | null;
  kind: EffectKind;
  conditionKey: ConditionKey | null;
  label: string;
  /** Null is until removed — or until saved, when `saveAbility` is set. */
  roundsLeft: number | null;
  endsOn: EndsOn;
  /** Whose turn it is measured on. Null: the affected entry's own. */
  anchorEntryId: string | null;
  saveAbility: AbilityKey | null;
  saveDc: number | null;
  sourceEntryId: string | null;
  sourceLabel: string;
  concentration: boolean;
  visibility: 'dm' | 'shared';
  createdAt: string;
}

/** What one `advanceTurn` tells the clock. */
export interface TickMoment {
  /** The entry whose turn just ended. Null when nothing had the turn. */
  endedEntryId: string | null;
  /** The entry whose turn now begins. */
  beganEntryId: string | null;
  /** The order wrapped: the top of a new round. */
  newRound: boolean;
}

export interface TickResult {
  /** Every row that survives, with `roundsLeft` moved where it moved. */
  remaining: EffectRow[];
  /** Rows that ran out this moment. A countdown at zero *fires*. */
  expired: EffectRow[];
  /**
   * Rows whose save falls due now, still in `remaining`. The server puts
   * each to its entry — a hero through the Asking, a foe rolled behind the
   * screen — and a pass ends it.
   */
  prompts: EffectRow[];
}

/**
 * The turn an effect is measured on.
 *
 * Its anchor when it has one, else its own entry. A caster who left the
 * fight leaves `anchorEntryId` null (SET NULL on delete), so the fallback
 * is what keeps Bless counting down after the cleric is dragged off.
 */
export function anchorOf(effect: EffectRow): string | null {
  return effect.anchorEntryId ?? effect.entryId;
}

/** Whether this effect's moment is this tick. */
function due(effect: EffectRow, moment: TickMoment): boolean {
  const anchor = anchorOf(effect);
  // A room countdown has nobody's turn to wait for: it counts at the top.
  if (anchor === null) return moment.newRound;
  if (effect.endsOn === 'end') return anchor === moment.endedEntryId;
  return anchor === moment.beganEntryId;
}

/**
 * Move the clock one turn.
 *
 * For every effect whose moment this is: the rounds come down by one; at
 * zero it expires; still standing and carrying a save, it is prompted. A row
 * with no rounds and a save is prompted every time its moment comes round —
 * Hold Person's "until saved". A row with neither is left alone: "until
 * removed" means exactly that.
 *
 * Order in `remaining` is preserved, so a list drawn from it does not shuffle
 * under the reader's eye every six seconds.
 */
export function tick(
  effects: readonly EffectRow[],
  moment: TickMoment
): TickResult {
  const remaining: EffectRow[] = [];
  const expired: EffectRow[] = [];
  const prompts: EffectRow[] = [];

  for (const effect of effects) {
    if (!due(effect, moment)) {
      remaining.push(effect);
      continue;
    }
    const hasSave = effect.saveAbility !== null && effect.saveDc !== null;
    if (effect.roundsLeft === null) {
      remaining.push(effect);
      if (hasSave) prompts.push(effect);
      continue;
    }
    const left = effect.roundsLeft - 1;
    if (left <= 0) {
      expired.push({ ...effect, roundsLeft: 0 });
      continue;
    }
    const next = { ...effect, roundsLeft: left };
    remaining.push(next);
    if (hasSave) prompts.push(next);
  }

  return { remaining, expired, prompts };
}

/* --- how one reads ----------------------------------------------------- */

/** The name on the chip: the condition's label, or the free label. */
export function effectName(
  effect: Pick<EffectRow, 'kind' | 'conditionKey' | 'label'>
): string {
  if (effect.kind === 'condition' && effect.conditionKey) {
    return conditionDef(effect.conditionKey)?.label ?? effect.conditionKey;
  }
  return effect.label || (effect.kind === 'countdown' ? 'Countdown' : 'Effect');
}

/** "3 rounds", "1 round", "until saved", "until removed". */
export function durationWords(
  effect: Pick<EffectRow, 'roundsLeft' | 'saveAbility' | 'saveDc'>
): string {
  const save = effect.saveAbility !== null && effect.saveDc !== null;
  if (effect.roundsLeft === null) return save ? 'until saved' : 'until removed';
  const rounds = `${effect.roundsLeft} round${effect.roundsLeft === 1 ? '' : 's'}`;
  return save ? `${rounds}, or until saved` : rounds;
}

/** "Wisdom save DC 15, at the end of each turn". Empty without a save. */
export function saveWords(
  effect: Pick<EffectRow, 'saveAbility' | 'saveDc' | 'endsOn'>
): string {
  if (effect.saveAbility === null || effect.saveDc === null) return '';
  const ability = ABILITY_LABELS[effect.saveAbility] ?? effect.saveAbility;
  return `${ability} save DC ${effect.saveDc}, at the ${effect.endsOn} of each turn`;
}

/**
 * The tooltip under a chip, one line: duration, save, source. Composed here
 * so the tracker, the play card and the board say the same thing about the
 * same row.
 */
export function effectDetail(effect: EffectRow): string {
  const parts = [durationWords(effect)];
  const save = saveWords(effect);
  if (save) parts.push(save);
  if (effect.sourceLabel) parts.push(`from ${effect.sourceLabel}`);
  if (effect.concentration) parts.push('concentration');
  return parts.join(' · ');
}
