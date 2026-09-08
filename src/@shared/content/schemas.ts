/**
 * The stat shape of each content type — what `homebrew.data` must contain, and
 * what an SRD row is adapted into.
 *
 * Two shapes, chosen deliberately:
 *
 * - **class / subclass / species / background / feat** mirror the *parsed*
 *   interfaces in `@/@creator/character/lib/srd/types`. Open5e keeps a class's
 *   proficiencies and starting equipment inside a markdown table in its prose,
 *   which is why `srd/parse.ts` exists at all — but a form has no prose to
 *   parse. A homebrew author fills the parsed fields directly, so homebrew
 *   needs no parser and the wizard consumes both sources through one type.
 *
 * - **spell / item** mirror the *raw* Open5e field names (`level`, `school`,
 *   `casting_time`, `damage_types`, `rarity`, `requires_attunement`, …),
 *   because those rows have never been parsed — `ReferenceBrowser` and the
 *   compendium pages read them raw. Renaming them here would fork the one
 *   shape the app already displays.
 *
 * Everything is defaulted. A half-filled homebrew row is a normal state — a
 * player sketches a spell, names it, and comes back for the damage later — so
 * validation must never reject an incomplete draft, only a malformed one.
 */
import { z } from 'zod';

import { ABILITY_KEYS, SKILL_KEYS } from '@/@creator/character/schema';

import { CONTENT_TYPES, type ContentType } from './types';

/**
 * Every leaf carries `.catch()`, so one bad field degrades to its default
 * instead of discarding the whole stat block. Learned the hard way: an
 * object-level failure silently returned an all-defaults Wizard — hit die 8,
 * caster type NONE, no features — which looks like real data and is not.
 */
const text = (max: number) => z.string().trim().max(max).default('').catch('');
const flag = z.boolean().default(false).catch(false);
const count = (max: number, fallback = 0) =>
  z.number().int().min(0).max(max).default(fallback).catch(fallback);

const abilityKey = z.enum(ABILITY_KEYS);
const skillKey = z.enum(SKILL_KEYS);

/** An array that survives a malformed sibling: bad elements are dropped. */
const listOf = <T extends z.ZodTypeAny>(schema: T, max: number) =>
  z
    .array(z.any())
    .max(max)
    .default([])
    .catch([])
    .transform(items =>
      items
        .map(item => schema.safeParse(item))
        .filter((r): r is { success: true; data: z.infer<T> } => r.success)
        .map(r => r.data)
    );

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

/** One lettered starting-equipment package. Mirrors `EquipmentOption`. */
const equipmentOption = z.object({
  label: text(8),
  desc: text(1000),
  gp: count(100_000),
});

/** A pick offered inside a trait's prose (lineages, ancestries). */
const traitChoice = z.object({
  label: text(120),
  detail: text(400),
});

/** Mirrors `SpeciesTrait`. */
const speciesTrait = z.object({
  name: text(120),
  // SRD traits run to ~1.5k; homebrew is given room to be wordier.
  desc: text(8000),
  options: listOf(traitChoice, 30),
});

/**
 * Mirrors `ClassFeature`. `levels` is the character levels the feature is
 * gained at; `detailByLevel` is the per-level qualifier ("two uses").
 */
const classFeature = z.object({
  key: text(80),
  name: text(120),
  // The longest SRD class feature is ~7.2k characters.
  desc: text(20_000),
  levels: listOf(z.number().int().min(1).max(20), 20),
  detailByLevel: z.record(z.string(), z.string()).default({}).catch({}),
});

/** Mirrors `SkillChoice`. An empty `options` means "any skill". */
const skillChoice = z
  .object({
    count: count(18),
    options: listOf(skillKey, 18),
  })
  .nullable()
  .default(null)
  .catch(null);

/** Mirrors `CoreTraits`. */
const coreTraits = z.object({
  primaryAbilities: listOf(abilityKey, 6),
  savingThrows: listOf(abilityKey, 6),
  skillChoice,
  weapons: text(1000),
  armor: text(1000),
  tools: text(1000),
  equipment: listOf(equipmentOption, 8),
});

const CASTER_TYPES = ['NONE', 'FULL', 'HALF', 'THIRD', 'PACT'] as const;

/* ------------------------------------------------------------------ *
 * The seven
 * ------------------------------------------------------------------ */

export const classData = z.object({
  hitDie: z.number().int().min(1).max(20).default(8).catch(8),
  casterType: z.enum(CASTER_TYPES).default('NONE').catch('NONE'),
  coreTraits: coreTraits
    .default(() => coreTraits.parse({}))
    .catch(() => coreTraits.parse({})),
  features: listOf(classFeature, 80),
  /** Character level a subclass is chosen at. 3 for every 2024 class. */
  subclassLevel: z.number().int().min(1).max(20).default(3).catch(3),
  /** Levels granting an Ability Score Improvement. */
  asiLevels: z
    .array(z.number().int().min(1).max(20))
    .max(20)
    .default([4, 8, 12, 16, 19])
    .catch([4, 8, 12, 16, 19]),
  /** `spellSlots[slotLevel][characterLevel]` -> slots. Sparse. */
  spellSlots: z
    .record(z.string(), z.record(z.string(), z.number().int().min(0).max(9)))
    .default({})
    .catch({}),
  blurb: text(600),
});

export const subclassData = z.object({
  /** The class this subclass hangs off — a homebrew id or an SRD slug. */
  parentClass: text(120),
  features: listOf(classFeature, 60),
  blurb: text(600),
});

