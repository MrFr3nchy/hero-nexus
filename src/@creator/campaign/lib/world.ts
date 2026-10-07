/**
 * The world — the pure half.
 *
 * A place is a canon `location` entry, and every place, person and shop says
 * where it is with one pointer, `placeId`. That pointer makes a tree (Sword
 * Coast › Waterdeep › Dock Ward › The Yawning Portal), and this module is the
 * maths of that tree and of where the party stands on it: here (the last stop
 * reached), headed (the planned stops) and been (every place a reached stop
 * stood in, and every place around those).
 *
 * Pure: no React, no server, no database. The server reads rows; the World
 * view and the session screen's Here panel both read the world through this.
 */

/** The least of a canon entry this module needs. */
export interface WorldEntry {
  id: string;
  kind: string;
  title: string;
  placeId: string | null;
}

/** The least of a map this module needs. */
export interface WorldMap {
  id: string;
  title: string;
  placeId: string | null;
  pins: { id: string; canonEntryId: string | null }[];
  journey: {
    id: string;
    seq: number;
    planned: boolean;
    pinId: string | null;
    label: string;
    createdAt: string;
  }[];
}

export const isPlace = (e: Pick<WorldEntry, 'kind'>): boolean =>
  e.kind === 'location';

/* --- the tree ------------------------------------------------------------ */

/**
 * The chain from the outermost place down to `id`, inclusive.
 *
 * Stops at a parent the viewer cannot see (the server nulls those for a
 * player, but a missing row means the same thing) and at a loop, which the
 * server refuses to write but a hand-edited database could still hold.
 */
export function placePath<T extends WorldEntry>(
  id: string | null,
  byId: ReadonlyMap<string, T>
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  let at = id ? byId.get(id) : undefined;
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    out.unshift(at);
    at = at.placeId ? byId.get(at.placeId) : undefined;
  }
  return out;
}

/** "Sword Coast › Waterdeep › Dock Ward". */
export function pathLabel(path: readonly Pick<WorldEntry, 'title'>[]): string {
  return path.map(p => p.title || 'Somewhere').join(' › ');
}

/**
 * Would making `parentId` the parent of `childId` close a loop? True when the
 * child is the parent, or is anywhere above it.
 */
export function wouldLoop(
  childId: string,
  parentId: string | null,
  parentOf: (id: string) => string | null | undefined
): boolean {
  const seen = new Set<string>();
  let at: string | null | undefined = parentId;
  while (at) {
    if (at === childId) return true;
    if (seen.has(at)) return true;
    seen.add(at);
    at = parentOf(at);
  }
  return false;
}

/** The places directly inside `id` (null for the outermost), by title. */
export function placesInside<T extends WorldEntry>(
  id: string | null,
  entries: readonly T[]
): T[] {
  const byId = new Map(entries.map(e => [e.id, e]));
  return entries
    .filter(isPlace)
    .filter(e =>
      id === null
        ? // Outermost: no parent, or a parent this viewer cannot see.
          !e.placeId || !byId.has(e.placeId)
        : e.placeId === id
    )
    .sort(byTitle);
}

/** Every place under `id`, at any depth — not `id` itself. */
export function placesUnder<T extends WorldEntry>(
  id: string,
  entries: readonly T[]
): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of entries) {
      if (isPlace(e) && e.placeId === at && !out.has(e.id) && e.id !== id) {
        out.add(e.id);
        queue.push(e.id);
      }
    }
  }
  return out;
}

/**
 * The places as an indented list, depth first and by title: what "jump to"
 * and the List view show, and what a place picker offers.
 */
