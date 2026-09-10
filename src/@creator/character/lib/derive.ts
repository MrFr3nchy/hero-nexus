/**
 * Pure derived-value helpers for a D&D 5e (2024) character sheet.
 * These are never stored — always recompute from the sheet inputs.
 */
import {
  hasProperty,
  isProficientWith,
  isWeaponMastery,
  parseContentData,
  refKey,
  type ContentEntry,
  type WeaponFacts,
  type WeaponMastery,
} from '@/@shared/content';

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

/* ------------------------------------------------------------------ *
 * Attacks
 * ------------------------------------------------------------------ */

/** One line of the attacks table: a weapon, ready to roll. */
export interface WeaponAttack {
  /** The inventory row this came from, so a caller can key on it. */
  itemId: string;
  name: string;
  /** Which ability the attack and damage use. */
  ability: AbilityKey;
  proficient: boolean;
  attackBonus: number;
  /** e.g. "1d8+3". Empty when the weapon has no damage dice. */
  damage: string;
  /** Two-handed damage for a Versatile weapon, else ''. */
  versatileDamage: string;
  damageType: string | null;
  /** 0 for a melee weapon with no thrown range. */
  range: number;
  longRange: number;
  mastery: WeaponMastery | null;
  properties: string[];
}

/** The weapon stats of one inventory row, if it resolves to a weapon. */
function weaponOf(
  item: InventoryItem,
  resolved: ResolvedContent
): WeaponFacts | null {
  if (!item.ref) return null;
  const entry = resolved.get(refKey(item.ref));
  if (!entry || entry.type !== 'item') return null;
  const data = parseContentData('item', entry.data);
  if (!data.weapon) return null;
  const w = data.weapon;
  return {
    name: entry.name || item.name,
    damageDice: w.damage_dice,
    damageType: w.damage_type,
    range: w.range,
    longRange: w.long_range,
    isSimple: w.is_simple,
    properties: w.properties,
    mastery: isWeaponMastery(w.mastery) ? w.mastery : null,
    versatileDice: w.versatile_dice,
  };
}

/**
 * Which ability a weapon attacks with.
 *
 * Strength for melee, Dexterity for ranged, and for a Finesse weapon the
 * better of the two — which is the character's choice in the rules, but a
 * choice nobody ever makes the worse way, so offering it as a control would be
 * a question with one answer.
 */
function attackAbility(sheet: CharacterSheet, weapon: WeaponFacts): AbilityKey {
  const str = abilityMod(sheet, 'strength');
  const dex = abilityMod(sheet, 'dexterity');
  if (hasProperty(weapon, 'Finesse')) {
    return dex > str ? 'dexterity' : 'strength';
  }
  // Thrown weapons keep their melee ability; a thrown handaxe is Strength.
  const ranged = weapon.range > 0 && !hasProperty(weapon, 'Thrown');
  return ranged ? 'dexterity' : 'strength';
}

/** Append a signed modifier to a damage expression: "1d8" + 3 -> "1d8+3". */
function withMod(dice: string, mod: number): string {
  if (!dice) return '';
  if (mod === 0) return dice;
  return mod > 0 ? `${dice}+${mod}` : `${dice}${mod}`;
}

/**
 * Every equipped weapon, as an attack line.
 *
 * The proficiency bonus applies only when the character is actually proficient
 * — which is the whole reason `proficiencies.weaponProficiency` exists. Before
 * it, weapon proficiency was a 62-character sentence and nothing could tell a
 * Wizard holding a greatsword from a Fighter holding one.
 *
 * A non-proficient weapon still appears, without the bonus. Hiding it would
 * make an equipped weapon vanish from the sheet with nothing to say why;
 * showing it and being honest about the arithmetic is the better failure.
 *
 * Only equipped rows, and only ones whose content resolves — an unresolved ref
 * is absent rather than a weapon with no stats, the same bargain `armorClass`
 * makes above.
 */
export function weaponAttacks(
  sheet: CharacterSheet,
  resolved: ResolvedContent = new Map()
): WeaponAttack[] {
  const pb = proficiencyBonus(sheet.identity.level);
  const prof = sheet.proficiencies.weaponProficiency;

  return sheet.inventory
    .filter(item => item.equipped)
    .map(item => {
      const weapon = weaponOf(item, resolved);
      if (!weapon) return null;
      const ability = attackAbility(sheet, weapon);
      const mod = abilityMod(sheet, ability);
      const proficient = isProficientWith(prof, weapon);
      return {
        itemId: item.id,
        name: weapon.name,
        ability,
        proficient,
        attackBonus: mod + (proficient ? pb : 0),
        damage: withMod(weapon.damageDice, mod),
        versatileDamage: withMod(weapon.versatileDice, mod),
        damageType: weapon.damageType,
        range: weapon.range,
        longRange: weapon.longRange,
        mastery: weapon.mastery,
        properties: weapon.properties,
      } satisfies WeaponAttack;
    })
    .filter((a): a is WeaponAttack => a !== null);
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
