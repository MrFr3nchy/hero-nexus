/**
 * Pure parsers that turn raw Open5e v2 rows into the shapes in `./types`.
 *
 * Open5e keeps the interesting parts of a 2024 class in prose: the core-traits
 * markdown table carries proficiencies and starting equipment, and the class
 * table (spell slots, cantrips known) arrives as flat `data_for_class_table`
 * rows. Everything here is deterministic and side-effect free so the same code
 * runs on the server, in the wizard, and in tests.
 */

import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SKILL_LABELS,
  type AbilityKey,
  type SkillKey,
} from '../../schema';
import type {
  BackgroundDef,
  CasterType,
  ClassDef,
  ClassFeature,
  ClassSummary,
  CoreTraits,
  EquipmentOption,
  FeatDef,
  SkillChoice,
  SpeciesDef,
  SpeciesTrait,
  SubclassDef,
  TraitChoice,
} from './types';

/* ------------------------------------------------------------------ *
 * Raw row shapes (only the fields we read)
 * ------------------------------------------------------------------ */

interface RawGainedAt {
  level?: number | null;
  detail?: string | null;
}

interface RawTableRow {
  level?: number;
  column_value?: string;
}

interface RawClassFeature {
  key?: string;
  name?: string;
  desc?: string;
  feature_type?: string;
  gained_at?: RawGainedAt[];
  data_for_class_table?: RawTableRow[];
}

export interface RawClass {
  key?: string;
  name?: string;
  hit_dice?: string | null;
  caster_type?: string;
  saving_throws?: { name?: string }[];
  subclass_of?: { key?: string; name?: string } | null;
  features?: RawClassFeature[];
}

export interface RawSpecies {
  key?: string;
  name?: string;
  is_subspecies?: boolean;
  traits?: { name?: string; desc?: string; type?: string | null }[];
}

export interface RawBackground {
  key?: string;
  name?: string;
  benefits?: { name?: string; desc?: string; type?: string }[];
}

export interface RawFeat {
  key?: string;
  name?: string;
  type?: string;
  prerequisite?: string | null;
  benefits?: { desc?: string }[];
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

/**
 * The SRD text in Open5e carries word breaks from the source PDF — "Ar mor",
 * "In sight", "Na ture". They are harmless in prose but they break name
 * matching, so repair the ones that actually appear in the 2024 rows.
 */
const OCR_FIXES: [RegExp, string][] = [
  [/\bAr mor\b/g, 'Armor'],
  [/\bAr rows\b/g, 'Arrows'],
  [/\bAr cane\b/g, 'Arcane'],
  [/\bIn sight\b/g, 'Insight'],
  [/\bNa ture\b/g, 'Nature'],
  [/\bStud ded\b/g, 'Studded'],
  [/\bAr tisan\b/g, 'Artisan'],
];

export function mendText(input: string): string {
  return OCR_FIXES.reduce((s, [re, to]) => s.replace(re, to), input).trim();
}

/** Lowercase, letters only — for matching names across broken spacing. */
function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z]/g, '');
}

const SKILL_BY_SLUG = new Map<string, SkillKey>(
  SKILL_KEYS.map(k => [slugify(SKILL_LABELS[k]), k])
);
const ABILITY_BY_SLUG = new Map<string, AbilityKey>(
  ABILITY_KEYS.map(k => [k, k])
);

export function toSkillKey(name: string): SkillKey | null {
  return SKILL_BY_SLUG.get(slugify(name)) ?? null;
}

export function toAbilityKey(name: string): AbilityKey | null {
  return ABILITY_BY_SLUG.get(slugify(name)) ?? null;
}

