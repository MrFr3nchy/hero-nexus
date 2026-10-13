import { describe, expect, it } from 'vitest';

import {
  applyBid,
  applyCall,
  applyFold,
  applySpotOn,
  beats,
  countFace,
  cupsFor,
  diceAfter,
  holdsFace,
  newRound,
  nextBid,
  nextStarter,
  palmDie,
} from './liars-dice';
import { DEFAULT_RULES, type LiarsDiceRules } from './tavern';

const rules: LiarsDiceRules = { ...DEFAULT_RULES['liars-dice'], spotOn: true };
const seats = ['kessa', 'brannoc', 'tobin'];
const fixed: Record<string, number[]> = {
  kessa: [5, 1, 5, 2, 6],
  brannoc: [2, 3, 6, 4, 6],
  tobin: [3, 4, 4, 1],
};
const diceLeft = { kessa: 5, brannoc: 5, tobin: 4 };

function round(starter = 'kessa') {
  let i = 0;
  return newRound(seats, diceLeft, rules, starter, n => {
    const cup = fixed[seats[i++]];
    expect(cup).toHaveLength(n);
    return cup;
  });
}

describe('bids', () => {
  it('must beat the last: more dice, or as many of a higher face', () => {
    expect(beats(null, { count: 1, face: 2 }, 14, rules)).toBe(true);
    expect(beats({ count: 4, face: 5 }, { count: 4, face: 6 }, 14, rules)).toBe(
      true
    );
    expect(beats({ count: 4, face: 5 }, { count: 5, face: 2 }, 14, rules)).toBe(
      true
    );
    expect(beats({ count: 4, face: 5 }, { count: 4, face: 4 }, 14, rules)).toBe(
      false
    );
    expect(beats(null, { count: 15, face: 3 }, 14, rules)).toBe(false);
  });

  it('never name ones while ones are wild', () => {
    expect(beats(null, { count: 2, face: 1 }, 14, rules)).toBe(false);
    expect(
      beats(null, { count: 2, face: 1 }, 14, { ...rules, onesWild: false })
    ).toBe(true);
    expect(nextBid({ count: 3, face: 6 }, rules)).toEqual({
      count: 4,
      face: 2,
    });
  });

  it('count wild ones toward any face but their own', () => {
    expect(countFace(Object.values(fixed), 5, true)).toBe(4);
    expect(countFace(Object.values(fixed), 5, false)).toBe(2);
    expect(countFace(Object.values(fixed), 1, true)).toBe(2);
  });
});

describe('a round', () => {
  it('goes around, holding a raise, and a wrong bid loses the call', () => {
    let r = round();
    ({ round: r } = applyBid(r, 'kessa', { count: 3, face: 5 }, 0, rules));
    expect(r.turn).toBe('brannoc');
    const raised = applyBid(r, 'brannoc', { count: 5, face: 5 }, 200, rules);
    r = raised.round;
    expect(raised.paidCp).toBe(200);
    expect(() => applyBid(r, 'kessa', { count: 6, face: 5 }, 0, rules)).toThrow(
      'NOT_YOUR_TURN'
    );
    const called = applyCall(r, 'tobin', rules);
    expect(called.paidCp).toBe(200);
    expect(called.round.result).toMatchObject({
      how: 'liar',
      counted: 4,
      winner: 'tobin',
      loser: 'brannoc',
    });
    expect(called.round.betting.potCp).toBe(700);
  });

  it('a bid that stands costs the caller', () => {
    let r = round();
    ({ round: r } = applyBid(r, 'kessa', { count: 4, face: 5 }, 0, rules));
    const { round: done } = applyCall(r, 'brannoc', rules);
    expect(done.result).toMatchObject({ winner: 'kessa', loser: 'brannoc' });
    expect(diceAfter(diceLeft, done.result!)).toMatchObject({ brannoc: 4 });
    expect(nextStarter(diceAfter(diceLeft, done.result!), done.result!)).toBe(
      'brannoc'
    );
  });

  it('refuses a call with no bid, or on your own', () => {
    const r = round();
    expect(() => applyCall(r, 'kessa', rules)).toThrow('NO_BID');
  });

  it('spot on: exact takes the pot and costs nobody a die', () => {
    let r = round();
    ({ round: r } = applyBid(r, 'kessa', { count: 4, face: 5 }, 0, rules));
    const exact = applySpotOn(r, 'brannoc', rules).round.result!;
    expect(exact).toMatchObject({ winner: 'brannoc', loser: null });
    let r2 = round();
    ({ round: r2 } = applyBid(r2, 'kessa', { count: 3, face: 5 }, 0, rules));
    expect(applySpotOn(r2, 'brannoc', rules).round.result).toMatchObject({
      winner: 'kessa',
      loser: 'brannoc',
    });
    expect(() =>
      applySpotOn(r2, 'brannoc', { ...rules, spotOn: false })
    ).toThrow('NO_SPOT_ON');
  });

  it('folding down to one seat ends it without lifting a cup', () => {
    let r = round();
    ({ round: r } = applyBid(r, 'kessa', { count: 2, face: 3 }, 0, rules));
    r = applyFold(r, 'brannoc');
    expect(r.turn).toBe('tobin');
    r = applyFold(r, 'tobin');
    expect(r.result).toMatchObject({ how: 'folds', winner: 'kessa' });
    expect(cupsFor(r, { seat: 'tobin', staff: false }).kessa).toBeNull();
  });

  it('shows a player only their own cup until the cups come up', () => {
    let r = round();
    const mine = cupsFor(r, { seat: 'tobin', staff: false });
    expect(mine.tobin).toEqual(fixed.tobin);
    expect(mine.kessa).toBeNull();
    expect(cupsFor(r, { seat: null, staff: true }).kessa).toEqual(fixed.kessa);
    ({ round: r } = applyBid(r, 'kessa', { count: 3, face: 5 }, 0, rules));
    r = applyCall(r, 'brannoc', rules).round;
    expect(cupsFor(r, { seat: 'tobin', staff: false }).kessa).toEqual(
      fixed.kessa
    );
  });

  it('a palmed die changes the cup, and a read sees through a bid', () => {
    const r = palmDie(round(), 'kessa', 3, 5);
    expect(r.cups.kessa).toEqual([5, 1, 5, 5, 6]);
    expect(() => palmDie(r, 'kessa', 9, 5)).toThrow('BAD_DIE');
    expect(holdsFace(r, 'brannoc', 5, true)).toBe(false);
    expect(holdsFace(r, 'tobin', 5, true)).toBe(true);
  });
});
