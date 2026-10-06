import { describe, expect, it } from 'vitest';

import { normalizeBoard, normalizeTerrain } from './types';
import { backdropSize, edgesAlong, parseUvtt } from './uvtt';

const map = (over: Record<string, unknown> = {}) => ({
  format: 0.3,
  resolution: {
    map_origin: { x: 0, y: 0 },
    map_size: { x: 10, y: 8 },
    pixels_per_grid: 256,
  },
  line_of_sight: [],
  portals: [],
  lights: [],
  image: 'iVBORw0KGgo=',
  ...over,
});

describe('edgesAlong', () => {
  it('a wall on a grid line gives exactly the edges under it', () => {
    expect(edgesAlong({ x: 1, y: 2 }, { x: 4, y: 2 }, 10, 8)).toEqual([
      { x: 1, y: 2, side: 'n' },
      { x: 2, y: 2, side: 'n' },
      { x: 3, y: 2, side: 'n' },
    ]);
    expect(edgesAlong({ x: 3, y: 0 }, { x: 3, y: 2 }, 10, 8)).toEqual([
      { x: 3, y: 0, side: 'w' },
      { x: 3, y: 1, side: 'w' },
    ]);
  });

  it('the far border lands on the last tile', () => {
    expect(edgesAlong({ x: 0, y: 8 }, { x: 2, y: 8 }, 10, 8)).toEqual([
      { x: 0, y: 7, side: 's' },
      { x: 1, y: 7, side: 's' },
    ]);
    expect(edgesAlong({ x: 10, y: 0 }, { x: 10, y: 1 }, 10, 8)).toEqual([
      { x: 9, y: 0, side: 'e' },
    ]);
  });

  it('a diagonal becomes one connected staircase, never a box', () => {
    const steps = edgesAlong({ x: 0, y: 6 }, { x: 3, y: 9 }, 10, 9);
    // Three across and three down: six edges, not twelve.
    expect(steps).toHaveLength(6);
    // No tile is walled on two opposite sides.
    const keys = new Set(steps.map(e => `${e.x},${e.y},${e.side}`));
    for (const e of steps) {
      if (e.side === 'n') expect(keys.has(`${e.x},${e.y},s`)).toBe(false);
      if (e.side === 'w') expect(keys.has(`${e.x},${e.y},e`)).toBe(false);
    }
  });

  it('a wall off the grid lines snaps to the nearest one', () => {
    expect(edgesAlong({ x: 1.1, y: 2.4 }, { x: 2.9, y: 2.4 }, 10, 8)).toEqual([
      { x: 1, y: 2, side: 'n' },
      { x: 2, y: 2, side: 'n' },
    ]);
  });

  it('nothing off the board', () => {
    expect(edgesAlong({ x: -3, y: -1 }, { x: -1, y: -1 }, 10, 8)).toEqual([]);
  });
});

describe('parseUvtt', () => {
  it('reads walls, a door over a wall, and lights', () => {
    const res = parseUvtt(
      map({
        line_of_sight: [
          [
            { x: 1, y: 1 },
            { x: 5, y: 1 },
            { x: 5, y: 3 },
          ],
        ],
        portals: [
          {
            position: { x: 2.5, y: 1 },
            bounds: [
              { x: 2, y: 1 },
              { x: 3, y: 1 },
            ],
            rotation: 0,
            closed: true,
            freestanding: false,
          },
        ],
        lights: [{ position: { x: 4.5, y: 6.2 }, range: 6, color: 'ffaa00' }],
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const g = res.geometry;
    expect([g.w, g.h]).toEqual([10, 8]);
    expect(g.walls.filter(w => w.kind === 'solid')).toHaveLength(5);
    expect(g.walls.filter(w => w.kind === 'door')).toEqual([
      { x: 2, y: 1, side: 'n', kind: 'door', height: 0, open: false },
    ]);
    expect(g.lights).toEqual([{ x: 4, y: 6, radius: 30 }]);
    expect(g.image).toBe('iVBORw0KGgo=');
    expect(g.pixelsPerGrid).toBe(256);
  });

  it('honours the map origin', () => {
    const res = parseUvtt(
      map({
        resolution: {
          map_origin: { x: 2, y: 2 },
          map_size: { x: 10, y: 8 },
          pixels_per_grid: 100,
        },
        line_of_sight: [
          [
            { x: 2, y: 3 },
            { x: 3, y: 3 },
          ],
        ],
      })
    );
    expect(res.ok && res.geometry.walls[0]).toMatchObject({
      x: 0,
      y: 1,
      side: 'n',
    });
  });

  it('refuses a map too big rather than cropping it, and says how big', () => {
    const res = parseUvtt(
      map({ resolution: { map_size: { x: 72, y: 40 }, pixels_per_grid: 70 } })
    );
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/72 × 40/);
  });

  it('refuses what is not a Universal VTT file', () => {
    expect(parseUvtt({ hello: 1 }).ok).toBe(false);
    expect(parseUvtt(null).ok).toBe(false);
  });

  it('strips a data-URL prefix from the picture', () => {
    const res = parseUvtt(map({ image: 'data:image/png;base64,AAAA' }));
    expect(res.ok && res.geometry.image).toBe('AAAA');
  });

  it('survives the board normaliser untouched', () => {
    const res = parseUvtt(
      map({
        line_of_sight: [
          [
            { x: 0, y: 4 },
            { x: 10, y: 4 },
          ],
        ],
      })
    );
    if (!res.ok) throw new Error(res.error);
    const t = normalizeTerrain({
      w: res.geometry.w,
      h: res.geometry.h,
      walls: res.geometry.walls,
      lights: res.geometry.lights,
      backdrop: { imageId: 'img', opacity: 1 },
    });
    expect(t.walls).toHaveLength(10);
    expect(t.backdrop).toEqual({ imageId: 'img', opacity: 1 });
    expect(normalizeBoard(t).levels[0].backdrop).toEqual({
      imageId: 'img',
      opacity: 1,
    });
  });
});

describe('backdropSize', () => {
  it('keeps the long side within the texture limit', () => {
    expect(backdropSize(10, 8)).toEqual({ width: 1400, height: 1120 });
    const big = backdropSize(60, 30);
    expect(big.width).toBe(4096);
    expect(big.height).toBe(2048);
  });
});
