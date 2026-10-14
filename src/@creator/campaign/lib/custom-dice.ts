/**
 * A dice game of the house's own rules — one round, as data.
 *
 * The DM picks the parts (`CustomDiceRules` in `tavern.ts`): how many dice
 * of what, how a turn goes, how a roll scores, what wins, and whether the
 * seats play each other for the pot or the house at odds. This plays any
 * combination of them. Odd ones included: "lowest die, but sixes bust" is a
 * real house's real game.
 *
 * A round is a pass of betting, then each seat's turn at the dice in seat
 * order (the house last), then the show. Against each other the pot goes to
 * the best score, ties split, and nobody winning rolls it over. Against the
 * house each player is settled alone: a win pays the odds, a tie gives the
 * stake back, a loss is the house's.
 *
 * Every function takes a round and returns a new one; nothing mutates. The
 * server rolls the dice — the roller is passed in — and moves the coin.
 * Pure: no React, no server, no database.
 */
import {
  nextSeat,
  openBetting,
  payIn,
  splitPot,
  type Betting,
  type CustomDiceRules,
  type SheetMove,
} from './tavern';

export type CustomPhase = 'bet' | 'roll' | 'show';

export interface CustomResult {
  /** `house`: settled seat by seat against the house. */
  how: 'show' | 'folds' | 'rollover' | 'house';
  winners: string[];
  /** Copper each seat takes back: a share of the pot, or a payout with the stake. */
  shares: Record<string, number>;
  /** Each seat's score; null is bust (or folded). */
  scores: Record<string, number | null>;
  /** Seats that won outright. */
  instant: string[];
  /** The pot carried into the next round. */
  carryCp: number;
  /** First to N: the running totals after this round. */
  points: Record<string, number> | null;
  /** First to N: somebody got there, and the game is over. */
  over: boolean;
}

export interface CustomRound {
  kind: 'custom-dice';
  /** Players in seat order, then the house last when there is one. */
  order: string[];
  house: string | null;
  phase: CustomPhase;
  folded: string[];
  turn: string | null;
  /** Still to bet, or still to take their turn at the dice. */
  pending: string[];
  betting: Betting;
  /** Each seat's dice as they lie now. */
  dice: Record<string, number[]>;
  /** Rolls taken this turn, the first roll included. */
  rolls: Record<string, number>;
  /** Push your luck: points this turn so far. */
  turnTotal: Record<string, number>;
  busted: string[];
  /** First to N: the running totals coming into this round. */
  points: Record<string, number> | null;
  used: Record<string, SheetMove[]>;
  result: CustomResult | null;
}

/** A push-your-luck turn stops itself here, so a hot streak still ends. */
export const PUSH_LIMIT = 30;

/* --- scoring ------------------------------------------------------------- */

/**
 * What a handful of dice scores, or null for a bust. A wild face counts as
 * whatever helps most: the top face in a sum, a member of the biggest set,
 * the gap in a straight. "Most alike" scores count × 100 + face, so three 5s
 * beat three 4s; `scoreWords` turns that back into words.
 */
export function scoreDice(
  dice: number[],
  rules: Pick<
    CustomDiceRules,
    'score' | 'sides' | 'threshold' | 'bustFace' | 'wildFace'
  >
): number | null {
  if (dice.length === 0) return null;
  if (rules.bustFace && dice.includes(rules.bustFace)) return null;
  const wild = rules.wildFace
    ? dice.filter(d => d === rules.wildFace).length
    : 0;
  const rest = rules.wildFace ? dice.filter(d => d !== rules.wildFace) : dice;
  switch (rules.score) {
    case 'sum':
      return rest.reduce((n, d) => n + d, 0) + wild * rules.sides;
    case 'highest':
      return wild > 0 || rest.length === 0 ? rules.sides : Math.max(...rest);
    case 'count-at-least':
      return rest.filter(d => d >= rules.threshold).length + wild;
    case 'most-alike': {
      let best = wild * 100 + rules.sides;
      for (let f = 1; f <= rules.sides; f++) {
        const n = rest.filter(d => d === f).length;
        if (n === 0) continue;
        best = Math.max(best, (n + wild) * 100 + f);
      }
      return best;
    }
    case 'straight': {
      const have = new Set(rest);
      let best = Math.min(dice.length, wild);
      for (let start = 1; start <= rules.sides; start++) {
        let spare = wild;
        let len = 0;
        for (let f = start; f <= rules.sides; f++) {
          if (have.has(f)) len++;
          else if (spare > 0) {
            spare--;
            len++;
          } else break;
        }
        best = Math.max(best, Math.min(len, dice.length));
      }
      return best;
    }
  }
}

