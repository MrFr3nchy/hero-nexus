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
  type ItemData,
  type SpeciesData,
  type SpellData,
} from './schemas';
import { isContentType, type ContentEntry, type ContentType } from './types';

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
          properties: Array.isArray(weaponRaw.properties)
            ? (weaponRaw.properties as { property?: unknown }[])
                .map(p => nameOf(p?.property) || nameOf(p))
                .filter(Boolean)
            : [],
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
