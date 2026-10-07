import { describe, expect, it } from 'vitest';

import {
  flattenPlaces,
  mapForPlace,
  nearbyPlaces,
  partyWhereabouts,
  pathLabel,
  placePath,
  placesInside,
  placesUnder,
  residentsOf,
  threadsAt,
  wouldLoop,
  type WorldEntry,
  type WorldMap,
} from './world';

const place = (id: string, placeId: string | null = null): WorldEntry => ({
  id,
  kind: 'location',
  title: id,
  placeId,
});
const npc = (id: string, placeId: string | null): WorldEntry => ({
  id,
  kind: 'npc',
  title: id,
  placeId,
});

// Coast › Waterdeep › Docks › Portal, and Neverwinter on the coast.
const world = [
  place('Coast'),
  place('Waterdeep', 'Coast'),
  place('Docks', 'Waterdeep'),
  place('Portal', 'Docks'),
  place('Neverwinter', 'Coast'),
  npc('Durnan', 'Portal'),
  npc('Mira', 'Docks'),
  npc('Drifter', null),
];
const byId = new Map(world.map(e => [e.id, e]));

describe('the place tree', () => {
  it('reads a place from the outside in', () => {
    const path = placePath('Portal', byId);
    expect(path.map(p => p.id)).toEqual([
      'Coast',
      'Waterdeep',
      'Docks',
      'Portal',
    ]);
    expect(pathLabel(path)).toBe('Coast › Waterdeep › Docks › Portal');
    expect(placePath(null, byId)).toEqual([]);
  });

  it('stops at a parent the viewer cannot see, and at a loop', () => {
    const hidden = new Map(byId);
    hidden.delete('Waterdeep');
    expect(placePath('Portal', hidden).map(p => p.id)).toEqual([
      'Docks',
      'Portal',
    ]);
    const loop = new Map([
      ['A', place('A', 'B')],
      ['B', place('B', 'A')],
    ]);
    expect(placePath('A', loop).map(p => p.id)).toEqual(['B', 'A']);
  });

  it('refuses a parent that would close a loop', () => {
    const parentOf = (id: string) => byId.get(id)?.placeId;
    expect(wouldLoop('Waterdeep', 'Portal', parentOf)).toBe(true);
    expect(wouldLoop('Waterdeep', 'Waterdeep', parentOf)).toBe(true);
    expect(wouldLoop('Portal', 'Neverwinter', parentOf)).toBe(false);
    expect(wouldLoop('Portal', null, parentOf)).toBe(false);
  });

  it('finds what is inside a place, at one level and at all', () => {
    expect(placesInside(null, world).map(p => p.id)).toEqual(['Coast']);
    expect(placesInside('Coast', world).map(p => p.id)).toEqual([
      'Neverwinter',
      'Waterdeep',
    ]);
    expect([...placesUnder('Waterdeep', world)].sort()).toEqual([
      'Docks',
      'Portal',
    ]);
  });

  it('lists every place, indented, and loses none to a loop', () => {
    const flat = flattenPlaces([...world, place('A', 'B'), place('B', 'A')]);
    expect(flat.map(f => `${f.depth}:${f.place.id}`)).toEqual([
      '0:Coast',
      '1:Neverwinter',
      '1:Waterdeep',
      '2:Docks',
      '3:Portal',
      '0:A',
      '0:B',
    ]);
  });

  it('knows who lives where, and only there', () => {
    expect(residentsOf('Docks', world).map(e => e.id)).toEqual(['Mira']);
    expect(residentsOf('Portal', world).map(e => e.id)).toEqual(['Durnan']);
  });
});

const stop = (
  id: string,
  seq: number,
  over: Partial<WorldMap['journey'][number]> = {}
): WorldMap['journey'][number] => ({
  id,
  seq,
  planned: false,
  pinId: null,
  label: '',
  createdAt: `2026-01-0${seq}`,
  ...over,
});

const coastMap: WorldMap = {
  id: 'm-coast',
  title: 'The Coast',
  placeId: 'Coast',
  pins: [
    { id: 'pin-wd', canonEntryId: 'Waterdeep' },
    { id: 'pin-nw', canonEntryId: 'Neverwinter' },
    { id: 'pin-x', canonEntryId: 'Mira' },
  ],
  journey: [
    stop('c1', 1, { pinId: 'pin-wd' }),
    stop('c2', 2, { label: 'A ditch' }),
    stop('c-next', 0, {
      planned: true,
      pinId: 'pin-nw',
      createdAt: '2026-03-01',
    }),
  ],
};
const cityMap: WorldMap = {
  id: 'm-wd',
  title: 'Waterdeep',
  placeId: 'Waterdeep',
  pins: [{ id: 'pin-portal', canonEntryId: 'Portal' }],
  journey: [stop('w1', 1, { pinId: 'pin-portal', createdAt: '2026-02-01' })],
};

describe('where the party is', () => {
  it('is wherever the last reached stop was put down, on any map', () => {
    const w = partyWhereabouts([coastMap, cityMap], world);
    expect(w.here).toMatchObject({
      mapId: 'm-wd',
      stopId: 'w1',
      placeId: 'Portal',
      label: 'Portal',
    });
  });

  it('heads for the planned stops, and has been around what it reached', () => {
    const w = partyWhereabouts([coastMap, cityMap], world);
    expect(w.headed.map(h => h.placeId)).toEqual(['Neverwinter']);
    // The Portal, and everything around it; the ditch is only "the Coast".
    expect([...w.been].sort()).toEqual([
      'Coast',
      'Docks',
      'Portal',
      'Waterdeep',
    ]);
  });

  it('counts a stop on the road as the place its map shows', () => {
    const w = partyWhereabouts([coastMap], world);
    expect(w.here).toMatchObject({ stopId: 'c2', placeId: 'Coast' });
    expect(w.here?.label).toBe('A ditch');
  });

  it('is nowhere before the first stop', () => {
    expect(partyWhereabouts([], world).here).toBeNull();
  });
});

