import { describe, expect, it } from 'vitest';

import {
  applyBet,
  applyFold,
  applyRoll,
  applyStop,
  diceFor,
  isInstantWin,
  newRound,
  palmDie,
  scoreDice,
  scoreWords,
  type CustomRound,
} from './custom-dice';
import {
  DEFAULT_RULES,
  DICE_TEMPLATES,
  normalizeRules,
  type CustomDiceRules,
} from './tavern';

const rules = (patch: Partial<CustomDiceRules>): CustomDiceRules =>
  normalizeRules('custom-dice', { ...DEFAULT_RULES['custom-dice'], ...patch });

/** A roller that hands out these faces in order. */
function fixed(...faces: number[]) {
  let i = 0;
  return (n: number) => Array.from({ length: n }, () => faces[i++]);
}

/** Everyone holds with no raise, so the round reaches the dice. */
function toDice(round: CustomRound, r: CustomDiceRules): CustomRound {
  let next = round;
  while (next.phase === 'bet') {
    next = applyBet(next, next.turn!, 0, r).round;
  }
  return next;
}

describe('scoring', () => {
  const r = rules({ count: 5 });
  it('adds, takes the highest, counts, finds sets and runs', () => {
    expect(scoreDice([3, 5, 6], { ...r, score: 'sum' })).toBe(14);
    expect(scoreDice([3, 5, 2], { ...r, score: 'highest' })).toBe(5);
    expect(
      scoreDice([3, 5, 6, 1], { ...r, score: 'count-at-least', threshold: 5 })
    ).toBe(2);
    expect(scoreDice([4, 4, 5, 5, 5], { ...r, score: 'most-alike' })).toBe(305);
    expect(scoreDice([2, 3, 4, 6, 6], { ...r, score: 'straight' })).toBe(3);
  });

  it('lets a wild face fill whatever helps most', () => {
    const w = { ...r, wildFace: 1 };
    expect(scoreDice([1, 5], { ...w, score: 'sum' })).toBe(11);
    expect(scoreDice([1, 4, 4, 2], { ...w, score: 'most-alike' })).toBe(304);
    expect(scoreDice([2, 3, 1, 5, 6], { ...w, score: 'straight' })).toBe(5);
  });

  it('busts on the bust face, even when it is also wild', () => {
    expect(scoreDice([6, 6, 1], { ...r, bustFace: 1 })).toBeNull();
    expect(scoreDice([6, 1], { ...r, bustFace: 1, wildFace: 1 })).toBeNull();
  });

  it('says a score in words', () => {
    expect(scoreWords(305, { score: 'most-alike', threshold: 5 })).toBe(
      'three 5s'
    );
    expect(scoreWords(4, { score: 'straight', threshold: 5 })).toBe(
      'a run of 4'
    );
    expect(scoreWords(null, { score: 'sum', threshold: 5 })).toBe('bust');
  });

  it('wins outright on all top faces or all alike, never in push your luck', () => {
    const r2 = rules({ count: 2, instantWin: 'all-max' });
    expect(isInstantWin([6, 6], r2)).toBe(true);
    expect(isInstantWin([6, 5], r2)).toBe(false);
    const r3 = rules({ count: 3, instantWin: 'all-same', wildFace: 1 });
    expect(isInstantWin([4, 1, 4], r3)).toBe(true);
    expect(
      isInstantWin([6, 6], rules({ turn: 'push', instantWin: 'all-max' }))
    ).toBe(false);
  });
});