/** A score in words, for the slip and the show: "three 5s", "a run of 4". */
export function scoreWords(
  score: number | null,
  rules: Pick<CustomDiceRules, 'score' | 'threshold'>
): string {
  if (score === null) return 'bust';
  if (rules.score === 'most-alike') {
    const n = Math.floor(score / 100);
    const face = score % 100;
    const words = [
      'none',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
    ];
    return `${words[n] ?? n} ${face}${n === 1 ? '' : 's'}`;
  }
  if (rules.score === 'straight') return `a run of ${score}`;
  if (rules.score === 'count-at-least') {
    return `${score} at ${rules.threshold}+`;
  }
  return String(score);
}

/** Every die at its top face, or every die alike — wilds join either. */
export function isInstantWin(
  dice: number[],
  rules: Pick<
    CustomDiceRules,
    'instantWin' | 'sides' | 'wildFace' | 'bustFace' | 'turn'
  >
): boolean {
  if (rules.instantWin === 'none' || rules.turn === 'push') return false;
  if (dice.length === 0) return false;
  if (rules.bustFace && dice.includes(rules.bustFace)) return false;
  const rest = rules.wildFace ? dice.filter(d => d !== rules.wildFace) : dice;
  if (rules.instantWin === 'all-max') return rest.every(d => d === rules.sides);
  return dice.length > 1 && rest.every(d => d === rest[0]);
}

/** Does score `a` beat score `b` under these rules? Both already valid. */
function beats(a: number, b: number, rules: CustomDiceRules): boolean {
  switch (rules.winsOn) {
    case 'lowest':
      return a < b;
    case 'exact':
      return a === rules.target && b !== rules.target;
    default:
      return a > b;
  }
}

/** A score that can win at all: under the line, on the number, not bust. */
function counts(score: number | null, rules: CustomDiceRules): score is number {
  if (score === null) return false;
  if (rules.winsOn === 'closest-under') return score <= rules.target;
  if (rules.winsOn === 'exact') return score === rules.target;
  return true;
}

/** A seat's score as it stands: the turn's points, or the dice on the table. */
export function currentScore(
  round: CustomRound,
  seat: string,
  rules: CustomDiceRules
): number | null | undefined {
  if (!(round.rolls[seat] ?? 0)) return undefined;
  if (round.busted.includes(seat)) return null;
  if (rules.turn === 'push') return round.turnTotal[seat] ?? 0;
  return scoreDice(round.dice[seat] ?? [], rules);
}

/* --- a round ------------------------------------------------------------- */

export function newRound(
  players: string[],
  house: string | null,
  rules: CustomDiceRules,
  starter: string,
  carryCp = 0,
  points: Record<string, number> | null = null
): CustomRound {
  // Rotate so the starter goes first; the house always goes last.
  const at = Math.max(0, players.indexOf(starter));
  const turnOrder = [...players.slice(at), ...players.slice(0, at)];
  const order = house ? [...turnOrder, house] : turnOrder;
  return {
    kind: 'custom-dice',
    order,
    house,
    phase: 'bet',
    folded: [],
    turn: turnOrder[0] ?? null,
    pending: [...turnOrder],
    betting: openBetting(turnOrder, rules.anteCp, carryCp),
    dice: {},
    rolls: {},
    turnTotal: {},
    busted: [],
    points: rules.winsOn === 'first-to' ? { ...(points ?? {}) } : null,
    used: {},
    result: null,
  };
}

export function live(round: CustomRound): string[] {
  return round.order.filter(s => !round.folded.includes(s));
}

