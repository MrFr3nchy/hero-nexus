/**
 * Pure derived-value helpers for a D&D 5e (2024) character sheet.
 * These are never stored — always recompute from the sheet inputs.
 */
import type { AbilityKey, CharacterSheet, SkillKey } from '../schema';
import { SKILL_ABILITY } from '../schema';

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** 2024 proficiency bonus by character level. */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
}

export function abilityMod(sheet: CharacterSheet, ability: AbilityKey): number {
  return abilityModifier(sheet.abilities[ability].score);
}

export function savingThrow(
  sheet: CharacterSheet,
  ability: AbilityKey
): number {
  const base = abilityMod(sheet, ability);
  return sheet.abilities[ability].proficientSave
    ? base + proficiencyBonus(sheet.identity.level)
    : base;
}

export function skillBonus(sheet: CharacterSheet, skill: SkillKey): number {
  const base = abilityMod(sheet, SKILL_ABILITY[skill]);
  return sheet.skills[skill]
    ? base + proficiencyBonus(sheet.identity.level)
    : base;
}

export function initiative(sheet: CharacterSheet): number {
  return abilityMod(sheet, 'dexterity');
}

export function passivePerception(sheet: CharacterSheet): number {
  return 10 + skillBonus(sheet, 'perception');
}

export function spellSaveDC(sheet: CharacterSheet): number | null {
  const ability = sheet.spellcasting.ability;
  if (!ability) return null;
  return (
    8 + proficiencyBonus(sheet.identity.level) + abilityMod(sheet, ability)
  );
}

export function spellAttackBonus(sheet: CharacterSheet): number | null {
  const ability = sheet.spellcasting.ability;
  if (!ability) return null;
  return proficiencyBonus(sheet.identity.level) + abilityMod(sheet, ability);
}

export const fmtBonus = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