export function flattenPlaces<T extends WorldEntry>(
  entries: readonly T[]
): { place: T; depth: number }[] {
  const out: { place: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (id: string | null, depth: number) => {
    for (const p of placesInside(id, entries)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ place: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  // A loop has no outermost place; list what is left at the top rather
  // than lose it.
  for (const p of entries.filter(isPlace).sort(byTitle)) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push({ place: p, depth: 0 });
    }
  }
  return out;
}

/** Who lives in `placeId` — directly, not in the places inside it. */
export function residentsOf<T extends WorldEntry>(
  placeId: string,
  entries: readonly T[]
): T[] {
  return entries
    .filter(e => !isPlace(e) && e.placeId === placeId)
    .sort(byTitle);
}

const byTitle = (a: WorldEntry, b: WorldEntry) =>
  (a.title || '').localeCompare(b.title || '', undefined, {
    sensitivity: 'base',
  });

/* --- where the party is ------------------------------------------------------ */

export interface Whereabouts {
  mapId: string;
  stopId: string;
  /** The place the stop stands in, when one can be named. */
  placeId: string | null;
  /** The stop's own name, or the place's, or "Stop 4". */
  label: string;
  seq: number;
}

/**
 * The place a stop stands in: the place its mark is for, or else the place
 * its map shows. A stop on the road between two marks on the region map is
 * in the region and nowhere smaller.
 */
export function placeOfStop(
  stop: WorldMap['journey'][number],
  map: WorldMap,
  places: ReadonlySet<string>
): string | null {
  const pin = stop.pinId ? map.pins.find(p => p.id === stop.pinId) : null;
  if (pin?.canonEntryId && places.has(pin.canonEntryId)) {
    return pin.canonEntryId;
  }
  return map.placeId && places.has(map.placeId) ? map.placeId : null;
}

/**
 * Here, headed and been, across every map.
 *
 * Here is the reached stop put down last, whichever map it is on — a party
 * that walked off the region map into the city is in the city. Been holds
 * every place a reached stop stood in and every place around those: a night
 * in the Dock Ward is a night in Waterdeep.
 */
export function partyWhereabouts(
  maps: readonly WorldMap[],
  entries: readonly WorldEntry[]
): { here: Whereabouts | null; headed: Whereabouts[]; been: Set<string> } {
  const byId = new Map(entries.map(e => [e.id, e]));
  const places = new Set(entries.filter(isPlace).map(e => e.id));

  const all = maps.flatMap(map =>
    map.journey.map(stop => {
      const placeId = placeOfStop(stop, map, places);
      return {
        stop,
        where: {
          mapId: map.id,
          stopId: stop.id,
          placeId,
          label:
            stop.label ||
            (placeId ? byId.get(placeId)?.title : '') ||
            (stop.planned ? 'Somewhere ahead' : `Stop ${stop.seq}`),
          seq: stop.seq,
        } satisfies Whereabouts,
      };
    })
  );

  const reached = all
    .filter(a => !a.stop.planned)
    .sort(
      (a, b) =>
        a.stop.createdAt.localeCompare(b.stop.createdAt) ||
        a.stop.seq - b.stop.seq
    );
  const headed = all
    .filter(a => a.stop.planned)
    .sort((a, b) => a.stop.createdAt.localeCompare(b.stop.createdAt))
    .map(a => a.where);

  const been = new Set<string>();
  for (const r of reached) {
    for (const p of placePath(r.where.placeId, byId)) been.add(p.id);
  }

  return {
    here: reached.length ? reached[reached.length - 1].where : null,
    headed,
    been,
  };
}

/* --- maps of places ---------------------------------------------------------- */

/**
 * The map to show for a place: one drawn of it, else one drawn of the nearest
 * place above it — the Yawning Portal has no map of its own, but it is on
 * Waterdeep's. Failing that, a map with a mark for it (or for a place above
 * it), and failing that the map of no place in particular.
 */
export function mapForPlace<
  M extends Pick<WorldMap, 'id' | 'placeId' | 'pins'>,
>(
  placeId: string | null,
  maps: readonly M[],
  byId: ReadonlyMap<string, WorldEntry>
): M | null {
  const path = placePath(placeId, byId);
  for (let i = path.length - 1; i >= 0; i--) {
    const m = maps.find(x => x.placeId === path[i].id);
    if (m) return m;
  }
  for (let i = path.length - 1; i >= 0; i--) {
    const m = maps.find(x => x.pins.some(p => p.canonEntryId === path[i].id));
    if (m) return m;
  }
  return (
    maps.find(m => !m.placeId || !byId.has(m.placeId)) ??
    (placeId ? null : (maps[0] ?? null))
  );
}
