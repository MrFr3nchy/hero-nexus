import { describe, expect, it } from 'vitest';

import {
  applyBet,
  applyDraw,
  applyDrawBest,
  applyFold,
  applyStand,
  deck,
  handTotal,
  handsFor,
  holdsCrowned,
  newRound,
  shuffle,
  type Card,
} from './crowns';
import { DEFAULT_RULES, type CrownsRules } from './tavern';

const rules: CrownsRules = DEFAULT_RULES.crowns;
const c = (suit: Card['suit'], rank: number): Card => ({ suit, rank });

/**
 * Dealt one card at a time around the seats: pell 7c 9b, mags 10s 2c,
 * then the crown (4 of cups), then the deck.
 */
const stacked: Card[] = [
  c('cups', 7),
  c('staves', 10),
  c('blades', 9),
  c('cups', 2),
  c('cups', 4),
  c('cups', 10),
  c('coins', 3),
  c('blades', 1),
  c('staves', 2),
];

function round() {
  return newRound(['pell', 'mags'], stacked, rules, 'pell');
}

describe('the deck', () => {
  it('is forty cards, and a shuffle keeps every one', () => {
    const d = deck();
    expect(d).toHaveLength(40);
    const s = shuffle(d, n => n - 1);
    expect(s).toHaveLength(40);
    expect(new Set(s.map(x => `${x.suit}${x.rank}`)).size).toBe(40);
  });

  it('counts the crowned suit double', () => {
    expect(handTotal([c('cups', 7), c('blades', 9)], 'cups', rules)).toBe(23);
    expect(
      handTotal([c('cups', 7)], 'cups', { ...rules, crownMultiplier: 3 })
    ).toBe(21);
  });
});

describe('a round', () => {
  it('deals, turns the crown, and keeps hands private', () => {
    const r = round();
    expect(r.hands.pell).toEqual([c('cups', 7), c('blades', 9)]);
    expect(r.crown).toEqual(c('cups', 4));
    const seen = handsFor(r, { seat: 'mags', staff: false });
    expect(seen.pell).toBeNull();
    expect(seen.mags).toHaveLength(2);
    expect(holdsCrowned(r, 'mags')).toBe(true);
  });

  it('bets, draws, bets, and the best hand at or under 31 wins', () => {
    let r = round();
    ({ round: r } = applyBet(r, 'pell', 0, rules));
    ({ round: r } = applyBet(r, 'mags', 0, rules));
    expect(r.phase).toBe('draw');
    expect(r.turn).toBe('pell');
    r = applyStand(r, 'pell', rules);
    expect(r.turn).toBe('mags');
    r = applyDraw(r, 'mags', rules); // cups 10 → 20: mags at 10+4+20 = 34, bust
    r = applyDraw(r, 'mags', rules); // coins 3
    expect(r.phase).toBe('bet2');
    ({ round: r } = applyBet(r, 'pell', 100, rules));
    expect(r.turn).toBe('mags');
    ({ round: r } = applyBet(r, 'mags', 0, rules));
    expect(r.result).toMatchObject({
      how: 'show',
      winners: ['pell'],
      totals: { pell: 23, mags: 37 },
    });
    expect(r.result!.shares.pell).toBe(r.betting.potCp);
  });

  it('a raise reopens the pass for everyone else', () => {
    let r = newRound(['a', 'b', 'c'], deck(), rules, 'a');
    ({ round: r } = applyBet(r, 'a', 0, rules));
    ({ round: r } = applyBet(r, 'b', 200, rules));
    expect(r.pending.sort()).toEqual(['a', 'c']);
    expect(r.turn).toBe('c');
    ({ round: r } = applyBet(r, 'c', 0, rules));
    expect(r.turn).toBe('a');
    const held = applyBet(r, 'a', 0, rules);
    expect(held.paidCp).toBe(200);
    expect(held.round.phase).toBe('draw');
  });

  it('folding to one seat hands it the pot unshown', () => {
    const r = applyFold(round(), 'pell', rules);
    expect(r.result).toMatchObject({ how: 'folds', winners: ['mags'] });
    expect(handsFor(r, { seat: 'pell', staff: false }).mags).toBeNull();
  });

  it('everyone bust rolls the pot over', () => {
    let r = newRound(
      ['a', 'b'],
      [c('cups', 10), c('cups', 9), c('cups', 8), c('cups', 10), c('cups', 1)],
      { ...rules, maxDraws: 0 },
      'a',
      300
    );
    ({ round: r } = applyBet(r, 'a', 0, { ...rules, maxDraws: 0 }));
    ({ round: r } = applyBet(r, 'b', 0, { ...rules, maxDraws: 0 }));
    expect(r.result).toMatchObject({
      how: 'rollover',
      winners: [],
      carryCp: 500,
    });
  });

  it('dealing from the bottom keeps the better of two cards', () => {
    let r = round();
    ({ round: r } = applyBet(r, 'pell', 0, rules));
    ({ round: r } = applyBet(r, 'mags', 0, rules));
    // Top two: cups 10 (→ 43, bust) and coins 3 (→ 26). Pell keeps the 3.
    r = applyDrawBest(r, 'pell', rules);
    expect(r.hands.pell.at(-1)).toEqual(c('coins', 3));
    expect(r.deck.at(-1)).toEqual(c('cups', 10));
  });
});
