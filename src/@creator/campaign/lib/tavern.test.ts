import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RULES,
  gamingSetProficient,
  holdCp,
  nextSeat,
  normalizeRules,
  openBetting,
  payIn,
  rulesLines,
  splitPot,
} from './tavern';

describe('house rules', () => {
  it('fill in what is missing and clamp what is out of range', () => {
    expect(normalizeRules('liars-dice', null)).toEqual(
      DEFAULT_RULES['liars-dice']
    );
    expect(
      normalizeRules('liars-dice', {
        dicePerCup: 40,
        onesWild: 'yes',
        anteCp: -5,
        spotOn: true,
      })
    ).toEqual({
      anteCp: 0,
      raiseCapCp: 500,
      dicePerCup: 6,
      onesWild: true,
      spotOn: true,
    });
    expect(
      normalizeRules('crowns', { target: 99, crownMultiplier: 1.7, dealt: '3' })
    ).toMatchObject({ target: 41, crownMultiplier: 2, dealt: 3, maxDraws: 2 });
  });

  it('read as sentences that follow the settings', () => {
    const lines = rulesLines('liars-dice', {
      ...DEFAULT_RULES['liars-dice'],
      onesWild: false,
      spotOn: true,
      anteCp: 250,
      raiseCapCp: 0,
    });
    expect(lines).toContain('Ones are only ones.');
    expect(lines.some(l => l.startsWith('Spot on'))).toBe(true);
    expect(lines).toContain('Everyone antes 2 gp, 5 sp a round.');
    expect(lines).toContain('Nobody raises.');
    expect(
      rulesLines('crowns', { ...DEFAULT_RULES.crowns, maxDraws: 0 })[1]
    ).toBe('No draws. Highest at or under 31 wins.');
  });
});

describe('betting', () => {
  it('holds the difference and raises on top', () => {
    const b = openBetting(['a', 'b', 'c'], 100, 40);
    expect(b.potCp).toBe(340);
    const r1 = payIn(b, 'a', 200);
    expect(r1.paidCp).toBe(200);
    expect(r1.betting.stakeCp).toBe(300);
    expect(holdCp(r1.betting, 'b')).toBe(200);
    const r2 = payIn(r1.betting, 'b', 0);
    expect(r2.paidCp).toBe(200);
    expect(r2.betting.potCp).toBe(740);
    expect(holdCp(r2.betting, 'b')).toBe(0);
  });

  it('splits a pot with the odd copper to the first winner', () => {
    expect(splitPot(101, ['a', 'b'])).toEqual({ a: 51, b: 50 });
    expect(splitPot(100, [])).toEqual({});
  });

  it('passes the turn around the seats, skipping the folded', () => {
    expect(nextSeat(['a', 'b', 'c'], 'a', ['b'])).toBe('c');
    expect(nextSeat(['a', 'b', 'c'], 'c', [])).toBe('a');
    expect(nextSeat(['a', 'b'], 'a', ['a', 'b'])).toBeNull();
  });
});

describe('gaming sets off the sheet', () => {
  it('match the right set and nothing that merely looks like it', () => {
    expect(gamingSetProficient("Thieves' tools, dice set", 'liars-dice')).toBe(
      true
    );
    expect(gamingSetProficient('Gaming set (dice)', 'liars-dice')).toBe(true);
    expect(gamingSetProficient('Dicey situations', 'liars-dice')).toBe(false);
    expect(gamingSetProficient('Playing cards', 'crowns')).toBe(true);
    expect(gamingSetProficient('Gaming set (playing card set)', 'crowns')).toBe(
      true
    );
    expect(gamingSetProficient('Dice set', 'crowns')).toBe(false);
    expect(gamingSetProficient('', 'crowns')).toBe(false);
  });
});
