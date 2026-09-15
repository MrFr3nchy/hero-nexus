/**
 * Casting, decided: what a spell asks of a slot, a save, a target's hit
 * points and the fight's clock — before anything is rolled or written.
 *
 * `server/casting.ts` pays, rolls, asks and records; this module answers the
 * questions it needs answered so they can be asserted without a table under
 * them. Pure — no React, no DB, no `server-only`.
 */
import type { ContentRef, SpellData } from '@/@shared/content';
import type { ConditionKey } from './conditions';

/** Concentration DC after damage: at least 10, else half the damage. */
export function concentrationDc(damage: number): number {
  return Math.max(10, Math.floor(Math.max(0, damage) / 2));
}

/**
 * The dice a spell rolls in a given slot: the row for that level when the
 * data has one, else the highest row at or below it, else the spell's own.
 * `1d8` for Cure Wounds at 1st, `4d8` at 2nd.
 */
export function scaledRoll(
  spell: Pick<SpellData, 'level' | 'damage_roll' | 'healing_roll' | 'slot_scaling'>,
  slotLevel: number | null,
  kind: 'damage' | 'healing'
): string {
  const base = kind === 'damage' ? spell.damage_roll : spell.healing_roll;
  if (!base || slotLevel === null || slotLevel <= spell.level) return base;
  const rows = [...spell.slot_scaling]
    .filter(r => r.level <= slotLevel && r.level > spell.level)
    .sort((a, b) => b.level - a.level);
  return rows[0]?.roll || base;
}

/** What a target that passed its save takes: none, half (rounded down), or all. */
export function damageAfterSave(
  amount: number,
  passed: boolean,
  effect: SpellData['save_effect']
): number {
  if (!passed) return amount;
  if (effect === 'negates') return 0;
  if (effect === 'half') return Math.floor(amount / 2);
  return amount;
}

/** The slot a casting spends, or null for a cantrip or a ritual. */
export function slotToSpend(
  spell: Pick<SpellData, 'level' | 'ritual'>,
  requested: number | null,
  ritual: boolean
): number | null {
  if (spell.level === 0) return null;
  if (ritual && spell.ritual) return null;
  return Math.max(spell.level, Math.min(9, Math.trunc(requested ?? spell.level)));
}

/** Which turn slot a casting time spends: "1 Bonus Action" → bonus, "1 Reaction" → reaction, else the action. */
export function castingSlot(
  castingTime: string
): 'action' | 'bonus' | 'reaction' | null {
  const t = castingTime.toLowerCase();
  if (/bonus action/.test(t)) return 'bonus';
  if (/reaction/.test(t)) return 'reaction';
  if (/\baction\b/.test(t)) return 'action';
  // A minute, an hour: not a thing a turn spends.
  return null;
}

/* --- another shape --------------------------------------------------------- */

/**
 * A combatant wearing another creature's block — Polymorph, Wild Shape, a
 * summon's binding. Stored on `initiative_entries.form` (0053).
 */
export interface EntryForm {
  creatureRef: ContentRef;
  label: string;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  /** At 0 hit points the form drops and the combatant is itself again. */
  revertsOnZero: boolean;
  /** Wild Shape: damage past 0 carries to the real hit points. Polymorph drops it. */
  carryExcess: boolean;
  /** The effect row whose end — duration or concentration — ends the form. */
  effectId: string | null;
}

/**
 * Damage landing on a shape: the form's hit points take it first. Returns
 * the form after (null when it dropped) and what carries to the combatant's
 * own pool — zero unless `carryExcess`.
 */
export function damageForm(
  form: EntryForm,
  damage: number
): { form: EntryForm | null; carried: number } {
  const dmg = Math.max(0, Math.trunc(damage));
  const left = form.hpCurrent - dmg;
  if (left > 0) return { form: { ...form, hpCurrent: left }, carried: 0 };
  if (!form.revertsOnZero) return { form: { ...form, hpCurrent: 0 }, carried: 0 };
  return { form: null, carried: form.carryExcess ? -left : 0 };
}

/** The condition a spell puts on a target, if any — typed for the effects table. */
export function conditionOf(spell: Pick<SpellData, 'applies_condition'>): ConditionKey | null {
  return (spell.applies_condition as ConditionKey | null) ?? null;
}