/** Split "Arcana, History, or Religion" / "Insight and Religion" into parts. */
function splitList(input: string): string[] {
  return input
    .replace(/\bor\b/gi, ',')
    .replace(/\band\b/gi, ',')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Rows of a markdown table as cell arrays, header and separator dropped. */
function markdownTableRows(input: string): string[][] {
  const rows: string[][] = [];
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|?$/.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Core traits table
 * ------------------------------------------------------------------ */

/** "Choose 2: Acrobatics, ... or Survival" / "Choose any 3 skills". */
function parseSkillChoice(input: string): SkillChoice | null {
  const m = /choose\s+(?:any\s+)?(\d+)/i.exec(input);
  if (!m) return null;
  const count = Number(m[1]);
  const after = input.slice(m.index + m[0].length).replace(/^\s*:?\s*/, '');
  const options = splitList(after)
    .map(toSkillKey)
    .filter((k): k is SkillKey => k !== null);
  return { count, options };
}

/**
 * "Choose A, B, or C: (A) Chain Mail, …; (B) …; or (C) 155 GP" ->
 * one entry per lettered package.
 */
export function parseEquipmentOptions(input: string): EquipmentOption[] {
  const text = mendText(input.replace(/\*/g, ''));
  const matches = [...text.matchAll(/\(([A-E])\)\s*/g)];
  if (matches.length === 0) {
    return text ? [{ label: 'A', desc: text, gp: trailingGp(text) }] : [];
  }
  return matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const desc = text
      .slice(start, end)
      .replace(/;?\s*or\s*$/i, '')
      .replace(/[;,]\s*$/, '')
      .trim();
    return { label: m[1], desc, gp: trailingGp(desc) };
  });
}

/** The coin purse a starting package ends with, e.g. "… and 4 GP" -> 4. */
function trailingGp(desc: string): number {
  const matches = [...desc.matchAll(/(\d+)\s*GP\b/gi)];
  const last = matches.at(-1);
  return last ? Number(last[1]) : 0;
}

function parseCoreTraits(desc: string): CoreTraits {
  const cells = new Map<string, string>();
  for (const row of markdownTableRows(desc)) {
    if (row.length >= 2 && row[0]) cells.set(row[0].toLowerCase(), row[1]);
  }
  const get = (label: string) => mendText(cells.get(label) ?? '');

  return {
    primaryAbilities: splitList(get('primary ability'))
      .map(toAbilityKey)
      .filter((k): k is AbilityKey => k !== null),
    savingThrows: splitList(get('saving throw proficiencies'))
      .map(toAbilityKey)
      .filter((k): k is AbilityKey => k !== null),
    skillChoice: parseSkillChoice(get('skill proficiencies')),
    weapons: get('weapon proficiencies'),
    armor: get('armor training'),
    tools: get('tool proficiencies'),
    equipment: parseEquipmentOptions(cells.get('starting equipment') ?? ''),
  };
}

/* ------------------------------------------------------------------ *
 * Classes
 * ------------------------------------------------------------------ */

const SLOT_LEVEL_BY_NAME: Record<string, number> = {
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
  '8th': 8,
  '9th': 9,
};

function toClassFeature(raw: RawClassFeature): ClassFeature {
  const gained = (raw.gained_at ?? []).filter(
    (g): g is RawGainedAt & { level: number } => typeof g.level === 'number'
  );
  const detailByLevel: Record<number, string> = {};
  for (const g of gained) if (g.detail) detailByLevel[g.level] = g.detail;
  return {
    key: raw.key ?? raw.name ?? '',
    name: mendText(raw.name ?? ''),
    desc: mendText(raw.desc ?? ''),
    levels: [...new Set(gained.map(g => g.level))].sort((a, b) => a - b),
    detailByLevel,
  };
}

function parseHitDie(raw: string | null | undefined): number {
  const m = /(\d+)/.exec(raw ?? '');
  return m ? Number(m[1]) : 8;
}

const CASTER_TYPES: CasterType[] = ['NONE', 'FULL', 'HALF', 'THIRD', 'PACT'];

function casterTypeOf(raw: string | undefined): CasterType {
  const value = (raw ?? 'NONE').toUpperCase() as CasterType;
  return CASTER_TYPES.includes(value) ? value : 'NONE';
}

export function parseSubclass(raw: RawClass): SubclassDef {
  const features = (raw.features ?? [])
    .filter(f => f.feature_type === 'CLASS_LEVEL_FEATURE')
    .map(toClassFeature)
    .map(f => ({ ...f, subclassKey: raw.key ?? '' }));
  return {
    key: raw.key ?? '',
    name: mendText(raw.name ?? ''),
    features: features.sort(byFirstLevel),
    blurb: features[0]?.desc.split('\n')[0].slice(0, 160) ?? '',
  };
}

const byFirstLevel = (a: ClassFeature, b: ClassFeature): number =>
  (a.levels[0] ?? 99) - (b.levels[0] ?? 99) || a.name.localeCompare(b.name);

