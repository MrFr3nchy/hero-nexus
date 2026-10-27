import { describe, expect, it } from 'vitest';

import { MATERIALS, type TerrainDoc } from '@/@shared/battlemap/types';

import { canStand, sketchLevel, takenTiles } from './board-sketch';

const stone = MATERIALS.findIndex(
  m => m.key !== 'void' && !m.difficult && !m.impassable
);
const rough = MATERIALS.findIndex(m => m.difficult && !m.impassable);

function board(): TerrainDoc {
  const w = 4;
  const h = 3;
  const material = Array(w * h).fill(stone);
  material[0] = 0; // void at 0,0
  material[1 * w + 2] = rough; // difficult at 2,1
  return {
    w,
    h,
    material,
    elevation: Array(w * h).fill(0),
    walls: [
      { x: 1, y: 0, side: 'n', kind: 'solid', height: 10 },
      { x: 2, y: 0, side: 'n', kind: 'solid', height: 10 },
      { x: 3, y: 2, side: 'e', kind: 'door', height: 10 },
    ],
    props: [{ x: 3, y: 0, kind: 'barrel', blocks: true }],
    lights: [],
    rooms: [{ x: 0, y: 0, w: 4, h: 3, name: 'Cellar' }],
  } as unknown as TerrainDoc;
}

describe('canStand', () => {
  const taken = takenTiles([{ x: 1, y: 2, footprint: 1 }]);

  it('keeps creatures on floor that is free', () => {
    expect(canStand(board(), taken, 1, 1)).toBe(true);
    expect(canStand(board(), taken, 2, 1)).toBe(true);
  });

  it('refuses void, blocking props, the taken, and off the board', () => {
    expect(canStand(board(), taken, 0, 0)).toBe(false);
    expect(canStand(board(), taken, 3, 0)).toBe(false);
    expect(canStand(board(), taken, 1, 2)).toBe(false);
    expect(canStand(board(), taken, 4, 0)).toBe(false);
  });
});

describe('sketchLevel', () => {
  it('draws the tiles and lists walls as runs', () => {
    const text = sketchLevel(board(), takenTiles([]));
    expect(text).toContain('   0 #..O');
    expect(text).toContain('   1 ..~.');
    expect(text).toContain('solid on the north edge of x 1-2, y 0');
    expect(text).toContain('door on the east edge of x 3, y 2');
    expect(text).toContain('Cellar: x 0-3, y 0-2');
  });
});
