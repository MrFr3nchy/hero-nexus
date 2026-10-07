/**
 * Where in the World the reader is, as it sits after `#world/` in the
 * address.
 *
 *   here/<placeId>[/<entryId>]        one place: its map, and its sheet
 *   nearby/<placeId>                  the places around it
 *   everywhere[/<filter>[/<placeId>]] the whole world as a ledger
 *
 * The World had four tabs before it had scopes (`places/…`, `npcs/…`,
 * `canon`, `maps`), and search results still link to `entry/<id>`. Those are
 * in bookmarks, in Discord posts and in the capture box, so they are read
 * forever and redirected to the shape they mean now.
 *
 * Pure: the World panel reads and writes through this, and the campaign page
 * uses the folded sections' targets below.
 */

export type Scope = 'here' | 'nearby' | 'everywhere';

export const FILTERS = [
  'everything',
  'people',
  'shops',
  'quests',
  'encounters',
  'clocks',
  'canon',
  'maps',
  'random-tables',
] as const;
export type Filter = (typeof FILTERS)[number];

export interface WorldRoute {
  scope: Scope;
  /** The place being looked at, or the place picked in the ledger's tree. */
  placeId: string | null;
  /** Someone or something at that place to open on arrival. */
  entryId: string | null;
  /** Everywhere only: what the ledger lists. */
  filter: Filter;
}

/** What a raw address asks for. */
export type ReadRoute =
  /** Nothing after `#world`: land on Here. */
  | { kind: 'empty' }
  | { kind: 'route'; route: WorldRoute }
  /** A search result or an old NPC link: open the entry where it lives. */
  | { kind: 'entry'; entryId: string; fallback: Filter };

const isFilter = (v: string | undefined): v is Filter =>
  (FILTERS as readonly string[]).includes(v ?? '');

const route = (r: Partial<WorldRoute> & Pick<WorldRoute, 'scope'>) =>
  ({
    kind: 'route',
    route: { placeId: null, entryId: null, filter: 'everything', ...r },
  }) as const;

export function readWorldRoute(raw: string): ReadRoute {
  const [head, a, b] = raw.split('/').filter(Boolean);
  switch (head) {
    case undefined:
      return { kind: 'empty' };
    case 'here':
      return route({ scope: 'here', placeId: a ?? null, entryId: b ?? null });
    case 'nearby':
      return route({ scope: 'nearby', placeId: a ?? null });
    case 'everywhere':
      return route({
        scope: 'everywhere',
        // "fights" was the design's word; the encounter is the thing.
        filter: a === 'fights' ? 'encounters' : isFilter(a) ? a : 'everything',
        placeId: b ?? null,
      });
    // --- the four tabs, before there were scopes ---
    case 'places':
      return route({ scope: 'here', placeId: a ?? null, entryId: b ?? null });
    case 'npcs':
      return a
        ? { kind: 'entry', entryId: a, fallback: 'people' }
        : route({ scope: 'everywhere', filter: 'people' });
    case 'canon':
    case 'maps':
      return route({ scope: 'everywhere', filter: head });
    case 'entry':
      return a
        ? { kind: 'entry', entryId: a, fallback: 'canon' }
        : route({ scope: 'everywhere', filter: 'canon' });
    default:
      return { kind: 'empty' };
  }
}

export function writeWorldRoute(r: WorldRoute): string {
  if (r.scope === 'here') {
    return ['here', r.placeId, r.placeId && r.entryId]
      .filter(Boolean)
      .join('/');
  }
  if (r.scope === 'nearby') {
    return ['nearby', r.placeId].filter(Boolean).join('/');
  }
  if (r.filter === 'everything' && !r.placeId) return 'everywhere';
  return ['everywhere', r.filter, r.placeId].filter(Boolean).join('/');
}

/**
 * The campaign sections folded into the World, and where each one's old
 * address now lands. Bookmarks, Discord links and the overview's buttons all
 * still say `#quests`.
 */
export const FOLDED_SECTIONS: Record<string, string> = {
  quests: 'world/everywhere/quests',
  'random-tables': 'world/everywhere/random-tables',
  encounters: 'world/everywhere/encounters',
};
