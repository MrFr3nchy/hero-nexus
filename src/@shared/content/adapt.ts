/**
 * Turning the two sources into `ContentEntry`.
 *
 * SRD rows go through the parsers that already exist in
 * `@/@creator/character/lib/srd/parse` — this module does not reimplement
 * them. Homebrew rows are already in the parsed shape by construction (see the
 * header of `./schemas`), so adapting one is validation, not conversion.
 *
 * Pure and side-effect free: no database, no React. `@/server/content` does the
 * loading and calls in here.
 */
import {
  parseBackground,
  parseClass,
  parseFeat,
  parseSpecies,
  toClassSummary,
  type RawBackground,
  type RawClass,
  type RawFeat,
  type RawSpecies,
} from '@/@creator/character/lib/srd/parse';

import {
  parseContentData,
  type BackgroundData,
  type ClassData,
  type FeatData,
  type CreatureData,
  type ItemData,
  type SpeciesData,
  type SpellData,
} from './schemas';
import { isContentType, type ContentEntry, type ContentType } from './types';
import { isWeaponMastery } from './weapons';

/** `reference_data.category` -> the content type it carries. */
export const REFERENCE_CATEGORIES: Record<string, ContentType> = {
  class: 'class',
  species: 'species',
  background: 'background',
  feat: 'feat',
  spell: 'spell',
  'magic-item': 'item',
  weapon: 'item',
  armor: 'item',
  creature: 'creature',
};

interface ReferenceRow {
  slug: string;
  name: string;
  data: unknown;
}

/** Open5e nests some values as `{ name, key }`; we store the key. */
function keyOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'key' in value) {
    return String((value as { key: unknown }).key);
  }
  return '';
}

function nameOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'name' in value) {
    return String((value as { name: unknown }).name);
  }
  return '';
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

/**
 * A weapon's properties, unflattened.
 *
 * Open5e ships them as `{ property: { name, type, desc }, detail }`, where
 * `type` is `"Mastery"` for the one mastery a weapon has and null for the
 * rest, and `detail` carries the qualifier — Versatile's two-handed damage,
 * Ammunition's range. Both were being dropped on the way in; this keeps them
 * long enough for the three fields below to be filled.
 */
function weaponProperties(
  raw: Record<string, unknown>
): { name: string; type: string; detail: string }[] {
  if (!Array.isArray(raw.properties)) return [];
  return (raw.properties as { property?: unknown; detail?: unknown }[])
    .map(p => ({
      name: nameOf(p?.property) || nameOf(p),
      type: str(
        p?.property && typeof p.property === 'object' && 'type' in p.property
          ? (p.property as { type: unknown }).type
          : ''
      ),
      detail: str(p?.detail ?? ''),
    }))
    .filter(p => p.name);
}

/** The weapon's mastery property name, or '' when it has none. */
function weaponMastery(raw: Record<string, unknown>): string {
  const found = weaponProperties(raw).find(
    p => p.type.toLowerCase() === 'mastery'
  );
  return found && isWeaponMastery(found.name) ? found.name : '';
}

/** The `detail` beside a named property, e.g. Versatile's "1d10". */
function weaponPropertyDetail(
  raw: Record<string, unknown>,
  property: string
): string {
  const found = weaponProperties(raw).find(
    p => p.name.toLowerCase() === property.toLowerCase()
  );
  return found?.detail ?? '';
}

/* ------------------------------------------------------------------ *
 * SRD -> ContentEntry
 * ------------------------------------------------------------------ */

function classFromSrd(raw: RawClass): ClassData {
  // Subclasses are their own entries; a class adapted on its own carries none.
  const def = parseClass(raw, []);
  return parseContentData('class', {
    hitDie: def.hitDie,
    casterType: def.casterType,
    coreTraits: def.coreTraits,
    features: def.features,
    subclassLevel: def.subclassLevel,
    asiLevels: def.asiLevels,
    spellSlots: def.spellSlots,
    // `blurb` is a summary-only field; `toClassSummary` is where it is derived.
    blurb: toClassSummary(def).blurb,
  });
}

function speciesFromSrd(raw: RawSpecies): SpeciesData {
  const def = parseSpecies(raw);
  return parseContentData('species', {
    sizes: def.sizes,
    speed: def.speed,
    traits: def.traits,
    grantsSkillChoice: def.grantsSkillChoice,
    blurb: def.blurb,
  });
}

function backgroundFromSrd(raw: RawBackground): BackgroundData {
  const def = parseBackground(raw);
  return parseContentData('background', {
    abilityOptions: def.abilityOptions,
    skills: def.skills,
    tool: def.tool,
    feat: def.feat,
    equipment: def.equipment,
  });
}