function players(round: CustomRound): string[] {
  return round.order.filter(s => s !== round.house);
}

function mustBeTurn(
  round: CustomRound,
  seat: string,
  phase: CustomPhase
): void {
  if (round.result) throw new Error('ROUND_OVER');
  if (round.phase !== phase) throw new Error('WRONG_PHASE');
  if (round.turn !== seat) throw new Error('NOT_YOUR_TURN');
}

function nextPending(round: CustomRound, from: string): string | null {
  const skip = round.order.filter(s => !round.pending.includes(s));
  return nextSeat(round.order, from, skip);
}

/** Bets are in: everyone still in takes their turn at the dice, house last. */
function startRolling(round: CustomRound): CustomRound {
  const pending = live(round);
  return { ...round, phase: 'roll', pending, turn: pending[0] ?? null };
}

/**
 * One seat's bet. Against each other it is a hold and a raise, and a raise
 * reopens the pass (the Crowns pass). Against the house each player sets
 * their own bet — the ante, plus a raise if they like — and nobody else
 * has to match it.
 */
export function applyBet(
  round: CustomRound,
  seat: string,
  raiseCp: number,
  rules: CustomDiceRules
): { round: CustomRound; paidCp: number } {
  mustBeTurn(round, seat, 'bet');
  if (raiseCp < 0 || raiseCp > rules.raiseCapCp) throw new Error('BAD_RAISE');
  let betting: Betting;
  let paidCp: number;
  let pending: string[];
  if (round.house) {
    const raise = Math.trunc(raiseCp);
    betting = {
      ...round.betting,
      inCp: {
        ...round.betting.inCp,
        [seat]: (round.betting.inCp[seat] ?? 0) + raise,
      },
      potCp: round.betting.potCp + raise,
    };
    paidCp = raise;
    pending = round.pending.filter(s => s !== seat);
  } else {
    ({ betting, paidCp } = payIn(round.betting, seat, raiseCp));
    pending =
      raiseCp > 0
        ? players(round).filter(s => s !== seat && !round.folded.includes(s))
        : round.pending.filter(s => s !== seat);
  }
  const moved = { ...round, betting, pending };
  if (pending.length === 0) return { round: startRolling(moved), paidCp };
  return { round: { ...moved, turn: nextPending(moved, seat) }, paidCp };
}

/** Out of the round, the stake left where it lies. */
export function applyFold(
  round: CustomRound,
  seat: string,
  rules: CustomDiceRules
): CustomRound {
  if (round.result) throw new Error('ROUND_OVER');
  if (round.turn !== seat) throw new Error('NOT_YOUR_TURN');
  if (seat === round.house) throw new Error('BAD_MOVE');
  const moved: CustomRound = {
    ...round,
    folded: [...round.folded, seat],
    pending: round.pending.filter(s => s !== seat),
  };
  const standing = players(moved).filter(s => !moved.folded.includes(s));
  if (!round.house && standing.length === 1) {
    return {
      ...moved,
      turn: null,
      pending: [],
      phase: 'show',
      result: {
        how: 'folds',
        winners: standing,
        shares: { [standing[0]]: round.betting.potCp },
        scores: {},
        instant: [],
        carryCp: 0,
        points: null,
        over: false,
      },
    };
  }
  if (round.house && standing.length === 0) {
    return showdown(moved, rules);
  }
  if (moved.pending.length === 0) {
    return moved.phase === 'bet'
      ? startRolling(moved)
      : finishRound(moved, rules);
  }
  return { ...moved, turn: nextPending(moved, seat) };
}

/** The next seat to roll, or the show when nobody is left. */
function finishTurn(
  round: CustomRound,
  seat: string,
  rules: CustomDiceRules
): CustomRound {
  const moved = { ...round, pending: round.pending.filter(s => s !== seat) };
  if (moved.pending.length === 0) return finishRound(moved, rules);
  return { ...moved, turn: nextPending(moved, seat) };
}

function finishRound(round: CustomRound, rules: CustomDiceRules): CustomRound {
  return showdown(round, rules);
}

