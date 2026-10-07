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
  /** The map the stop is on; null for a stop at a place with no map. */
  mapId: string | null;
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
 * A stop at a place with no picture (0074): day one, before any map is
 * pinned up. Its place is its own `placeId`, not a mark's or a map's.
 */
export interface PlaceStop {
  id: string;
  seq: number;
  planned: boolean;
  placeId: string | null;
  label: string;
  createdAt: string;
}

/**
 * Here, headed and been, across every map — and the stops at places with no
 * map at all.
 *
 * Here is the reached stop put down last, wherever it is — a party that
 * walked off the region map into the city is in the city. Been holds every
 * place a reached stop stood in and every place around those: a night in
 * the Dock Ward is a night in Waterdeep.
 */
export function partyWhereabouts(
  maps: readonly WorldMap[],
  entries: readonly WorldEntry[],
  placeStops: readonly PlaceStop[] = []
): { here: Whereabouts | null; headed: Whereabouts[]; been: Set<string> } {
  const byId = new Map(entries.map(e => [e.id, e]));
  const places = new Set(entries.filter(isPlace).map(e => e.id));
  const name = (
    stop: { label: string; planned: boolean; seq: number },
    placeId: string | null
  ) =>
    stop.label ||
    (placeId ? byId.get(placeId)?.title : '') ||
    (stop.planned ? 'Somewhere ahead' : `Stop ${stop.seq}`);

  const all = [
    ...maps.flatMap(map =>
      map.journey.map(stop => {
        const placeId = placeOfStop(stop, map, places);
        return {
          stop,
          where: {
            mapId: map.id,
            stopId: stop.id,
            placeId,
            label: name(stop, placeId),
            seq: stop.seq,
          } satisfies Whereabouts,
        };
      })
    ),
    ...placeStops.map(stop => {
      const placeId =
        stop.placeId && places.has(stop.placeId) ? stop.placeId : null;
      return {
        stop,
        where: {
          mapId: null,
          stopId: stop.id,
          placeId,
          label: name(stop, placeId),
          seq: stop.seq,
        } satisfies Whereabouts,
      };
    }),
  ];

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

/* --- what is going on in a place ---------------------------------------------- */

/** The least of a quest this module needs. */
export interface WorldQuest {
  id: string;
  placeId: string | null;
  status: string;
  objectives: { placeId: string | null }[];
}

/** The least of a clock this module needs. */
export interface WorldClock {
  id: string;
  placeId: string | null;
  status: string;
}

/**
 * The quests and clocks at a place.
 *
 * A quest is at a place when it is placed there or any of its steps is: a
 * quest that starts in the tavern and ends in the crypt is at both. With
 * `inside`, anywhere under the place counts too — the city's sheet shows the
 * tavern's quest.
 *
 * `fromAbove` is what trickles down: the active quests and running clocks
 * placed on any place above this one. A city-wide deadline matters in every
 * tavern in it; the tavern's own business does not travel up, and a
 * neighbour's never travels sideways.
 */
export function threadsAt<Q extends WorldQuest, C extends WorldClock>(
  placeId: string,
  { quests, clocks }: { quests: readonly Q[]; clocks: readonly C[] },
  byId: ReadonlyMap<string, WorldEntry>,
  { inside }: { inside: boolean } = { inside: false }
): {
  quests: Q[];
  clocks: C[];
  fromAbove: { quests: Q[]; clocks: C[] };
} {
  const within = new Set([placeId]);
  if (inside) {
    for (const id of placesUnder(placeId, [...byId.values()])) within.add(id);
  }
  // Every place above this one, not this one.
  const above = new Set(placePath(placeId, byId).map(p => p.id));
  above.delete(placeId);

  const questAt = (q: Q, at: ReadonlySet<string>) =>
    (q.placeId !== null && at.has(q.placeId)) ||
    q.objectives.some(o => o.placeId !== null && at.has(o.placeId));

  const here = quests.filter(q => questAt(q, within));
  const clocksHere = clocks.filter(
    c => c.placeId !== null && within.has(c.placeId)
  );
  const mine = new Set(here.map(q => q.id));
  return {
    quests: here,
    clocks: clocksHere,
    fromAbove: {
      quests: quests.filter(
        q =>
          q.status === 'active' &&
          !mine.has(q.id) &&
          q.placeId !== null &&
          above.has(q.placeId)
      ),
      clocks: clocks.filter(
        c =>
          c.status === 'running' && c.placeId !== null && above.has(c.placeId)
      ),
    },
  };
}

/* --- what is near ------------------------------------------------------------- */

/**
 * Why a place is near: it is inside this one, this one is inside it, it sits
 * beside this one in the same place, or the party is headed there.
 */
export type NearWhy = 'inside' | 'around' | 'next door' | 'headed';

/**
 * The places around `placeId`, and why each is near — no distances, because
 * the world has no roads in it, only places inside places. Everything else
 * the viewer can see is `further`, by title.
 *
 * With no place (a party that is nowhere yet), the outermost places are near
 * as what the world is made of, and where the party is headed still is.
 */
export function nearbyPlaces<T extends WorldEntry>(
  placeId: string | null,
  entries: readonly T[],
  whereabouts: { headed: readonly Pick<Whereabouts, 'placeId'>[] }
): { near: { id: string; why: NearWhy }[]; further: string[] } {
  const byId = new Map(entries.map(e => [e.id, e]));
  const place = placeId ? byId.get(placeId) : undefined;
  const near: { id: string; why: NearWhy }[] = [];
  const taken = new Set<string>(placeId ? [placeId] : []);
  const add = (id: string, why: NearWhy) => {
    if (taken.has(id)) return;
    taken.add(id);
    near.push({ id, why });
  };

  // Where the party is going first: it is the likeliest next sheet.
  for (const h of whereabouts.headed) {
    if (h.placeId && byId.has(h.placeId)) add(h.placeId, 'headed');
  }
  if (place) {
    const parent = place.placeId ? byId.get(place.placeId) : undefined;
    if (parent && isPlace(parent)) add(parent.id, 'around');
    for (const p of placesInside(place.id, entries)) add(p.id, 'inside');
    for (const p of placesInside(parent?.id ?? null, entries)) {
      add(p.id, 'next door');
    }
  } else {
    for (const p of placesInside(null, entries)) add(p.id, 'inside');
  }

  const further = entries
    .filter(isPlace)
    .filter(e => !taken.has(e.id))
    .sort(byTitle)
    .map(e => e.id);
  return { near, further };
}