describe('the map for a place', () => {
  const maps = [coastMap, cityMap];
  it('is its own map, or the nearest one above it', () => {
    expect(mapForPlace('Waterdeep', maps, byId)?.id).toBe('m-wd');
    expect(mapForPlace('Portal', maps, byId)?.id).toBe('m-wd');
    expect(mapForPlace('Neverwinter', maps, byId)?.id).toBe('m-coast');
  });

  it('falls back to a map that marks it, then to the map of nowhere', () => {
    const loose = { ...coastMap, placeId: null };
    expect(mapForPlace('Neverwinter', [cityMap, loose], byId)?.id).toBe(
      'm-coast'
    );
    expect(mapForPlace(null, [cityMap, loose], byId)?.id).toBe('m-coast');
    expect(mapForPlace(null, [cityMap], byId)?.id).toBe('m-wd');
  });
});

describe('what is going on in a place', () => {
  const quest = (
    id: string,
    placeId: string | null,
    steps: (string | null)[] = [],
    status = 'active'
  ) => ({
    id,
    placeId,
    status,
    objectives: steps.map(s => ({ placeId: s })),
  });
  const clock = (id: string, placeId: string | null, status = 'running') => ({
    id,
    placeId,
    status,
  });
  const quests = [
    quest('Lamp', 'Portal', ['Portal', 'Docks']),
    quest('Debts', 'Waterdeep', ['Neverwinter']),
    quest('Old', 'Waterdeep', [], 'done'),
    quest('Coastwide', 'Coast'),
    quest('Elsewhere', 'Neverwinter'),
    quest('Nowhere', null),
  ];
  const clocks = [
    clock('Tide', 'Docks'),
    clock('Patience', 'Waterdeep'),
    clock('Rang', 'Waterdeep', 'done'),
    clock('North', 'Neverwinter'),
  ];

  it('finds a quest by where it is, or where any step is', () => {
    const at = threadsAt('Docks', { quests, clocks }, byId);
    expect(at.quests.map(q => q.id)).toEqual(['Lamp']);
    expect(at.clocks.map(c => c.id)).toEqual(['Tide']);
    // A step in Neverwinter puts Debts there too.
    expect(
      threadsAt('Neverwinter', { quests, clocks }, byId).quests.map(q => q.id)
    ).toEqual(['Debts', 'Elsewhere']);
  });

  it('reaches inside when asked, and only then', () => {
    const flat = threadsAt('Waterdeep', { quests, clocks }, byId);
    expect(flat.quests.map(q => q.id)).toEqual(['Debts', 'Old']);
    const deep = threadsAt('Waterdeep', { quests, clocks }, byId, {
      inside: true,
    });
    expect(deep.quests.map(q => q.id)).toEqual(['Lamp', 'Debts', 'Old']);
    expect(deep.clocks.map(c => c.id)).toEqual(['Tide', 'Patience', 'Rang']);
  });

  it('trickles down from above — running and active only, never sideways', () => {
    const { fromAbove } = threadsAt('Portal', { quests, clocks }, byId);
    expect(fromAbove.quests.map(q => q.id)).toEqual(['Debts', 'Coastwide']);
    expect(fromAbove.clocks.map(c => c.id)).toEqual(['Tide', 'Patience']);
    // Neverwinter is a neighbour of Waterdeep, not above the Portal.
    expect(fromAbove.clocks.some(c => c.id === 'North')).toBe(false);
    // The outermost place has nothing above it.
    const top = threadsAt('Coast', { quests, clocks }, byId).fromAbove;
    expect(top).toEqual({ quests: [], clocks: [] });
  });

  it('does not repeat a quest that is already here', () => {
    const q = [quest('Both', 'Waterdeep', ['Docks'])];
    const at = threadsAt('Docks', { quests: q, clocks: [] }, byId);
    expect(at.quests.map(x => x.id)).toEqual(['Both']);
    expect(at.fromAbove.quests).toEqual([]);
  });
});

describe('what is near', () => {
  const none = { headed: [] };

  it('says why each place is near: inside, around, next door', () => {
    const { near, further } = nearbyPlaces('Waterdeep', world, none);
    expect(near).toEqual([
      { id: 'Coast', why: 'around' },
      { id: 'Docks', why: 'inside' },
      { id: 'Neverwinter', why: 'next door' },
    ]);
    expect(further).toEqual(['Portal']);
  });

  it('puts where the party is headed first', () => {
    const { near } = nearbyPlaces('Docks', world, {
      headed: [{ placeId: 'Neverwinter' }, { placeId: null }],
    });
    expect(near[0]).toEqual({ id: 'Neverwinter', why: 'headed' });
    expect(near.map(n => n.why)).toEqual(['headed', 'around', 'inside']);
  });

  it('works for a party that is nowhere yet', () => {
    const { near, further } = nearbyPlaces(null, world, {
      headed: [{ placeId: 'Portal' }],
    });
    expect(near).toEqual([
      { id: 'Portal', why: 'headed' },
      { id: 'Coast', why: 'inside' },
    ]);
    expect(further).toEqual(['Docks', 'Neverwinter', 'Waterdeep']);
  });
});
