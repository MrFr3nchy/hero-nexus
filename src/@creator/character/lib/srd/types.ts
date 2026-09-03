/**
 * Typed shapes for the SRD build data the character creator runs on.
 *
 * These are *parsed* views of the raw Open5e v2 rows stored in
 * `reference_data` (see `src/db/sync-reference.ts`). Parsing lives in
 * `./parse`; loading lives in `./catalog` (server only). Nothing in this file
 * touches the database or React, so the wizard, the server, and tests all
 * share one vocabulary.
 */

import type { AbilityKey, SkillKey } from '../../schema';

/** Open5e's spellcasting progression tag on a class row. */
export type CasterType = 'NONE' | 'FULL' | 'HALF' | 'THIRD' | 'PACT';

/** A choice a player has to make, extracted from prose (lineages, ancestries). */
export interface TraitChoice {
  label: string;
  detail: string;
}

export interface SpeciesTrait {
  name: string;
  desc: string;
  /** Present when the trait's prose offers a list to pick from. */
  options: TraitChoice[];
}

export interface SpeciesDef {
  key: string;
  name: string;
  /** Sizes the species allows; more than one means the player picks. */
  sizes: string[];
  speed: number;
  traits: SpeciesTrait[];
  /** True when a trait grants a free skill proficiency (Elf, Human). */
  grantsSkillChoice: boolean;
  /** Short line for the picker card. */
  blurb: string;
}

export interface BackgroundDef {
  key: string;
  name: string;
  /** The three abilities its increase may be spread across. */
  abilityOptions: AbilityKey[];
  skills: SkillKey[];
  /** Free-text tool grant, e.g. "Thieves' Tools". */
  tool: string;
  /** Origin feat name, e.g. "Magic Initiate (Cleric)". */
  feat: string;
  equipment: EquipmentOption[];
}

/** One lettered starting-equipment package. */
export interface EquipmentOption {
  /** "A", "B", "C" */
  label: string;
  desc: string;
  /** Gold pieces named at the end of the package, if any. */
  gp: number;
}

export interface SkillChoice {
  count: number;
  /** Empty means "any skill". */
  options: SkillKey[];
}

export interface CoreTraits {
  primaryAbilities: AbilityKey[];
  savingThrows: AbilityKey[];
  skillChoice: SkillChoice | null;
  weapons: string;
  armor: string;
  tools: string;
  equipment: EquipmentOption[];
}

export interface ClassFeature {
  key: string;
  name: string;
  desc: string;
  /** Character levels this feature is gained at, ascending. */
  levels: number[];
  /** Per-level qualifier from Open5e (`gained_at[].detail`), e.g. "two uses". */
  detailByLevel: Record<number, string>;
  /** Set when the feature comes from the chosen subclass. */
  subclassKey?: string;
}

export interface SubclassDef {
  key: string;
  name: string;
  features: ClassFeature[];
  blurb: string;
}

export interface ClassDef {
  key: string;
  name: string;
  /** 6, 8, 10, 12 — parsed from `hit_dice`. */
  hitDie: number;
  casterType: CasterType;
  coreTraits: CoreTraits;
  features: ClassFeature[];
  /** Character level a subclass is chosen at (3 for every 2024 class). */
  subclassLevel: number;
  subclasses: SubclassDef[];
  /** `spellSlots[slotLevel][characterLevel]` -> slots. 1-indexed, sparse. */
  spellSlots: Record<number, Record<number, number>>;
  /** Extra class-table columns, e.g. "Cantrips", "Prepared Spells". */
  tableColumns: { name: string; byLevel: Record<number, string> }[];
  /** Levels that grant an Ability Score Improvement. */
  asiLevels: number[];
}

/** The slim per-class row shipped with the page for the picker grid. */
export interface ClassSummary {
  key: string;
  name: string;
  hitDie: number;
  casterType: CasterType;
  primaryAbilities: AbilityKey[];
  savingThrows: AbilityKey[];
  armor: string;
  weapons: string;
  subclassLevel: number;
  subclassNames: string[];
  blurb: string;
}

export interface FeatDef {
  key: string;
  name: string;
  type: string;
  prerequisite: string;
  desc: string;
}

/**
 * Everything the wizard needs up front. Class *detail* is deliberately not in
 * here — the full feature text for 24 classes is ~280 KB of JSON, so it is
 * fetched per class by `getClassBuildAction` once the player picks one.
 */
export interface BuildCatalog {
  classes: ClassSummary[];
  species: SpeciesDef[];
  backgrounds: BackgroundDef[];
  feats: FeatDef[];
  alignments: string[];
  languages: string[];
}
