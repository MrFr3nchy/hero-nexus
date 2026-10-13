import { describe, expect, it } from 'vitest';

import {
  readWorldRoute,
  writeWorldRoute,
  type WorldRoute,
} from './world-route';

const r = (over: Partial<WorldRoute> & Pick<WorldRoute, 'scope'>) => ({
  placeId: null,
  entryId: null,
  filter: 'everything' as const,
  ...over,
});

describe('the World’s address', () => {
  it('reads nothing as "land on Here"', () => {
    expect(readWorldRoute('')).toEqual({ kind: 'empty' });
    expect(readWorldRoute('/')).toEqual({ kind: 'empty' });
  });

  it('reads and writes each scope the same way round', () => {
    const cases: [string, WorldRoute][] = [
      ['here', r({ scope: 'here' })],
      ['here/inn', r({ scope: 'here', placeId: 'inn' })],
      [
        'here/inn/durnan',
        r({ scope: 'here', placeId: 'inn', entryId: 'durnan' }),
      ],
      ['nearby/inn', r({ scope: 'nearby', placeId: 'inn' })],
      ['everywhere', r({ scope: 'everywhere' })],
      ['everywhere/quests', r({ scope: 'everywhere', filter: 'quests' })],
      [
        'everywhere/clocks/inn',
        r({ scope: 'everywhere', filter: 'clocks', placeId: 'inn' }),
      ],
    ];
    for (const [raw, route] of cases) {
      expect(readWorldRoute(raw)).toEqual({ kind: 'route', route });
      expect(writeWorldRoute(route)).toBe(raw);
    }
  });

  it('writes "The world" as everywhere, never as an empty address', () => {
    // An empty address lands on Here; the breadcrumb must not bounce back.
    expect(writeWorldRoute(r({ scope: 'everywhere' }))).toBe('everywhere');
  });

  it('keeps reading the old four tabs and search links', () => {
    expect(readWorldRoute('places/inn/durnan')).toEqual({
      kind: 'route',
      route: r({ scope: 'here', placeId: 'inn', entryId: 'durnan' }),
    });
    expect(readWorldRoute('places')).toEqual({
      kind: 'route',
      route: r({ scope: 'here' }),
    });
    expect(readWorldRoute('canon')).toEqual({
      kind: 'route',
      route: r({ scope: 'everywhere', filter: 'canon' }),
    });
    expect(readWorldRoute('maps')).toEqual({
      kind: 'route',
      route: r({ scope: 'everywhere', filter: 'maps' }),
    });
    expect(readWorldRoute('npcs')).toEqual({
      kind: 'route',
      route: r({ scope: 'everywhere', filter: 'people' }),
    });
    expect(readWorldRoute('npcs/durnan')).toEqual({
      kind: 'entry',
      entryId: 'durnan',
      fallback: 'people',
    });
    expect(readWorldRoute('entry/abc')).toEqual({
      kind: 'entry',
      entryId: 'abc',
      fallback: 'canon',
    });
  });

  it('reads a filter it does not know as everything, and fights as encounters', () => {
    expect(readWorldRoute('everywhere/nonsense')).toEqual({
      kind: 'route',
      route: r({ scope: 'everywhere' }),
    });
    expect(readWorldRoute('everywhere/fights')).toEqual({
      kind: 'route',
      route: r({ scope: 'everywhere', filter: 'encounters' }),
    });
  });
});
