import 'server-only';

import type { ContentEntry } from '@/@shared/content';
import { listPickableContent } from '@/server/content';
import { getReference } from '@/server/reference';

import {
  backgroundDefFromContent,
  classDefFromContent,
  featDefFromContent,
  speciesDefFromContent,
} from './from-content';

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
import type {
  BackgroundDef,
  BuildCatalog,
  ClassDef,
  ClassSummary,
  FeatDef,
  SpeciesDef,
} from './types';

/**
 * Loads the SRD build data out of `reference_data` and parses it.
 *
 * The catalog is split in two on purpose: `loadBuildCatalog` returns the small
 * summaries the wizard renders immediately, and `loadClassDef` returns one
 * class in full. The raw class rows total ~280 KB of JSON, which has no
 * business riding along with every page load.
 *
 * Both functions take the same options and merge the same three sources the
 * sheet's content pickers already merge — the SRD, the player's own homebrew,
 * and the campaign's library — through `listPickableContent`, so there is one
 * answer in the app to "what may this player pick?" and the wizard is not a
 * fourth place that decides it differently.
 */

/** Whose homebrew to fold in, and which table's library. */
export interface CatalogOptions {
  /**
   * The campaign the character is being built for. Its library comes along;
   * omitted, the player still gets their own homebrew and the SRD.
   */
  campaignId?: string;
}

/**
 * The homebrew half of the catalog, by type.
 *
 * `listPickableContent` reads the session itself and throws when there is
 * none, so every call is caught: signed out, this page still renders in order
 * to hand off to `ProtectedRoute`, and a missing session must degrade to "SRD
 * only" rather than blow up the page.
 */
async function pickableHomebrew(
  type: Parameters<typeof listPickableContent>[0],
  opts: CatalogOptions
): Promise<ContentEntry[]> {
  const entries = await listPickableContent(type, opts.campaignId).catch(
    () => [] as ContentEntry[]
  );
  return entries.filter(e => e.ref.source === 'homebrew');
}

/** SRD first, then homebrew, each alphabetical. Homebrew never shadows the SRD. */
function merged<T extends { key: string; name: string }>(
  srd: T[],
  homebrew: T[]
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const taken = new Set(srd.map(o => o.key));
  return [
    ...srd.sort(byName),
    ...homebrew.filter(o => !taken.has(o.key)).sort(byName),
  ];
}

/** Open5e mixes subclasses into `classes`; a subclass carries `subclass_of`. */
function isSubclass(data: unknown): boolean {
  return Boolean((data as RawClass | null)?.subclass_of);
}

export async function loadBuildCatalog(
  opts: CatalogOptions = {}
): Promise<BuildCatalog> {
  const [
    classRows,
    speciesRows,
    backgroundRows,
    featRows,
    alignmentRows,
    languageRows,
    brewClasses,
    brewSubclasses,
    brewSpecies,
    brewBackgrounds,
    brewFeats,
  ] = await Promise.all([
    getReference('class'),
    getReference('species'),
    getReference('background'),
    getReference('feat'),
    getReference('alignment'),
    getReference('language'),
    pickableHomebrew('class', opts),
    pickableHomebrew('subclass', opts),
    pickableHomebrew('species', opts),
    pickableHomebrew('background', opts),
    pickableHomebrew('feat', opts),
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

  const srdClasses: ClassSummary[] = classRows
    .filter(row => !isSubclass(row.data))
    .map(row => {
      const raw = row.data as RawClass;
      return toClassSummary(
        parseClass(raw, subclassesByParent.get(raw.key ?? '') ?? [])
      );
    });

  const srdSpecies: SpeciesDef[] = speciesRows
    .filter(row => !(row.data as RawSpecies)?.is_subspecies)
    .map(row => parseSpecies(row.data as RawSpecies));

  const srdBackgrounds: BackgroundDef[] = backgroundRows.map(row =>
    parseBackground(row.data as RawBackground)
  );
  const srdFeats: FeatDef[] = featRows.map(row =>
    parseFeat(row.data as RawFeat)
  );

  const brewClassSummaries = brewClasses.map(entry =>
    toClassSummary(
      classDefFromContent(entry, subclassesOf(entry.ref.key, brewSubclasses))
    )
  );

  return {
    classes: merged(srdClasses, brewClassSummaries),
    species: merged(srdSpecies, brewSpecies.map(speciesDefFromContent)),
    backgrounds: merged(
      srdBackgrounds,
      brewBackgrounds.map(backgroundDefFromContent)
    ),
    feats: merged(srdFeats, brewFeats.map(featDefFromContent)),
    alignments: alignmentRows.map(r => r.name).sort(),
    languages: languageRows.map(r => r.name).sort(),
  };
}

/** Homebrew subclasses naming one class as their parent. */
function subclassesOf(classKey: string, all: ContentEntry[]): ContentEntry[] {
  return all.filter(entry => {
    const parent = (entry.data as { parentClass?: unknown } | null)
      ?.parentClass;
    return typeof parent === 'string' && parent === classKey;
  });
}

/**
 * One class, parsed in full — features, spell slots, subclasses.
 *
 * Tries the SRD first and falls back to homebrew, because a homebrew key is a
 * `homebrew.id` and can never collide with an SRD slug. Without the fallback a
 * player who picked a forged class got a catalog entry and then no features,
 * no hit die and no spell slots — the pick looked accepted and did nothing.
 */
export async function loadClassDef(
  key: string,
  opts: CatalogOptions = {}
): Promise<ClassDef | null> {
  const rows = await getReference('class');
  const parent = rows.find(r => r.slug === key || r.name === key);

  if (parent && !isSubclass(parent.data)) {
    const raw = parent.data as RawClass;
    const subclasses = rows
      .map(r => r.data as RawClass)
      .filter(d => d.subclass_of?.key === raw.key);
    return parseClass(raw, subclasses);
  }

  const [brewClasses, brewSubclasses] = await Promise.all([
    pickableHomebrew('class', opts),
    pickableHomebrew('subclass', opts),
  ]);
  const entry = brewClasses.find(e => e.ref.key === key);
  if (!entry) return null;
  return classDefFromContent(entry, subclassesOf(key, brewSubclasses));
}