/**
 * Roll. The first roll throws every die; a reroll keeps the dice at the
 * `hold` indexes and throws the rest; push your luck throws them all again
 * and adds the roll to the turn, or busts it. `roll(n, sides)` is the
 * server's dice.
 */
export function applyRoll(
  round: CustomRound,
  seat: string,
  rules: CustomDiceRules,
  roll: (n: number, sides: number) => number[],
  hold: number[] = []
): CustomRound {
  mustBeTurn(round, seat, 'roll');
  const taken = round.rolls[seat] ?? 0;
  const allowed =
    rules.turn === 'one-roll'
      ? 1
      : rules.turn === 'hold'
        ? 1 + rules.rerolls
        : PUSH_LIMIT;
  if (taken >= allowed) throw new Error('NO_MORE_ROLLS');

  let dice: number[];
  if (rules.turn === 'hold' && taken > 0) {
    const prev = round.dice[seat] ?? [];
    const keep = [...new Set(hold)].filter(
      i => Number.isInteger(i) && i >= 0 && i < prev.length
    );
    const kept = keep.sort((a, b) => a - b).map(i => prev[i]);
    dice = [...kept, ...roll(rules.count - kept.length, rules.sides)];
  } else {
    dice = roll(rules.count, rules.sides);
  }

  let next: CustomRound = {
    ...round,
    dice: { ...round.dice, [seat]: dice },
    rolls: { ...round.rolls, [seat]: taken + 1 },
  };

  if (rules.turn === 'push') {
    if (rules.bustFace && dice.includes(rules.bustFace)) {
      next = {
        ...next,
        busted: [...next.busted, seat],
        turnTotal: { ...next.turnTotal, [seat]: 0 },
      };
      return finishTurn(next, seat, rules);
    }
    const gained = scoreDice(dice, { ...rules, bustFace: 0 }) ?? 0;
    next = {
      ...next,
      turnTotal: {
        ...next.turnTotal,
        [seat]: (next.turnTotal[seat] ?? 0) + gained,
      },
    };
    return taken + 1 >= allowed ? finishTurn(next, seat, rules) : next;
  }
  return taken + 1 >= allowed ? finishTurn(next, seat, rules) : next;
}

/** Stop rolling: bank a push-your-luck turn, or stand on these dice. */
export function applyStop(
  round: CustomRound,
  seat: string,
  rules: CustomDiceRules
): CustomRound {
  mustBeTurn(round, seat, 'roll');
  if (!(round.rolls[seat] ?? 0)) throw new Error('ROLL_FIRST');
  return finishTurn(round, seat, rules);
}

/** Palm a die: one of your dice shows the face you choose. */
export function palmDie(
  round: CustomRound,
  seat: string,
  index: number,
  face: number,
  rules: Pick<CustomDiceRules, 'sides'>
): CustomRound {
  const dice = round.dice[seat];
  if (!dice || !Number.isInteger(index) || index < 0 || index >= dice.length) {
    throw new Error('BAD_DIE');
  }
  if (!Number.isInteger(face) || face < 1 || face > rules.sides) {
    throw new Error('BAD_DIE');
  }
  const next = [...dice];
  next[index] = face;
  return { ...round, dice: { ...round.dice, [seat]: next } };
}

/* --- the show ------------------------------------------------------------ */

/**
 * Settle a round whose dice are all thrown. A first-to-N game adds this
 * round's scores to the running points, and the result carries them on.
 */
