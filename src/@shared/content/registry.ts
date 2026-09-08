/**
 * Where a content type meets its label, its glyph, and the chips that
 * summarise it.
 *
 * One table, so adding a type is one entry rather than a hunt through switch
 * statements. `ReferenceBrowser` used to carry a hardcoded two-branch
 * `metaChips` with no extension point; it reads this instead, which is why the
 * compendium pages and the homebrew forge can share a renderer.
 *
 * Pure: no React, no server. The components import from here.
 */
import type { GlyphName } from '@/@shared/components/ui/Glyph';

import {
  parseContentData,
  type BackgroundData,
  type ClassData,
  type FeatData,
  type CreatureData,
  type ItemData,
  type SpeciesData,
  type SpellData,
  type SubclassData,
} from './schemas';
import { CONTENT_TYPES, type ContentEntry, type ContentType } from './types';

export interface ContentTypeMeta {
  id: ContentType;
  /** Singular, sentence case. */
  label: string;
  /** Plural, for headings and counts. */
  plural: string;
  glyph: GlyphName;
  /** One line, shown under the type in a picker. */
  description: string;
  /** Short chips summarising one entry — the line under its name. */
  chips: (entry: ContentEntry) => string[];
}

const ORDINALS = [
  'Cantrip',
  '1st level',
  '2nd level',
  '3rd level',
  '4th level',
  '5th level',
  '6th level',
  '7th level',
  '8th level',
  '9th level',
];