export function parseClass(
  raw: RawClass,
  subclassRows: RawClass[] = []
): ClassDef {
  const rawFeatures = raw.features ?? [];
  const coreRaw = rawFeatures.find(f => f.feature_type === 'CORE_TRAITS_TABLE');
  const coreTraits = parseCoreTraits(coreRaw?.desc ?? '');

  // Open5e leaves saving throws in two places; the dedicated field wins.
  const savingThrows = (raw.saving_throws ?? [])
    .map(s => toAbilityKey(s.name ?? ''))
    .filter((k): k is AbilityKey => k !== null);

  const features = rawFeatures
    .filter(f => f.feature_type === 'CLASS_LEVEL_FEATURE')
    .map(toClassFeature)
    // The same feature is occasionally listed twice under one class.
    .filter(
      (f, i, all) =>
        all.findIndex(o => o.name === f.name && o.levels[0] === f.levels[0]) === i
    )
    .sort(byFirstLevel);

  const spellSlots: ClassDef['spellSlots'] = {};
  for (const f of rawFeatures) {
    if (f.feature_type !== 'SPELL_SLOTS') continue;
    const slotLevel = SLOT_LEVEL_BY_NAME[(f.name ?? '').toLowerCase()];
    if (!slotLevel) continue;
    const byLevel: Record<number, number> = {};
    for (const row of f.data_for_class_table ?? []) {
      if (typeof row.level === 'number') {
        byLevel[row.level] = Number(row.column_value ?? 0) || 0;
      }
    }
    spellSlots[slotLevel] = byLevel;
  }

  const allColumns = rawFeatures
    .filter(f => f.feature_type === 'CLASS_TABLE_DATA')
    .map(f => {
      const byLevel: Record<number, string> = {};
      for (const row of f.data_for_class_table ?? []) {
        if (typeof row.level === 'number') byLevel[row.level] = row.column_value ?? '';
      }
      return { name: mendText(f.name ?? ''), byLevel };
    });

  // Pact Magic isn't in the SPELL_SLOTS rows — the Warlock table gives a slot
  // count and the level those slots are cast at, so fold it into the same
  // `spellSlots` shape the rest of the app reads.
  const pactCount = allColumns.find(c => /^spell slots$/i.test(c.name));
  const pactLevel = allColumns.find(c => /^slot level$/i.test(c.name));
  if (pactCount && pactLevel) {
    for (const [level, value] of Object.entries(pactCount.byLevel)) {
      const slotLevel =
        SLOT_LEVEL_BY_NAME[(pactLevel.byLevel[Number(level)] ?? '').toLowerCase()] ?? 0;
      const count = Number(value) || 0;
      if (!slotLevel || !count) continue;
      spellSlots[slotLevel] = { ...(spellSlots[slotLevel] ?? {}), [Number(level)]: count };
    }
  }

  const tableColumns = allColumns.filter(
    c => c !== pactCount && c !== pactLevel
  );

  const subclassFeature = features.find(f => /subclass/i.test(f.name));
  const asiFeature = features.find(f => /ability score improvement/i.test(f.name));

  return {
    key: raw.key ?? '',
    name: mendText(raw.name ?? ''),
    hitDie: parseHitDie(raw.hit_dice),
    casterType: casterTypeOf(raw.caster_type),
    coreTraits: {
      ...coreTraits,
      savingThrows: savingThrows.length ? savingThrows : coreTraits.savingThrows,
    },
    features,
    subclassLevel: subclassFeature?.levels[0] ?? 3,
    subclasses: subclassRows.map(parseSubclass).sort((a, b) => a.name.localeCompare(b.name)),
    spellSlots,
    tableColumns,
    asiLevels: asiFeature?.levels ?? [],
  };
}

export function toClassSummary(def: ClassDef): ClassSummary {
  const first = def.features.find(f => f.levels[0] === 1 && f.desc);
  return {
    key: def.key,
    name: def.name,
    hitDie: def.hitDie,
    casterType: def.casterType,
    primaryAbilities: def.coreTraits.primaryAbilities,
    savingThrows: def.coreTraits.savingThrows,
    armor: def.coreTraits.armor,
    weapons: def.coreTraits.weapons,
    subclassLevel: def.subclassLevel,
    subclassNames: def.subclasses.map(s => s.name),
    blurb: first ? firstSentence(first.desc) : '',
  };
}

function firstSentence(input: string): string {
  const clean = input.replace(/\n+/g, ' ').trim();
  const stop = clean.indexOf('. ');
  const out = stop > 0 ? clean.slice(0, stop + 1) : clean;
  return out.length > 200 ? `${out.slice(0, 197)}…` : out;
}