describe('the rules a DM sets', () => {
  it('fix only the impossible', () => {
    const push = rules({ turn: 'push', bustFace: 0 });
    expect(push.bustFace).toBe(1);
    expect(rules({ opponent: 'house', winsOn: 'first-to' }).winsOn).toBe(
      'highest'
    );
    expect(rules({ sides: 7 }).sides).toBe(6);
    expect(rules({ sides: 4, wildFace: 6 }).wildFace).toBe(4);
    // Odd is allowed: lowest die, sixes bust.
    expect(
      rules({ score: 'highest', winsOn: 'lowest', bustFace: 6 })
    ).toMatchObject({ score: 'highest', winsOn: 'lowest', bustFace: 6 });
  });

  it('every template normalises to itself', () => {
    for (const t of DICE_TEMPLATES) {
      const r = rules(t.rules);
      for (const [k, v] of Object.entries(t.rules)) {
        expect([t.key, k, r[k as keyof CustomDiceRules]]).toEqual([
          t.key,
          k,
          v,
        ]);
      }
    }
  });
});

describe('a round against each other', () => {
  it('bets, rolls once each, and the highest sum takes the pot', () => {
    const r = rules({ count: 2 });
    let round = toDice(newRound(['a', 'b'], null, r, 'a'), r);
    expect(round.phase).toBe('roll');
    round = applyRoll(round, 'a', r, fixed(3, 4));
    expect(round.turn).toBe('b');
    round = applyRoll(round, 'b', r, fixed(6, 2));
    expect(round.result).toMatchObject({
      how: 'show',
      winners: ['b'],
      scores: { a: 7, b: 8 },
      shares: { b: 200 },
    });
  });

  it('a raise reopens the betting for everyone else', () => {
    const r = rules({});
    let round = newRound(['a', 'b', 'c'], null, r, 'a');
    round = applyBet(round, 'a', 0, r).round;
    round = applyBet(round, 'b', 200, r).round;
    expect(round.pending.sort()).toEqual(['a', 'c']);
  });

  it('hold and reroll keeps the held dice', () => {
    const r = rules({
      count: 3,
      turn: 'hold',
      rerolls: 1,
      score: 'most-alike',
    });
    let round = toDice(newRound(['a', 'b'], null, r, 'a'), r);
    round = applyRoll(round, 'a', r, fixed(5, 2, 5));
    expect(round.turn).toBe('a');
    round = applyRoll(round, 'a', r, fixed(5), [0, 2]);
    expect(round.dice.a).toEqual([5, 5, 5]);
    // Out of rerolls: the turn passes on by itself.
    expect(round.turn).toBe('b');
  });

  it('push your luck banks, or busts and loses the turn', () => {
    const r = rules({ count: 1, turn: 'push', bustFace: 1 });
    let round = toDice(newRound(['a', 'b'], null, r, 'a'), r);
    round = applyRoll(round, 'a', r, fixed(5));
    round = applyRoll(round, 'a', r, fixed(6));
    expect(round.turnTotal.a).toBe(11);
    round = applyStop(round, 'a', r);
    round = applyRoll(round, 'b', r, fixed(6));
    round = applyRoll(round, 'b', r, fixed(1));
    expect(round.busted).toEqual(['b']);
    expect(round.result).toMatchObject({
      winners: ['a'],
      scores: { a: 11, b: null },
    });
  });

  it('first to N carries the points and the pot until somebody gets there', () => {
    const r = rules({ count: 1, turn: 'push', winsOn: 'first-to', target: 10 });
    let round = toDice(newRound(['a', 'b'], null, r, 'a', 0, { a: 6 }), r);
    round = applyRoll(round, 'a', r, fixed(3));
    round = applyStop(round, 'a', r);
    round = applyRoll(round, 'b', r, fixed(4));
    round = applyStop(round, 'b', r);
    expect(round.result).toMatchObject({
      how: 'rollover',
      points: { a: 9, b: 4 },
      carryCp: 200,
      over: false,
    });
    let next = toDice(
      newRound(['a', 'b'], null, r, 'a', 200, round.result!.points),
      r
    );
    next = applyRoll(next, 'a', r, fixed(2));
    next = applyStop(next, 'a', r);
    next = applyRoll(next, 'b', r, fixed(1));
    expect(next.result).toMatchObject({
      winners: ['a'],
      over: true,
      shares: { a: 400 },
    });
  });

  it('closest under the line, and nobody under it rolls the pot over', () => {
    const r = rules({ count: 2, winsOn: 'closest-under', target: 7 });
    let round = toDice(newRound(['a', 'b'], null, r, 'a'), r);
    round = applyRoll(round, 'a', r, fixed(6, 6));
    round = applyRoll(round, 'b', r, fixed(4, 5));
    expect(round.result).toMatchObject({
      how: 'rollover',
      winners: [],
      carryCp: 200,
    });
  });

  it('folding to one seat hands over the pot unrolled', () => {
    const r = rules({});
    const round = applyFold(newRound(['a', 'b'], null, r, 'a'), 'a', r);
    expect(round.result).toMatchObject({ how: 'folds', winners: ['b'] });
  });
});