export const speciesData = z.object({
  /** More than one size means the player picks. */
  sizes: listOf(text(20), 6),
  speed: count(200, 30),
  traits: listOf(speciesTrait, 30),
  /** True when a trait grants a free skill proficiency. */
  grantsSkillChoice: flag,
  blurb: text(600),
});

export const backgroundData = z.object({
  /** The three abilities its increase may be spread across. */
  abilityOptions: listOf(abilityKey, 6),
  skills: listOf(skillKey, 18),
  tool: text(400),
  feat: text(400),
  equipment: listOf(equipmentOption, 8),
});

export const featData = z.object({
  /** Origin | General | Fighting Style | Epic Boon. */
  category: text(60),
  prerequisite: text(400),
  /** One line per benefit, matching Open5e's `benefits[].desc`. */
  benefits: listOf(text(4000), 20),
});

const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;

const SPELL_SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const;

export const spellData = z.object({
  /** 0 is a cantrip. */
  level: count(9),
  school: z.enum(SPELL_SCHOOLS).nullable().default(null).catch(null),
  casting_time: text(80),
  reaction_condition: text(400),
  range_text: text(80),
  duration: text(80),
  concentration: flag,
  ritual: flag,
  /** Verbal / somatic / material, plus what the material is. */
  verbal: flag,
  somatic: flag,
  material: flag,
  material_specified: text(400),
  material_consumed: flag,
  target_type: text(60),
  saving_throw_ability: abilityKey.nullable().default(null).catch(null),
  attack_roll: flag,
  /** Dice expression, e.g. `8d6`. */
  damage_roll: text(60),
  damage_types: listOf(z.enum(DAMAGE_TYPES), 13),
  /** How it scales in a higher slot. */
  higher_level: text(4000),
  /** Class names this spell is on the list for. */
  classes: listOf(text(60), 20),
});

const ITEM_KINDS = [
  'wondrous',
  'weapon',
  'armor',
  'gear',
  'consumable',
] as const;

const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
] as const;

/** Weapon stats. Present only when `kind === 'weapon'`. */
const weaponStats = z
  .object({
    damage_dice: text(60),
    damage_type: z.enum(DAMAGE_TYPES).nullable().default(null).catch(null),
    /** Normal / long range in feet. 0 for a melee weapon. */
    range: count(2000),
    long_range: count(2000),
    is_simple: flag,
    /** Free text: Finesse, Heavy, Two-Handed, a mastery property… */
    properties: listOf(text(60), 20),
  })
  .nullable()
  .default(null)
  .catch(null);

/** Armour stats. Present only when `kind === 'armor'`. */
const armorStats = z
  .object({
    category: z
      .enum(['light', 'medium', 'heavy', 'shield'])
      .default('light')
      .catch('light'),
    ac_base: count(30, 10),
    ac_add_dexmod: flag,
    /** Medium armour caps Dex at +2; null means uncapped. */
    ac_cap_dexmod: z
      .number()
      .int()
      .min(0)
      .max(10)
      .nullable()
      .default(null)
      .catch(null),
    strength_score_required: count(20),
    grants_stealth_disadvantage: flag,
  })
  .nullable()
  .default(null)
  .catch(null);

export const itemData = z.object({
  kind: z.enum(ITEM_KINDS).default('wondrous').catch('wondrous'),
  rarity: z.enum(RARITIES).default('common').catch('common'),
  requires_attunement: flag,
  attunement_detail: text(400),
  /** Pounds. Open5e stores these as decimal strings, hence not an integer. */
  weight: z.number().min(0).max(10_000).default(0).catch(0),
  /** Gold pieces. */
  cost: z.number().min(0).max(1_000_000).default(0).catch(0),
  charges: count(100),
  weapon: weaponStats,
  armor: armorStats,
});

/* ------------------------------------------------------------------ *
 * The lookup
 * ------------------------------------------------------------------ */

export const CONTENT_SCHEMAS = {
  class: classData,
  subclass: subclassData,
  species: speciesData,
  background: backgroundData,
  feat: featData,
  spell: spellData,
  item: itemData,
} as const satisfies Record<ContentType, z.ZodTypeAny>;

export type ClassData = z.infer<typeof classData>;
export type SubclassData = z.infer<typeof subclassData>;
export type SpeciesData = z.infer<typeof speciesData>;
export type BackgroundData = z.infer<typeof backgroundData>;
export type FeatData = z.infer<typeof featData>;
export type SpellData = z.infer<typeof spellData>;
export type ItemData = z.infer<typeof itemData>;

export type ContentDataFor<T extends ContentType> = z.infer<
  (typeof CONTENT_SCHEMAS)[T]
>;

/**
 * Coerce a stored `data` blob into its type's shape.
 *
 * Never throws, and degrades one field at a time: a row written before a field
 * existed, or half-filled by an author who walked away, yields that field's
 * default while every neighbouring field survives intact. The wholesale
 * fallback is only reached if the blob is not an object at all.
 */
export function parseContentData<T extends ContentType>(
  type: T,
  data: unknown
): ContentDataFor<T> {
  const schema = CONTENT_SCHEMAS[type];
  const result = schema.safeParse(data ?? {});
  return (result.success ? result.data : schema.parse({})) as ContentDataFor<T>;
}

/** A blank stat block for a new draft of this type. */
export function emptyContentData<T extends ContentType>(
  type: T
): ContentDataFor<T> {
  return CONTENT_SCHEMAS[type].parse({}) as ContentDataFor<T>;
}

/** Every type, for iteration. Re-exported so callers need one import. */
export { CONTENT_TYPES };