/* ------------------------------------------------------------------ *
 * Species
 * ------------------------------------------------------------------ */

/**
 * Lineages, ancestries and legacies are written three different ways in the
 * SRD text: a markdown table, `**Name.**` paragraphs, or `- **Name**.` bullets.
 * Pull the pickable options out of whichever form a trait uses.
 */
export function extractTraitOptions(desc: string): TraitChoice[] {
  const rows = markdownTableRows(desc);
  if (rows.length >= 3) {
    // Row 0 is the header; its first cell names the choice ("Lineage").
    const body = rows.slice(1).filter(r => r[0]);
    if (body.length >= 2) {
      return body.map(r => ({
        label: r[0],
        detail: r.slice(1).filter(Boolean).join(' · '),
      }));
    }
  }

  const bold = [...desc.matchAll(/\*\*(.+?)\*\*\.?\s*([^\n]*)/g)]
    .map(m => ({
      label: m[1].replace(/\.$/, '').trim(),
      detail: m[2].replace(/^[.\s]+/, '').trim(),
    }))
    .filter(o => o.label && !/^table:/i.test(o.label));
  return bold.length >= 2 ? bold : [];
}

/**
 * The free skill proficiency a species hands out, if it has one. Elf names the
 * three skills it allows; Human leaves it open, which reads here as "any".
 */
export function speciesSkillGrant(
  species: SpeciesDef
): { count: number; options: SkillKey[] } | null {
  const trait = species.traits.find(t =>
    /proficiency in (?:the |one )/i.test(t.desc)
  );
  if (!trait) return null;
  const named = SKILL_KEYS.filter(key =>
    new RegExp(`\\b${SKILL_LABELS[key]}\\b`, 'i').test(trait.desc)
  );
  return { count: 1, options: named };
}

export function parseSpecies(raw: RawSpecies): SpeciesDef {
  const rawTraits = raw.traits ?? [];
  const sizeText = rawTraits.find(t => t.type === 'SIZE')?.desc ?? 'Medium';
  const speedText = rawTraits.find(t => t.type === 'SPEED')?.desc ?? '30 feet';

  const sizes = ['Tiny', 'Small', 'Medium', 'Large'].filter(s =>
    new RegExp(`\\b${s}\\b`).test(sizeText)
  );

  const traits: SpeciesTrait[] = rawTraits
    .filter(t => t.type !== 'SIZE' && t.type !== 'SPEED')
    .map(t => ({
      name: mendText(t.name ?? ''),
      desc: mendText(t.desc ?? ''),
      options: extractTraitOptions(t.desc ?? ''),
    }));

  return {
    key: raw.key ?? '',
    name: mendText(raw.name ?? ''),
    sizes: sizes.length ? sizes : ['Medium'],
    speed: Number(/(\d+)/.exec(speedText)?.[1] ?? 30),
    traits,
    grantsSkillChoice: traits.some(t =>
      /proficiency in (the )?(one skill|the Insight)/i.test(t.desc)
    ),
    blurb: traits
      .map(t => t.name)
      .slice(0, 4)
      .join(' · '),
  };
}

/* ------------------------------------------------------------------ *
 * Backgrounds + feats
 * ------------------------------------------------------------------ */

export function parseBackground(raw: RawBackground): BackgroundDef {
  const benefit = (type: string): string =>
    mendText(raw.benefits?.find(b => b.type === type)?.desc ?? '');

  return {
    key: raw.key ?? '',
    name: mendText(raw.name ?? ''),
    abilityOptions: splitList(benefit('ability_score'))
      .map(toAbilityKey)
      .filter((k): k is AbilityKey => k !== null),
    skills: splitList(benefit('skill_proficiency'))
      .map(toSkillKey)
      .filter((k): k is SkillKey => k !== null),
    tool: benefit('tool_proficiency'),
    feat: benefit('feat'),
    equipment: parseEquipmentOptions(
      raw.benefits?.find(b => b.type === 'equipment')?.desc ?? ''
    ),
  };
}

export function parseFeat(raw: RawFeat): FeatDef {
  return {
    key: raw.key ?? '',
    name: mendText(raw.name ?? ''),
    type: raw.type ?? 'General',
    prerequisite: raw.prerequisite ?? '',
    desc: (raw.benefits ?? [])
      .map(b => mendText(b.desc ?? ''))
      .filter(Boolean)
      .join('\n\n'),
  };
}