export function showdown(
  round: CustomRound,
  rules: CustomDiceRules
): CustomRound {
  const points = round.points;
  const scores: Record<string, number | null> = {};
  const instant: string[] = [];
  for (const s of round.order) {
    if (round.folded.includes(s)) {
      scores[s] = null;
      continue;
    }
    scores[s] = currentScore(round, s, rules) ?? null;
    if (isInstantWin(round.dice[s] ?? [], rules)) instant.push(s);
  }
  const pot = round.betting.potCp;
  const base = { scores, instant, points: null, over: false } as const;

  if (round.house) {
    const house = round.house;
    const hs = scores[house];
    const houseInstant = instant.includes(house);
    const shares: Record<string, number> = {};
    const winners: string[] = [];
    for (const p of players(round)) {
      const bet = round.betting.inCp[p] ?? 0;
      if (round.folded.includes(p)) continue;
      const ps = scores[p];
      const pi = instant.includes(p);
      let outcome: 'win' | 'push' | 'lose';
      if (pi || houseInstant) {
        outcome = pi && houseInstant ? 'push' : pi ? 'win' : 'lose';
      } else if (rules.winsOn === 'exact') {
        const pHit = ps === rules.target;
        const hHit = hs === rules.target;
        outcome = pHit === hHit ? 'push' : pHit ? 'win' : 'lose';
      } else if (!counts(ps, rules)) {
        outcome = 'lose';
      } else if (!counts(hs, rules)) {
        outcome = 'win';
      } else if (ps === hs) {
        outcome = 'push';
      } else {
        outcome = beats(ps, hs, rules) ? 'win' : 'lose';
      }
      if (outcome === 'win') {
        winners.push(p);
        shares[p] = bet * (rules.odds + 1);
      } else if (outcome === 'push') {
        shares[p] = bet;
      }
    }
    return {
      ...round,
      phase: 'show',
      turn: null,
      pending: [],
      result: { ...base, how: 'house', winners, shares, carryCp: 0 },
    };
  }

  const seats = players(round).filter(s => !round.folded.includes(s));
  let winners: string[];
  let nextPoints: Record<string, number> | null = null;
  let over = false;

  if (instant.length > 0) {
    winners = instant;
  } else if (rules.winsOn === 'first-to') {
    nextPoints = { ...(points ?? {}) };
    for (const s of seats)
      nextPoints[s] = (nextPoints[s] ?? 0) + (scores[s] ?? 0);
    const there = seats.filter(s => (nextPoints![s] ?? 0) >= rules.target);
    if (there.length > 0) {
      const best = Math.max(...there.map(s => nextPoints![s]));
      winners = there.filter(s => nextPoints![s] === best);
      over = true;
    } else {
      winners = [];
    }
  } else {
    const valid = seats.filter(s => counts(scores[s], rules));
    if (valid.length === 0) winners = [];
    else {
      const best = valid.reduce((b, s) =>
        beats(scores[s]!, scores[b]!, rules) ? s : b
      );
      winners = valid.filter(s => scores[s] === scores[best]);
    }
  }

  if (winners.length === 0) {
    return {
      ...round,
      phase: 'show',
      turn: null,
      pending: [],
      result: {
        ...base,
        how: 'rollover',
        winners: [],
        shares: {},
        carryCp: pot,
        points: nextPoints,
      },
    };
  }
  return {
    ...round,
    phase: 'show',
    turn: null,
    pending: [],
    result: {
      ...base,
      how: 'show',
      winners,
      shares: splitPot(pot, winners),
      carryCp: 0,
      points: nextPoints,
      over,
    },
  };
}

/** The dice a viewer may see: under cups, their own until the show. */
export function diceFor(
  round: CustomRound,
  rules: Pick<CustomDiceRules, 'hidden'>,
  viewer: { seat: string | null; staff: boolean }
): Record<string, number[] | null> {
  const open = !rules.hidden || round.result !== null;
  return Object.fromEntries(
    round.order.map(s => [
      s,
      round.dice[s] && (open || viewer.staff || s === viewer.seat)
        ? round.dice[s]
        : null,
    ])
  );
}

/**
 * What a successful read tells you: is that seat ahead of you as the dice
 * stand? A bust is never ahead; first to N counts the running points too.
 */
export function isAhead(
  round: CustomRound,
  them: string,
  you: string,
  rules: CustomDiceRules
): boolean {
  const theirs = currentScore(round, them, rules) ?? null;
  const yours = currentScore(round, you, rules) ?? null;
  if (rules.winsOn === 'first-to') {
    const total = (s: string, score: number | null) =>
      (round.points?.[s] ?? 0) + (score ?? 0);
    return total(them, theirs) > total(you, yours);
  }
  if (!counts(theirs, rules)) return false;
  if (!counts(yours, rules)) return true;
  return beats(theirs, yours, rules);
}
