/**
 * Liar's dice — one round, as data.
 *
 * The public-domain dudo family: every seat shakes a cup of dice and looks
 * only at its own, then the seats take turns bidding how many of one face
 * are under all the cups together. Each bid must beat the last — more dice,
 * or as many of a higher face — until somebody calls "Liar!" and the cups
 * come up. Bluffing is bidding what you do not hold; there is no button for
 * it because there is nothing else to press.
 *
 * Money rides on top (`tavern.ts`): a bid may raise the stake, bidding or
 * calling holds whatever a raise left owing, and folding leaves the round
 * with your stake still in the pot — and your cup still on the table, still
 * counted when the cups come up.
 *
 * Every function here takes a round and returns a new one; nothing mutates.
 * The server rolls the cups and moves the coin; this decides what is legal
 * and who won. Pure: no React, no server, no database.
 */
import {
  nextSeat,
  openBetting,
  payIn,
  type Betting,
  type LiarsDiceRules,
  type SheetMove,
} from './tavern';

export interface Bid {
  count: number;
  face: number;
  by: string;
}

export interface LiarsDiceResult {
  /** How the round ended: a call, a spot-on call, or everybody else folding. */
  how: 'liar' | 'spot-on' | 'folds';
  caller: string | null;
  bid: Bid | null;
  /** How many of the bid's face were under the cups, wild ones included. */
  counted: number | null;
  /** Takes the pot. */
  winner: string;
  /** Sets a die aside. Null when nobody does (folds, or a spot-on that was right). */
  loser: string | null;
}

export interface LiarsDiceRound {
  kind: 'liars-dice';
  /** Seats in this round, in seat order. */
  order: string[];
  /** Every cup, by seat. Secret until the round ends; `cupsFor` filters. */
  cups: Record<string, number[]>;
  folded: string[];
  /** Whose turn it is; null once the round is over. */
  turn: string | null;
  bid: Bid | null;
  betting: Betting;
  /** What each seat has done off its sheet this round. Once each. */
  used: Record<string, SheetMove[]>;
  result: LiarsDiceResult | null;
}

/** Faces a bid may name: two to six when ones are wild, else one to six. */
export function lowestFace(rules: Pick<LiarsDiceRules, 'onesWild'>): number {
  return rules.onesWild ? 2 : 1;
}

/**
 * Open a round. `seats` are the seats that anted, in seat order; `starter`
 * bids first; `rollCup` rolls a cup of that many dice (the server's dice,
 * never the browser's).
 */
export function newRound(
  seats: string[],
  diceLeft: Record<string, number>,
  rules: LiarsDiceRules,
  starter: string,
  rollCup: (dice: number) => number[]
): LiarsDiceRound {
  const cups = Object.fromEntries(
    seats.map(s => [s, rollCup(diceLeft[s] ?? rules.dicePerCup)])
  );
  return {
    kind: 'liars-dice',
    order: seats,
    cups,
    folded: [],
    turn: seats.includes(starter) ? starter : seats[0],
    bid: null,
    betting: openBetting(seats, rules.anteCp),
    used: {},
    result: null,
  };
}

/** Every die on the table, folded cups included. */
export function diceOut(round: LiarsDiceRound): number {
  return Object.values(round.cups).reduce((n, cup) => n + cup.length, 0);
}

/** How many dice show `face`, ones counting when they are wild. */
export function countFace(
  cups: number[][],
  face: number,
  onesWild: boolean
): number {
  let n = 0;
  for (const cup of cups) {
    for (const die of cup) {
      if (die === face || (onesWild && die === 1 && face !== 1)) n++;
    }
  }
  return n;
}

/**
 * Whether `next` beats `prev`: more dice, or as many of a higher face. The
 * first bid of a round beats nothing, but must still name a real face and
 * no more dice than are out.
 */
export function beats(
  prev: Pick<Bid, 'count' | 'face'> | null,
  next: Pick<Bid, 'count' | 'face'>,
  totalDice: number,
  rules: Pick<LiarsDiceRules, 'onesWild'>
): boolean {
  if (!Number.isInteger(next.count) || !Number.isInteger(next.face)) {
    return false;
  }
  if (next.face < lowestFace(rules) || next.face > 6) return false;
  if (next.count < 1 || next.count > totalDice) return false;
  if (!prev) return true;
  return (
    next.count > prev.count ||
    (next.count === prev.count && next.face > prev.face)
  );
}

/** The smallest bid that beats `prev`, for the picker's starting value. */
export function nextBid(
  prev: Pick<Bid, 'count' | 'face'> | null,
  rules: Pick<LiarsDiceRules, 'onesWild'>
): { count: number; face: number } {
  if (!prev) return { count: 1, face: lowestFace(rules) };
  if (prev.face < 6) return { count: prev.count, face: prev.face + 1 };
  return { count: prev.count + 1, face: lowestFace(rules) };
}

export function live(round: LiarsDiceRound): string[] {
  return round.order.filter(s => !round.folded.includes(s));
}

function mustBeTurn(round: LiarsDiceRound, seat: string): void {
  if (round.result) throw new Error('ROUND_OVER');
  if (round.turn !== seat) throw new Error('NOT_YOUR_TURN');
}

