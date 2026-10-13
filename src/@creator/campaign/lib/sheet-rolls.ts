/**
 * Rolling off your own sheet: which roll, what it is worth, what it is called.
 *
 * Pure and client-safe, like `rules.ts` and `screen.ts`: the session screen
 * draws the buttons from `sheetBonuses`, and the server rolls with
 * `sheetRollBonus` — one function for both, so the number on the button is
 * the number in the log. The client only ever sends *which* roll; the bonus
 * is read off the sheet on the server.
 *
 * Not "checks": in this app a check is the DM asking somebody to roll
 * (docs/naming.md). These are the rolls a player makes unasked.
 */
import {
  abilityModifier,
  initiative,
  proficiencyBonus,
  savingThrow,
  skillBonus,
} from '@/@creator/character/lib/derive';
import {
  ABILITY_KEYS,
  SKILL_ABILITY,
  SKILL_KEYS,
  SKILL_LABELS,
  type AbilityKey,
  type CharacterSheet,
  type SkillKey,
} from '@/@creator/character/schema';

export type SheetRoll =
  | { kind: 'ability'; key: AbilityKey }
  | { kind: 'save'; key: AbilityKey }
  | { kind: 'skill'; key: SkillKey }
  | { kind: 'initiative' };

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

/** The three letters a sheet prints over a score. */
export const ABILITY_SHORT: Record<AbilityKey, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

const isAbility = (v: unknown): v is AbilityKey =>
  (ABILITY_KEYS as readonly unknown[]).includes(v);
const isSkill = (v: unknown): v is SkillKey =>
  (SKILL_KEYS as readonly unknown[]).includes(v);

/** Whether something off the wire names a roll this module knows. */
export function isSheetRoll(value: unknown): value is SheetRoll {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: unknown; key?: unknown };
  switch (v.kind) {
    case 'ability':
    case 'save':
      return isAbility(v.key);
    case 'skill':
      return isSkill(v.key);
    case 'initiative':
      return true;
    default:
      return false;
  }
}

/** "Stealth", "Dexterity save", "Strength", "Initiative" — the log's label. */
export function sheetRollLabel(roll: SheetRoll): string {
  switch (roll.kind) {
    case 'ability':
      return ABILITY_LABELS[roll.key];
    case 'save':
      return `${ABILITY_LABELS[roll.key]} save`;
    case 'skill':
      return SKILL_LABELS[roll.key];
    case 'initiative':
      return 'Initiative';
  }
}

/** What the sheet adds to the d20, before exhaustion. */
export function sheetRollBonus(sheet: CharacterSheet, roll: SheetRoll): number {
  switch (roll.kind) {
    case 'ability':
      return abilityModifier(sheet.abilities[roll.key].score);
    case 'save':
      return savingThrow(sheet, roll.key);
    case 'skill':
      return skillBonus(sheet, roll.key);
    case 'initiative':
      return initiative(sheet);
  }
}

/**
 * What kind of d20 test it is, for `rollAdvice`: a save, or a check (an
 * ability check in the book's sense — initiative is one), and the ability
 * behind it.
 */
export function sheetRollTest(roll: SheetRoll): {
  what: 'check' | 'save';
  ability: AbilityKey;
} {
  switch (roll.kind) {
    case 'ability':
      return { what: 'check', ability: roll.key };
    case 'save':
      return { what: 'save', ability: roll.key };
    case 'skill':
      return { what: 'check', ability: SKILL_ABILITY[roll.key] };
    case 'initiative':
      return { what: 'check', ability: 'dexterity' };
  }
}

/** Everything the buttons print, off one sheet. */
export interface SheetBonuses {
  abilities: Record<
    AbilityKey,
    { score: number; mod: number; save: number; proficientSave: boolean }
  >;
  skills: Record<SkillKey, { bonus: number; proficient: boolean }>;
  initiative: number;
}

export function sheetBonuses(sheet: CharacterSheet): SheetBonuses {
  const abilities = Object.fromEntries(
    ABILITY_KEYS.map(key => {
      const a = sheet.abilities?.[key];
      const score = a?.score ?? 10;
      return [
        key,
        {
          score,
          mod: abilityModifier(score),
          save: a ? savingThrow(sheet, key) : abilityModifier(score),
          proficientSave: a?.proficientSave ?? false,
        },
      ];
    })
  ) as SheetBonuses['abilities'];
  const prof = proficiencyBonus(sheet.identity?.level ?? 1);
  const skills = Object.fromEntries(
    SKILL_KEYS.map(key => {
      const proficient = !!sheet.skills?.[key];
      const mod = abilities[SKILL_ABILITY[key]].mod;
      return [key, { bonus: proficient ? mod + prof : mod, proficient }];
    })
  ) as SheetBonuses['skills'];
  return { abilities, skills, initiative: abilities.dexterity.mod };
}

/** "+3", "−1", "+0" — the way a sheet prints a modifier. */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/**
 * The notation the server rolls: one d20 (two, keeping one, with advantage
 * or disadvantage) plus the bonus, exhaustion already in it.
 */
export function sheetRollNotation(
  bonus: number,
  mode: 'straight' | 'advantage' | 'disadvantage'
): string {
  const die =
    mode === 'advantage'
      ? '2d20kh1'
      : mode === 'disadvantage'
        ? '2d20kl1'
        : '1d20';
  return bonus === 0 ? die : `${die}${bonus > 0 ? '+' : '-'}${Math.abs(bonus)}`;
}
