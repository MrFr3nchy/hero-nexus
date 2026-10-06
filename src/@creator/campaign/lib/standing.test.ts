import { describe, expect, it } from 'vitest';

import {
  clampStanding,
  isAttitude,
  standingLabel,
  standingRevealLine,
  standingTotals,
  validDelta,
} from './standing';

describe('standing', () => {
  it('clamps to −3…+3 for reading', () => {
    expect(clampStanding(17)).toBe(3);
    expect(clampStanding(-9)).toBe(-3);
    expect(standingLabel(0)).toBe('Neutral');
    expect(standingLabel(-1)).toBe('Wary');
    expect(standingLabel(12)).toBe('Allies');
  });

  it('sums everything, and separately what was shown', () => {
    expect(
      standingTotals([
        { id: 'a', delta: 2, reason: '', shown: true, createdAt: '' },
        { id: 'b', delta: -3, reason: '', shown: false, createdAt: '' },
        { id: 'c', delta: 1, reason: '', shown: true, createdAt: '' },
      ])
    ).toEqual({ total: 0, shown: 3 });
  });

  it('records only a real step', () => {
    expect([1, -1, 3, -3].every(validDelta)).toBe(true);
    expect([0, 4, -4, 1.5, NaN].some(validDelta)).toBe(false);
  });

  it('writes the line Revealed keeps', () => {
    expect(
      standingRevealLine('The Duskwater', -1, {
        delta: -1,
        reason: 'you burned their ledger',
      })
    ).toBe('The Duskwater: Wary (−1) — you burned their ledger');
    expect(standingRevealLine('The Guild', 2, { delta: 2, reason: ' ' })).toBe(
      'The Guild: Trusted (+2)'
    );
  });

  it('knows the three attitudes and nothing else', () => {
    expect(isAttitude('hostile')).toBe(true);
    expect(isAttitude('Hostile')).toBe(false);
    expect(isAttitude(null)).toBe(false);
  });
});
