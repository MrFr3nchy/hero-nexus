/**
 * Pure derived-value helpers for a D&D 5e (2024) character sheet.
 * These are never stored — always recompute from the sheet inputs.
 */
import { parseContentData, refKey, type ContentEntry } from '@/@shared/content';

import type {
  AbilityKey,
  CharacterSheet,
  InventoryItem,
  SkillKey,
} from '../schema';
import { MAX_ATTUNED, SKILL_ABILITY } from '../schema';

/**
 * Content the sheet points at, keyed by `refKey`.
 *
 * The sheet stores references, not stats, so anything that needs an item's
 * numbers needs this alongside it — see `resolveContentRefs` in
 * `@/server/content`. Every function taking it treats an unresolved ref as
 * absent rather than as zero, so a deleted homebrew item cannot quietly change
 * a character's armour class.
 */
export type ResolvedContent = Map<string, ContentEntry>;

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

/* ------------------------------------------------------------------ *
 * Inventory-derived values
 * ------------------------------------------------------------------ */

/** Rows the character is attuned to. The truth about attunement. */
export function attunedItems(sheet: CharacterSheet): InventoryItem[] {
  return sheet.inventory.filter(i => i.attuned);
}

/**
 * How many attunement slots are in use.
 *
 * Supersedes `equipment.attunedCount`, which was a number a player typed with
 * nothing behind it — it could say 0 while three attuned items sat on the
 * sheet.
 */
export function attunedCount(sheet: CharacterSheet): number {
  return attunedItems(sheet).length;
}

export function overAttuned(sheet: CharacterSheet): boolean {
  return attunedCount(sheet) > MAX_ATTUNED;
}

/** The armour stats of one inventory row, if it resolves to armour. */
function armorOf(
  item: InventoryItem,
  resolved: ResolvedContent
): {
  category: string;
  base: number;
  addDex: boolean;
  capDex: number | null;
} | null {
  if (!item.ref) return null;
  const entry = resolved.get(refKey(item.ref));
  if (!entry || entry.type !== 'item') return null;
  const data = parseContentData('item', entry.data);
  if (!data.armor) return null;
  return {
    category: data.armor.category,
    base: data.armor.ac_base,
    addDex: data.armor.ac_add_dexmod,
    capDex: data.armor.ac_cap_dexmod,
  };
}

/**
 * Armour class from what the character is actually wearing.
 *
 * Previously a flat `10 + Dex` that ignored armour entirely, so a character in
 * plate had the same AC as one in a shirt. Unarmoured is still `10 + Dex`;
 * body armour replaces the 10 and decides whether Dex applies; a shield adds
 * on top. Without resolved content this returns the unarmoured value rather
 * than guessing.
 */
export function armorClass(
  sheet: CharacterSheet,
  resolved: ResolvedContent = new Map()
): number {
  const dex = abilityMod(sheet, 'dexterity');
  const worn = sheet.inventory
    .filter(i => i.equipped)
    .map(i => armorOf(i, resolved))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const shields = worn.filter(a => a.category === 'shield');
  const body = worn.filter(a => a.category !== 'shield');

  // Wearing two breastplates is not a rule, it is a mistake; take the best
  // rather than stacking them.
  let base = 10 + dex;
  if (body.length > 0) {
    base = Math.max(
      ...body.map(a =>
        a.addDex
          ? a.base + (a.capDex == null ? dex : Math.min(dex, a.capDex))
          : a.base
      )
    );
  }

  // Shields do stack with armour, but only one shield can be held.
  const shieldBonus =
    shields.length > 0 ? Math.max(...shields.map(s => s.base)) : 0;
  return base + shieldBonus;
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
