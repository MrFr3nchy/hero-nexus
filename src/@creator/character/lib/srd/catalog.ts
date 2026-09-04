import 'server-only';

import { getReference } from '@/server/reference';

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
} from './parse';
import type { BuildCatalog, ClassDef } from './types';

/**
 * Loads the SRD build data out of `reference_data` and parses it.
 *
 * The catalog is split in two on purpose: `loadBuildCatalog` returns the small
 * summaries the wizard renders immediately, and `loadClassDef` returns one
 * class in full. The raw class rows total ~280 KB of JSON, which has no
 * business riding along with every page load.
 */

/** Open5e mixes subclasses into `classes`; a subclass carries `subclass_of`. */
function isSubclass(data: unknown): boolean {
  return Boolean((data as RawClass | null)?.subclass_of);
}

export async function loadBuildCatalog(): Promise<BuildCatalog> {
  const [
    classRows,
    speciesRows,
    backgroundRows,
    featRows,
    alignmentRows,
    languageRows,
  ] = await Promise.all([
    getReference('class'),
    getReference('species'),
    getReference('background'),
    getReference('feat'),
    getReference('alignment'),
    getReference('language'),
  ]);

  const subclassesByParent = new Map<string, RawClass[]>();
  for (const row of classRows) {
    const raw = row.data as RawClass;
    const parent = raw.subclass_of?.key;
    if (!parent) continue;
    const list = subclassesByParent.get(parent) ?? [];
    list.push(raw);
    subclassesByParent.set(parent, list);
  }

  const classes = classRows
    .filter(row => !isSubclass(row.data))
    .map(row => {
      const raw = row.data as RawClass;
      return toClassSummary(
        parseClass(raw, subclassesByParent.get(raw.key ?? '') ?? [])
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const species = speciesRows
    .filter(row => !(row.data as RawSpecies)?.is_subspecies)
    .map(row => parseSpecies(row.data as RawSpecies))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    classes,
    species,
    backgrounds: backgroundRows
      .map(row => parseBackground(row.data as RawBackground))
      .sort((a, b) => a.name.localeCompare(b.name)),
    feats: featRows
      .map(row => parseFeat(row.data as RawFeat))
      .sort((a, b) => a.name.localeCompare(b.name)),
    alignments: alignmentRows.map(r => r.name).sort(),
    languages: languageRows.map(r => r.name).sort(),
  };
}

/** One class, parsed in full — features, spell slots, subclasses. */
export async function loadClassDef(key: string): Promise<ClassDef | null> {
  const rows = await getReference('class');
  const parent = rows.find(r => r.slug === key || r.name === key);
  if (!parent || isSubclass(parent.data)) return null;

  const raw = parent.data as RawClass;
  const subclasses = rows
    .map(r => r.data as RawClass)
    .filter(d => d.subclass_of?.key === raw.key);

  return parseClass(raw, subclasses);
}