function featFromSrd(raw: RawFeat): FeatData {
  const def = parseFeat(raw);
  const benefits = Array.isArray((raw as { benefits?: unknown }).benefits)
    ? ((raw as { benefits: { desc?: unknown }[] }).benefits ?? [])
        .map(b => str(b?.desc).trim())
        .filter(Boolean)
    : [];
  return parseContentData('feat', {
    category: def.type,
    prerequisite: def.prerequisite,
    benefits,
  });
}

/**
 * Spell rows are consumed raw everywhere else in the app, so the field names
 * already line up — this is a filter, not a translation.
 */
function spellFromSrd(raw: Record<string, unknown>): SpellData {
  return parseContentData('spell', {
    level: raw.level,
    school: keyOf(raw.school) || null,
    casting_time: str(raw.casting_time),
    reaction_condition: str(raw.reaction_condition ?? ''),
    range_text: str(raw.range_text),
    duration: str(raw.duration),
    concentration: Boolean(raw.concentration),
    ritual: Boolean(raw.ritual),
    verbal: Boolean(raw.verbal),
    somatic: Boolean(raw.somatic),
    material: Boolean(raw.material),
    material_specified: str(raw.material_specified ?? ''),
    material_consumed: Boolean(raw.material_consumed),
    target_type: str(raw.target_type ?? ''),
    saving_throw_ability: raw.saving_throw_ability ?? null,
    attack_roll: Boolean(raw.attack_roll),
    damage_roll: str(raw.damage_roll ?? ''),
    damage_types: Array.isArray(raw.damage_types) ? raw.damage_types : [],
    higher_level: str(raw.higher_level ?? ''),
    classes: Array.isArray(raw.classes)
      ? (raw.classes as unknown[]).map(nameOf).filter(Boolean)
      : [],
  });
}

/**
 * Open5e has no shield category — its Shield row is filed as `heavy` armour
 * with `ac_base: 2`, which is a *bonus*, not a base. Taken literally an
 * equipped shield would set a character's AC to 2. No body armour in the SRD
 * sits below 11, so a small base can only be a shield.
 */
function armorCategory(raw: Record<string, unknown>): string {
  const declared = str(raw.category ?? '').toLowerCase();
  if (declared === 'shield') return 'shield';
  const base = Number(raw.ac_base ?? 0) || 0;
  return base > 0 && base <= 5 ? 'shield' : declared || 'light';
}

/**
 * Items arrive from three categories. `magic-item` carries nested `weapon` /
 * `armor` objects when it is one; the bare `weapon` and `armor` categories are
 * the mundane gear lists and have no wrapper.
 */
function itemFromSrd(category: string, raw: Record<string, unknown>): ItemData {
  const weaponRaw =
    category === 'weapon'
      ? raw
      : ((raw.weapon as Record<string, unknown> | null) ?? null);
  const armorRaw =
    category === 'armor'
      ? raw
      : ((raw.armor as Record<string, unknown> | null) ?? null);

  const kind = weaponRaw
    ? 'weapon'
    : armorRaw
      ? 'armor'
      : category === 'magic-item'
        ? 'wondrous'
        : 'gear';

  return parseContentData('item', {
    kind,
    rarity: keyOf(raw.rarity) || 'common',
    requires_attunement: Boolean(raw.requires_attunement),
    attunement_detail: str(raw.attunement_detail ?? ''),
    weight: Number(raw.weight ?? 0) || 0,
    cost: Number(raw.cost ?? 0) || 0,
    weapon: weaponRaw
      ? {
          damage_dice: str(weaponRaw.damage_dice ?? ''),
          damage_type: keyOf(weaponRaw.damage_type) || null,
          range: Number(weaponRaw.range ?? 0) || 0,
          long_range: Number(weaponRaw.long_range ?? 0) || 0,
          is_simple: Boolean(weaponRaw.is_simple),
          properties: weaponProperties(weaponRaw).map(p => p.name),
          mastery: weaponMastery(weaponRaw),
          versatile_dice: weaponPropertyDetail(weaponRaw, 'Versatile'),
        }
      : null,
    armor: armorRaw
      ? {
          category: armorCategory(armorRaw),
          ac_base: Number(armorRaw.ac_base ?? 10) || 10,
          ac_add_dexmod: Boolean(armorRaw.ac_add_dexmod),
          ac_cap_dexmod:
            armorRaw.ac_cap_dexmod == null
              ? null
              : Number(armorRaw.ac_cap_dexmod),
          strength_score_required:
            Number(armorRaw.strength_score_required ?? 0) || 0,
          grants_stealth_disadvantage: Boolean(
            armorRaw.grants_stealth_disadvantage
          ),
        }
      : null,
  });
}

