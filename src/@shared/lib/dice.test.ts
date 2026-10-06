import { describe, expect, it } from 'vitest';

import {
  critToneOf,
  d20Faces,
  d20Result,
  facesFit,
  notationSides,
  parseNotation,
  rollNotation,
  withAdvantage,
} from './dice';

describe('parseNotation', () => {
  it('reads terms, signs and a flat modifier in any order', () => {
    expect(parseNotation('2d6+3')).toEqual({
      terms: [{ count: 2, sides: 6, negative: false }],
      modifier: 3,
    });
    expect(parseNotation(' 3 - d4 + 1d8 ')).toMatchObject({
      terms: [
        { count: 1, sides: 4, negative: true },
        { count: 1, sides: 8, negative: false },
      ],
      modifier: 3,
    });
  });

  it('reads keep-highest and keep-lowest', () => {
    expect(parseNotation('4d6kh3')?.terms[0].keepHighest).toBe(3);
    expect(parseNotation('2D20KL1-1')?.terms[0]).toMatchObject({
      keepLowest: 1,
      count: 2,
      sides: 20,
    });
  });

  it('refuses what is not dice, rather than rolling zero', () => {
    for (const bad of ['', '5', 'd', 'd1', '0d6', '101d6', '2d6kh3', 'fire']) {
      expect(parseNotation(bad), bad).toBeNull();
    }
  });
});

describe('rollNotation with faces', () => {
  it('tallies the faces it is given', () => {
    expect(rollNotation('2d6+3', [4, 5])).toMatchObject({
      dice: [4, 5],
      dropped: [],
      modifier: 3,
      total: 12,
    });
  });

  it('drops dice outside the keep', () => {
    const r = rollNotation('4d6kh3', [1, 6, 3, 5]);
    expect(r?.dropped).toEqual([0]);
    expect(r?.total).toBe(14);
    const low = rollNotation('2d20kl1', [15, 7]);
    expect(low?.dropped).toEqual([0]);
    expect(low?.total).toBe(7);
  });

  it('subtracts a negative term', () => {
    expect(rollNotation('1d8-1d4', [6, 2])?.total).toBe(4);
  });

  it('returns null for faces that do not fit', () => {
    expect(rollNotation('2d6', [4])).toBeNull();
    expect(rollNotation('1d6', [7])).toBeNull();
    expect(rollNotation('1d6', [2.5])).toBeNull();
  });

  it('rolls within range when no faces are given', () => {
    for (let i = 0; i < 50; i++) {
      const r = rollNotation('3d6')!;
      expect(r.total).toBeGreaterThanOrEqual(3);
      expect(r.total).toBeLessThanOrEqual(18);
    }
  });
});

describe('the rest of the notation helpers', () => {
  it('facesFit counts every die across terms', () => {
    const n = parseNotation('2d20kh1+1d4')!;
    expect(facesFit(n, [20, 1, 4])).toBe(true);
    expect(facesFit(n, [20, 1])).toBe(false);
    expect(facesFit(n, [20, 1, 5])).toBe(false);
  });

  it('d20Faces checks given faces and d20Result picks the counted one', () => {
    expect(d20Faces('advantage', [3, 17])).toEqual([3, 17]);
    expect(d20Faces('straight', [3, 17])).toBeNull();
    expect(d20Faces('straight', [21])).toBeNull();
    expect(d20Result('advantage', [3, 17])).toEqual({ face: 17, dropped: [0] });
    expect(d20Result('disadvantage', [3, 17])).toEqual({
      face: 3,
      dropped: [1],
    });
    expect(d20Result('straight', [9])).toEqual({ face: 9, dropped: [] });
  });

  it('withAdvantage rewrites the leading d20', () => {
    expect(withAdvantage('1d20+5', 'advantage')).toBe('2d20kh1+5');
    expect(withAdvantage('d20-1', 'disadvantage')).toBe('2d20kl1-1');
  });

  it('notationSides and critToneOf', () => {
    expect(notationSides('2d6+1d20')).toEqual([6, 6, 20]);
    expect(critToneOf('1d20+3', [20], [])).toBe('crit');
    expect(critToneOf('2d20kh1', [1, 20], [0])).toBe('crit');
    expect(critToneOf('2d20kl1', [1, 20], [1])).toBe('fumble');
    expect(critToneOf('2d20', [20, 20], [])).toBeNull();
    expect(critToneOf('1d6', [6], [])).toBeNull();
  });
});