describe('a round against the house', () => {
  const r = rules({ count: 2, opponent: 'house', odds: 2 });

  it('settles each player alone: a win pays the odds, a tie gives the stake back', () => {
    let round = newRound(['a', 'b', 'c'], 'H', r, 'a');
    expect(round.order).toEqual(['a', 'b', 'c', 'H']);
    round = applyBet(round, 'a', 200, r).round;
    // A raise against the house is your own bet: nobody else must match it.
    expect(round.pending).toEqual(['b', 'c']);
    round = applyBet(round, 'b', 0, r).round;
    round = applyBet(round, 'c', 0, r).round;
    round = applyRoll(round, 'a', r, fixed(6, 5));
    round = applyRoll(round, 'b', r, fixed(4, 4));
    round = applyRoll(round, 'c', r, fixed(1, 2));
    expect(round.turn).toBe('H');
    round = applyRoll(round, 'H', r, fixed(5, 3));
    expect(round.result).toMatchObject({
      how: 'house',
      winners: ['a'],
      shares: { a: 900, b: 100 },
    });
  });

  it('a house bust pays everyone still standing', () => {
    const rb = rules({ count: 1, opponent: 'house', bustFace: 1 });
    let round = toDice(newRound(['a'], 'H', rb, 'a'), rb);
    round = applyRoll(round, 'a', rb, fixed(2));
    round = applyRoll(round, 'H', rb, fixed(1));
    expect(round.result).toMatchObject({ winners: ['a'], shares: { a: 200 } });
  });

  it('the house never folds', () => {
    let round = toDice(newRound(['a'], 'H', r, 'a'), r);
    round = applyRoll(round, 'a', r, fixed(2, 2));
    expect(() => applyFold(round, 'H', r)).toThrow('BAD_MOVE');
  });
});

describe('cups and cheats', () => {
  it('keeps dice under the cups until the show', () => {
    const r = rules({ count: 2, hidden: true });
    let round = toDice(newRound(['a', 'b'], null, r, 'a'), r);
    round = applyRoll(round, 'a', r, fixed(3, 3));
    expect(diceFor(round, r, { seat: 'b', staff: false }).a).toBeNull();
    expect(diceFor(round, r, { seat: 'a', staff: false }).a).toEqual([3, 3]);
    expect(diceFor(round, r, { seat: null, staff: true }).a).toEqual([3, 3]);
    round = applyRoll(round, 'b', r, fixed(2, 2));
    expect(diceFor(round, r, { seat: 'b', staff: false }).a).toEqual([3, 3]);
  });

  it('a palmed die shows the chosen face', () => {
    const r = rules({ count: 2 });
    let round = toDice(newRound(['a', 'b'], null, r, 'a'), r);
    round = applyRoll(round, 'a', r, fixed(2, 3));
    expect(palmDie(round, 'a', 0, 6, r).dice.a).toEqual([6, 3]);
    // Nothing to palm before you have rolled, and no face the die lacks.
    expect(() => palmDie(round, 'b', 0, 6, r)).toThrow('BAD_DIE');
    expect(() => palmDie(round, 'a', 0, 7, r)).toThrow('BAD_DIE');
  });
});