/**
 * Open5e keeps every kind of turn in one `actions` array, distinguished by
 * `action_type`. A stat block reads them as separate headings, so they are
 * split here rather than in the renderer — the split is a fact about the data,
 * not a choice about the layout.
 *
 * The values arrive SHOUTED (`LEGENDARY_ACTION`), which is why this compares
 * case-insensitively: matching them literally silently filed all 989 actions
 * in the SRD under nothing and printed 331 monsters that do not attack.
 */
function creatureActions(
  raw: Record<string, unknown>,
  wanted: string
): { name: string; desc: string }[] {
  const rows = Array.isArray(raw.actions)
    ? (raw.actions as Record<string, unknown>[])
    : [];
  return rows
    .filter(a => (str(a.action_type) || 'action').toLowerCase() === wanted)
    .map(a => ({ name: str(a.name), desc: str(a.desc) }));
}

/** `[{ name: 'Acid', key: 'acid' }]` -> `['acid']`. */
function keyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => keyOf(v) || nameOf(v)).filter(Boolean);
}

/**
 * The proficiency bonus a monster fights with.
 *
 * Open5e leaves `proficiency_bonus` null on the SRD rows, and a stat block
 * without one cannot explain its own attack bonuses. It is a pure function of
 * challenge rating in the 2024 rules, so derive it rather than shipping a null
 * that renders as a hole.
 */
function proficiencyForChallenge(cr: number): number {
  if (cr < 5) return 2;
  return 2 + Math.floor((Math.ceil(cr) - 1) / 4);
}

function creatureFromSrd(raw: Record<string, unknown>): CreatureData {
  const speed = (raw.speed ?? {}) as Record<string, unknown>;
  const abilities = (raw.ability_scores ?? {}) as Record<string, unknown>;
  const resist = (raw.resistances_and_immunities ?? {}) as Record<
    string,
    unknown
  >;
  const cr = Number(raw.challenge_rating ?? 0) || 0;

  return parseContentData('creature', {
    size: keyOf(raw.size) || 'medium',
    creature_type: nameOf(raw.type),
    alignment: str(raw.alignment ?? ''),

    armor_class: Number(raw.armor_class ?? 10) || 10,
    armor_detail: str(raw.armor_detail ?? ''),
    hit_points: Number(raw.hit_points ?? 1) || 1,
    hit_dice: str(raw.hit_dice ?? ''),
    challenge_rating: cr,
    experience_points: Number(raw.experience_points ?? 0) || 0,
    proficiency_bonus:
      Number(raw.proficiency_bonus ?? 0) || proficiencyForChallenge(cr),
    initiative_bonus: Number(raw.initiative_bonus ?? 0) || 0,
    passive_perception: Number(raw.passive_perception ?? 10) || 10,

    speed: {
      walk: Number(speed.walk ?? 0) || 0,
      fly: Number(speed.fly ?? 0) || 0,
      swim: Number(speed.swim ?? 0) || 0,
      climb: Number(speed.climb ?? 0) || 0,
      burrow: Number(speed.burrow ?? 0) || 0,
      hover: Boolean(speed.hover),
    },
    ability_scores: {
      strength: Number(abilities.strength ?? 10) || 10,
      dexterity: Number(abilities.dexterity ?? 10) || 10,
      constitution: Number(abilities.constitution ?? 10) || 10,
      intelligence: Number(abilities.intelligence ?? 10) || 10,
      wisdom: Number(abilities.wisdom ?? 10) || 10,
      charisma: Number(abilities.charisma ?? 10) || 10,
    },
    // Open5e's `saving_throws` holds only the proficient ones, which is the
    // distinction the schema keeps; `saving_throws_all` fills in the rest and
    // is deliberately ignored.
    saving_throws: raw.saving_throws ?? {},
    skill_bonuses: raw.skill_bonuses ?? {},

    damage_immunities: keyList(resist.damage_immunities),
    damage_resistances: keyList(resist.damage_resistances),
    damage_vulnerabilities: keyList(resist.damage_vulnerabilities),
    condition_immunities: keyList(resist.condition_immunities),

    darkvision: Number(raw.darkvision_range ?? 0) || 0,
    blindsight: Number(raw.blindsight_range ?? 0) || 0,
    tremorsense: Number(raw.tremorsense_range ?? 0) || 0,
    truesight: Number(raw.truesight_range ?? 0) || 0,

    languages: str(
      (raw.languages as { as_string?: unknown } | undefined)?.as_string ?? ''
    ),

    traits: Array.isArray(raw.traits)
      ? (raw.traits as Record<string, unknown>[]).map(t => ({
          name: str(t.name),
          desc: str(t.desc),
        }))
      : [],
    actions: creatureActions(raw, 'action'),
    bonus_actions: creatureActions(raw, 'bonus_action'),
    reactions: creatureActions(raw, 'reaction'),
    legendary_actions: creatureActions(raw, 'legendary_action'),
  });
}