/** Title-cases a key or a SHOUTED enum alike: `very-rare` and `FULL` both work. */
const titleCase = (s: string): string => {
  if (!s) return '';
  const lower = s.toLowerCase().replace(/-/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const list = (values: string[]): string => values.map(titleCase).join(', ');

/**
 * `0.125` is a real challenge rating and reads as 1/8 on every stat block ever
 * printed. Rendering it as a decimal is how a monster manual stops looking
 * like one.
 */
const FRACTIONAL_CR: Record<string, string> = {
  '0.125': '1/8',
  '0.25': '1/4',
  '0.5': '1/2',
};

export const formatChallenge = (cr: number): string =>
  FRACTIONAL_CR[String(cr)] ?? String(cr);

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

export const CONTENT_REGISTRY: Record<ContentType, ContentTypeMeta> = {
  class: {
    id: 'class',
    label: 'Class',
    plural: 'Classes',
    glyph: 'crossed-swords',
    description:
      'What a hero does — hit die, proficiencies, features by level.',
    chips: entry => {
      const d = parseContentData('class', entry.data) as ClassData;
      return [
        `Hit die d${d.hitDie}`,
        d.casterType !== 'NONE' ? `${titleCase(d.casterType)} caster` : null,
        d.coreTraits.savingThrows.length
          ? `Saves: ${list(d.coreTraits.savingThrows)}`
          : null,
        d.features.length ? plural(d.features.length, 'feature') : null,
      ].filter(Boolean) as string[];
    },
  },

  subclass: {
    id: 'subclass',
    label: 'Subclass',
    plural: 'Subclasses',
    glyph: 'crown',
    description: 'A specialisation chosen within a class.',
    chips: entry => {
      const d = parseContentData('subclass', entry.data) as SubclassData;
      return [
        d.parentClass ? titleCase(d.parentClass) : null,
        d.features.length ? plural(d.features.length, 'feature') : null,
      ].filter(Boolean) as string[];
    },
  },

  species: {
    id: 'species',
    label: 'Species',
    plural: 'Species',
    glyph: 'helix',
    description: 'What a hero is — size, speed, and innate traits.',
    chips: entry => {
      const d = parseContentData('species', entry.data) as SpeciesData;
      return [
        d.sizes.length ? list(d.sizes) : null,
        `Speed ${d.speed} ft`,
        d.traits.length ? plural(d.traits.length, 'trait') : null,
      ].filter(Boolean) as string[];
    },
  },

  background: {
    id: 'background',
    label: 'Background',
    plural: 'Backgrounds',
    glyph: 'scroll',
    description: 'Where a hero came from — skills, a tool, a feat, kit.',
    chips: entry => {
      const d = parseContentData('background', entry.data) as BackgroundData;
      return [
        d.skills.length ? list(d.skills) : null,
        d.feat || null,
        d.tool || null,
      ].filter(Boolean) as string[];
    },
  },

  feat: {
    id: 'feat',
    label: 'Feat',
    plural: 'Feats',
    glyph: 'star',
    description: 'A talent taken at a level-up or granted by a background.',
    chips: entry => {
      const d = parseContentData('feat', entry.data) as FeatData;
      return [
        d.category || null,
        d.prerequisite ? `Requires ${d.prerequisite}` : null,
      ].filter(Boolean) as string[];
    },
  },

  spell: {
    id: 'spell',
    label: 'Spell',
    plural: 'Spells',
    glyph: 'orb',
    description: 'Level, school, components, and what it does on a hit.',
    chips: entry => {
      const d = parseContentData('spell', entry.data) as SpellData;
      return [
        ORDINALS[d.level] ?? `Level ${d.level}`,
        d.school ? titleCase(d.school) : null,
        d.casting_time ? titleCase(d.casting_time) : null,
        d.concentration ? 'Concentration' : null,
        d.ritual ? 'Ritual' : null,
        d.damage_roll
          ? `${d.damage_roll}${d.damage_types.length ? ` ${list(d.damage_types)}` : ''}`
          : null,
      ].filter(Boolean) as string[];
    },
  },

  item: {
    id: 'item',
    label: 'Item',
    plural: 'Items',
    glyph: 'shield',
    description: 'Gear, weapons, armour, and wondrous things.',
    chips: entry => {
      const d = parseContentData('item', entry.data) as ItemData;
      return [
        titleCase(d.kind),
        titleCase(d.rarity),
        d.requires_attunement ? 'Attunement' : null,
        d.weapon?.damage_dice
          ? `${d.weapon.damage_dice}${d.weapon.damage_type ? ` ${titleCase(d.weapon.damage_type)}` : ''}`
          : null,
        d.armor
          ? `AC ${d.armor.ac_base}${d.armor.ac_add_dexmod ? ' + Dex' : ''}`
          : null,
      ].filter(Boolean) as string[];
    },
  },

  creature: {
    id: 'creature',
    label: 'Creature',
    plural: 'Bestiary',
    glyph: 'dragon',
    description:
      'What the party is fighting — CR, AC, hit points, what it does on its turn.',
    chips: entry => {
      const d = parseContentData('creature', entry.data) as CreatureData;
      return [
        `CR ${formatChallenge(d.challenge_rating)}`,
        [titleCase(d.size), titleCase(d.creature_type)]
          .filter(Boolean)
          .join(' ') || null,
        `AC ${d.armor_class}`,
        `${d.hit_points} HP`,
      ].filter(Boolean) as string[];
    },
  },
};

/** Ordered for pickers: what a character is, then what it carries. */
export const CONTENT_TYPE_ORDER: ContentType[] = [
  'class',
  'subclass',
  'species',
  'background',
  'feat',
  'spell',
  'item',
  'creature',
];

export function contentMeta(type: ContentType): ContentTypeMeta {
  return CONTENT_REGISTRY[type];
}

/** The glyph for a type, falling back for anything unrecognised. */
export function contentGlyph(type: string): GlyphName {
  return CONTENT_REGISTRY[type as ContentType]?.glyph ?? 'notebook';
}

/** Summary chips for an entry, never throwing on a malformed blob. */
export function contentChips(entry: ContentEntry): string[] {
  try {
    return CONTENT_REGISTRY[entry.type]?.chips(entry) ?? [];
  } catch {
    return [];
  }
}

export { CONTENT_TYPES };