/** A bid, holding and optionally raising. Returns what the seat paid. */
export function applyBid(
  round: LiarsDiceRound,
  seat: string,
  bid: { count: number; face: number },
  raiseCp: number,
  rules: LiarsDiceRules
): { round: LiarsDiceRound; paidCp: number } {
  mustBeTurn(round, seat);
  if (!beats(round.bid, bid, diceOut(round), rules)) {
    throw new Error('BID_TOO_LOW');
  }
  if (raiseCp < 0 || raiseCp > rules.raiseCapCp) throw new Error('BAD_RAISE');
  const { betting, paidCp } = payIn(round.betting, seat, raiseCp);
  return {
    round: {
      ...round,
      bid: { count: bid.count, face: bid.face, by: seat },
      betting,
      turn: nextSeat(round.order, seat, round.folded),
    },
    paidCp,
  };
}

function mustHaveBid(round: LiarsDiceRound, seat: string): Bid {
  if (!round.bid) throw new Error('NO_BID');
  if (round.bid.by === seat) throw new Error('OWN_BID');
  return round.bid;
}

/** "Liar!": the cups come up. Holding first. */
export function applyCall(
  round: LiarsDiceRound,
  seat: string,
  rules: LiarsDiceRules
): { round: LiarsDiceRound; paidCp: number } {
  mustBeTurn(round, seat);
  const bid = mustHaveBid(round, seat);
  const { betting, paidCp } = payIn(round.betting, seat, 0);
  const counted = countFace(
    Object.values(round.cups),
    bid.face,
    rules.onesWild
  );
  const stood = counted >= bid.count;
  return {
    round: {
      ...round,
      betting,
      turn: null,
      result: {
        how: 'liar',
        caller: seat,
        bid,
        counted,
        winner: stood ? bid.by : seat,
        loser: stood ? seat : bid.by,
      },
    },
    paidCp,
  };
}

/**
 * "Spot on": the last bid is exactly right. Right, and the caller takes the
 * pot and nobody loses a die; wrong, and the caller sets a die aside and the
 * bidder takes the pot.
 */
export function applySpotOn(
  round: LiarsDiceRound,
  seat: string,
  rules: LiarsDiceRules
): { round: LiarsDiceRound; paidCp: number } {
  if (!rules.spotOn) throw new Error('NO_SPOT_ON');
  mustBeTurn(round, seat);
  const bid = mustHaveBid(round, seat);
  const { betting, paidCp } = payIn(round.betting, seat, 0);
  const counted = countFace(
    Object.values(round.cups),
    bid.face,
    rules.onesWild
  );
  const exact = counted === bid.count;
  return {
    round: {
      ...round,
      betting,
      turn: null,
      result: {
        how: 'spot-on',
        caller: seat,
        bid,
        counted,
        winner: exact ? seat : bid.by,
        loser: exact ? null : seat,
      },
    },
    paidCp,
  };
}

/** Out of the round. The stake stays in the pot; the cup stays on the table. */
export function applyFold(round: LiarsDiceRound, seat: string): LiarsDiceRound {
  mustBeTurn(round, seat);
  const folded = [...round.folded, seat];
  const left = round.order.filter(s => !folded.includes(s));
  if (left.length === 1) {
    return {
      ...round,
      folded,
      turn: null,
      result: {
        how: 'folds',
        caller: null,
        bid: round.bid,
        counted: null,
        winner: left[0],
        loser: null,
      },
    };
  }
  return { ...round, folded, turn: nextSeat(round.order, seat, folded) };
}

/** Set one of your own dice to a face: the cheat, when it works. */
export function palmDie(
  round: LiarsDiceRound,
  seat: string,
  index: number,
  face: number
): LiarsDiceRound {
  const cup = round.cups[seat];
  if (!cup || !Number.isInteger(index) || index < 0 || index >= cup.length) {
    throw new Error('BAD_DIE');
  }
  if (!Number.isInteger(face) || face < 1 || face > 6)
    throw new Error('BAD_DIE');
  const next = [...cup];
  next[index] = face;
  return { ...round, cups: { ...round.cups, [seat]: next } };
}

/** What a successful read tells you: does the bidder hold the face they bid? */
export function holdsFace(
  round: LiarsDiceRound,
  seat: string,
  face: number,
  onesWild: boolean
): boolean {
  return countFace([round.cups[seat] ?? []], face, onesWild) > 0;
}

/**
 * Dice left after a round: the loser sets one aside. A seat at zero is out
 * of the game.
 */
export function diceAfter(
  diceLeft: Record<string, number>,
  result: LiarsDiceResult
): Record<string, number> {
  if (!result.loser) return diceLeft;
  return {
    ...diceLeft,
    [result.loser]: Math.max(0, (diceLeft[result.loser] ?? 0) - 1),
  };
}

/**
 * Who opens the next round: the loser of the call, if they still have dice,
 * otherwise the winner — the way the dudo family plays it, so losing at
 * least buys you the first bid.
 */
export function nextStarter(
  diceLeft: Record<string, number>,
  result: LiarsDiceResult
): string {
  if (result.loser && (diceLeft[result.loser] ?? 0) > 0) return result.loser;
  return result.winner;
}

/** The cups a viewer may see: their own, or every one once the round is over. */
export function cupsFor(
  round: LiarsDiceRound,
  viewer: { seat: string | null; staff: boolean }
): Record<string, number[] | null> {
  const open = round.result !== null && round.result.how !== 'folds';
  return Object.fromEntries(
    round.order.map(s => [
      s,
      open || viewer.staff || s === viewer.seat ? round.cups[s] : null,
    ])
  );
}
