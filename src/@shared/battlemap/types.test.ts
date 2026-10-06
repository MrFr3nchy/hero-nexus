import { describe, expect, it } from 'vitest';

import {
  BOARD_VERSION,
  edgeKey,
  emptyTerrain,
  GROUND_LEVEL_ID,
  MAX_SIDE,
  MIN_SIDE,
  normalizeBoard,
  normalizeTerrain,
} from './types';

describe('edgeKey', () => {
  it('gives a seam one name from either side', () => {
    expect(edgeKey(3, 4, 'n')).toBe(edgeKey(3, 3, 's'));
    expect(edgeKey(3, 4, 'w')).toBe(edgeKey(2, 4, 'e'));
    expect(edgeKey(3, 4, 'n')).not.toBe(edgeKey(3, 4, 'w'));
  });
});

describe('normalizeTerrain', () => {
  it('clamps the size and fills a missing document', () => {
    const t = normalizeTerrain(null);
    expect([t.w, t.h]).toEqual([MIN_SIDE, MIN_SIDE]);
    expect(t.material).toHaveLength(MIN_SIDE * MIN_SIDE);
    expect(normalizeTerrain({ w: 999, h: 2 }).w).toBe(MAX_SIDE);
    expect(normalizeTerrain({ w: 999, h: 2 }).h).toBe(MIN_SIDE);
  });

  it('resizes arrays rather than trusting them', () => {
    const t = normalizeTerrain({ w: 4, h: 4, elevation: [5, 'x', 2.7] });
    expect(t.elevation).toHaveLength(16);
    expect(t.elevation.slice(0, 4)).toEqual([5, 0, 2, 0]);
  });

  it('drops out-of-bounds and duplicate walls, keeping door state', () => {
    const t = normalizeTerrain({
      w: 4,
      h: 4,
      walls: [
        { x: 1, y: 1, side: 'n', kind: 'door', open: 1 },
        { x: 1, y: 0, side: 's', kind: 'solid' },
        { x: 9, y: 1, side: 'n', kind: 'solid' },
        { x: 1, y: 1, side: 'q', kind: 'solid' },
        { x: 2, y: 2, side: 'e', kind: 'lava' },
      ],
    });
    expect(t.walls).toEqual([
      { x: 1, y: 1, side: 'n', kind: 'door', height: 0, open: true },
    ]);
  });

  it('keeps known ambient and weather, defaults the rest', () => {
    expect(normalizeTerrain({ ambient: 'dark' }).ambient).toBe('dark');
    expect(normalizeTerrain({ ambient: 'pitch' }).ambient).toBe('bright');
    expect(normalizeTerrain({ weather: 'rain' }).weather).toBe('rain');
    expect('weather' in normalizeTerrain({ weather: 'clear' })).toBe(false);
  });

  it('drops an image prop with no image', () => {
    const t = normalizeTerrain({
      w: 4,
      h: 4,
      props: [
        { x: 0, y: 0, kind: 'image' },
        { x: 1, y: 1, kind: 'image', imageId: 'img', height: 500 },
      ],
    });
    expect(t.props).toHaveLength(1);
    expect(t.props[0]).toMatchObject({ imageId: 'img', height: 100 });
  });
});

describe('normalizeBoard', () => {
  it('reads a version-1 terrain as a board with one ground floor', () => {
    const b = normalizeBoard(emptyTerrain(8, 6));
    expect(b.version).toBe(BOARD_VERSION);
    expect([b.w, b.h]).toEqual([8, 6]);
    expect(b.levels).toHaveLength(1);
    expect(b.levels[0]).toMatchObject({ id: GROUND_LEVEL_ID, feet: 0 });
  });

  it('sorts floors bottom to top and fixes links to run upward', () => {
    const b = normalizeBoard({
      w: 6,
      h: 6,
      levels: [
        { id: 'up', name: 'Upper', feet: 12 },
        { id: GROUND_LEVEL_ID, name: 'Ground', feet: 0 },
        { id: 'cellar', name: 'Cellar', feet: -10 },
      ],
      links: [
        { id: 'l1', kind: 'stairs', x: 1, y: 1, from: 'up', to: 'cellar' },
        { id: 'l2', kind: 'stairs', x: 1, y: 1, from: 'up', to: 'nowhere' },
        { id: 'l3', kind: 'rope', x: 1, y: 1, from: 'up', to: 'cellar' },
      ],
    });
    expect(b.levels.map(l => l.id)).toEqual(['cellar', GROUND_LEVEL_ID, 'up']);
    expect(b.links).toHaveLength(1);
    expect(b.links[0]).toMatchObject({ from: 'cellar', to: 'up', w: 1, h: 1 });
  });

  it('never returns a board with no floors', () => {
    expect(normalizeBoard({ levels: [] }).levels).toHaveLength(1);
  });

  it('gives duplicate floor ids a fresh one', () => {
    const b = normalizeBoard({
      levels: [
        { id: 'a', feet: 0 },
        { id: 'a', feet: 10 },
      ],
    });
    expect(new Set(b.levels.map(l => l.id)).size).toBe(2);
  });
});
