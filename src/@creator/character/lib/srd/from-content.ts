/**
 * Homebrew content as build data.
 *
 * `@/@shared/content` is the vocabulary both sources speak, but the wizard was
 * written against the *parsed* SRD interfaces in `./types` and there is no
 * reason to rewrite it: the content schemas for class, subclass, species,
 * background and feat were deliberately shaped to mirror those interfaces
 * field for field, because a form has no prose for `./parse` to dig through.
 * So this file is a re-labelling, not a conversion — it fills in the `key`,
 * `name` and `source` that live on the entry rather than in its `data`.
 *
 * Pure: no database, no React. `./catalog` calls it on the server; the wizard
 * consumes the result without knowing which source an option came from.
 */

import {
  parseContentData,
  type ContentEntry,
  type BackgroundData,
  type ClassData,
  type FeatData,
  type SpeciesData,
  type SubclassData,
} from '@/@shared/content';

import type {
  BackgroundDef,
  ClassDef,
  FeatDef,
  SpeciesDef,
  SubclassDef,
} from './types';

/**
 * A homebrew class, with whatever homebrew subclasses name it as their parent.
 *
 * `tableColumns` stays empty: it holds the extra columns Open5e ships in a
 * class's markdown table ("Cantrips Known"), and a form never produces one.
 */
export function classDefFromContent(
  entry: ContentEntry,
  subclassEntries: ContentEntry[] = []
): ClassDef {
  const d = parseContentData('class', entry.data) as ClassData;
  return {
    key: entry.ref.key,
    name: entry.name,
    hitDie: d.hitDie,
    casterType: d.casterType,
    coreTraits: d.coreTraits,
    features: d.features,
    subclassLevel: d.subclassLevel,
    subclasses: subclassEntries.map(subclassDefFromContent),
    spellSlots: numberKeyed(d.spellSlots),
    tableColumns: [],
    asiLevels: d.asiLevels,
    source: 'homebrew',
    homebrewId: entry.ref.key,
  };
}

export function subclassDefFromContent(entry: ContentEntry): SubclassDef {
  const d = parseContentData('subclass', entry.data) as SubclassData;
  return {
    key: entry.ref.key,
    name: entry.name,
    features: d.features,
    blurb: d.blurb || entry.description,
  };
}

export function speciesDefFromContent(entry: ContentEntry): SpeciesDef {
  const d = parseContentData('species', entry.data) as SpeciesData;
  return {
    key: entry.ref.key,
    name: entry.name,
    sizes: d.sizes.length ? d.sizes : ['Medium'],
    speed: d.speed,
    traits: d.traits,
    grantsSkillChoice: d.grantsSkillChoice,
    blurb: d.blurb || entry.description,
    source: 'homebrew',
    homebrewId: entry.ref.key,
  };
}

export function backgroundDefFromContent(entry: ContentEntry): BackgroundDef {
  const d = parseContentData('background', entry.data) as BackgroundData;
  return {
    key: entry.ref.key,
    name: entry.name,
    abilityOptions: d.abilityOptions,
    skills: d.skills,
    tool: d.tool,
    feat: d.feat,
    equipment: d.equipment,
    source: 'homebrew',
    homebrewId: entry.ref.key,
  };
}

/**
 * `FeatDef.desc` is one blob of prose; the content schema keeps Open5e's
 * `benefits[]` as separate lines. Joined the same way `parseFeat` joins them.
 */
export function featDefFromContent(entry: ContentEntry): FeatDef {
  const d = parseContentData('feat', entry.data) as FeatData;
  return {
    key: entry.ref.key,
    name: entry.name,
    type: d.category || 'General',
    prerequisite: d.prerequisite,
    desc: d.benefits.filter(Boolean).join('\n\n') || entry.description,
    source: 'homebrew',
    homebrewId: entry.ref.key,
  };
}

/**
 * The spell-slot table is `Record<string, Record<string, number>>` on the way
 * out of zod (JSON object keys are strings) and `Record<number, ...>` on
 * `ClassDef`. Same data; TypeScript wants the cast made deliberately.
 */
function numberKeyed(
  table: Record<string, Record<string, number>>
): ClassDef['spellSlots'] {
  const out: ClassDef['spellSlots'] = {};
  for (const [slotLevel, byLevel] of Object.entries(table)) {
    const level = Number(slotLevel);
    if (!Number.isFinite(level)) continue;
    const row: Record<number, number> = {};
    for (const [charLevel, slots] of Object.entries(byLevel)) {
      const n = Number(charLevel);
      if (Number.isFinite(n)) row[n] = slots;
    }
    out[level] = row;
  }
  return out;
}