/**
 * One SRD row as a `ContentEntry`. Returns null for a category this app does
 * not model as content (alignments, languages, skills, conditions) and for a
 * subclass row, which Open5e mixes into `classes` — the caller decides how to
 * pair those with their parent.
 */
export function fromReference(
  category: string,
  row: ReferenceRow
): ContentEntry | null {
  const type = REFERENCE_CATEGORIES[category];
  if (!type) return null;

  const raw = (row.data ?? {}) as Record<string, unknown>;
  if (category === 'class' && raw.subclass_of) return null;
  if (category === 'species' && raw.is_subspecies) return null;

  let data: unknown;
  switch (type) {
    case 'class':
      data = classFromSrd(raw as RawClass);
      break;
    case 'species':
      data = speciesFromSrd(raw as RawSpecies);
      break;
    case 'background':
      data = backgroundFromSrd(raw as RawBackground);
      break;
    case 'feat':
      data = featFromSrd(raw as RawFeat);
      break;
    case 'spell':
      data = spellFromSrd(raw);
      break;
    case 'item':
      data = itemFromSrd(category, raw);
      break;
    case 'creature':
      data = creatureFromSrd(raw);
      break;
    default:
      return null;
  }

  return {
    ref: { source: 'srd', type, key: row.slug },
    type,
    name: row.name,
    description: str(raw.desc ?? ''),
    data,
  };
}

/* ------------------------------------------------------------------ *
 * Homebrew -> ContentEntry
 * ------------------------------------------------------------------ */

interface HomebrewLike {
  id: string;
  ownerId?: string;
  type: string;
  name: string;
  description: string;
  data: unknown;
}

/**
 * Homebrew spawned by the character creator's custom identity fields.
 *
 * `syncCharacterHomebrew` writes `{ source: 'character-creator', kind, field,
 * traits: [{ name, description, mechanic }] }` — a shape that predates this
 * module. Those rows are real content a DM has already reviewed, so they are
 * translated rather than defaulted away. `mechanic` folds into the body: it
 * has no home of its own in the typed shape and losing it would lose the only
 * part of the trait that says what it does.
 */
interface LegacyTrait {
  name?: unknown;
  description?: unknown;
  mechanic?: unknown;
}

function isLegacyCharacterData(
  data: unknown
): data is { traits: LegacyTrait[] } {
  if (!data || typeof data !== 'object') return false;
  const d = data as { source?: unknown; traits?: unknown };
  return d.source === 'character-creator' && Array.isArray(d.traits);
}

function legacyBody(t: LegacyTrait): string {
  return [str(t.description).trim(), str(t.mechanic).trim()]
    .filter(Boolean)
    .join('\n');
}

function fromLegacyCharacterData(
  type: ContentType,
  traits: LegacyTrait[]
): unknown {
  const named = traits.filter(t => str(t.name).trim());
  switch (type) {
    case 'species':
      return {
        traits: named.map(t => ({ name: str(t.name), desc: legacyBody(t) })),
      };
    case 'class':
    case 'subclass':
      return {
        features: named.map(t => ({ name: str(t.name), desc: legacyBody(t) })),
      };
    case 'feat':
      return {
        benefits: named.map(t =>
          [str(t.name), legacyBody(t)].filter(Boolean).join(' — ')
        ),
      };
    default:
      // Backgrounds, spells and items have no free-form passage list. Nothing
      // is lost: `entryDescription` already flattened these traits into the
      // row's `description`, which the stat block renders above the stats.
      return {};
  }
}

/**
 * One homebrew row as a `ContentEntry`. Already in the parsed shape, so this
 * only coerces it through the type's schema — which fills in defaults for a
 * row written before a field existed.
 */
export function fromHomebrew(row: HomebrewLike): ContentEntry | null {
  if (!isContentType(row.type)) return null;
  const type = row.type;
  const data = isLegacyCharacterData(row.data)
    ? fromLegacyCharacterData(type, row.data.traits)
    : row.data;
  return {
    ref: { source: 'homebrew', type, key: row.id },
    type,
    name: row.name,
    description: row.description,
    data: parseContentData(type, data),
    ownerId: row.ownerId,
  };
}
