/**
 * Crowns — the tavern card game, one round as data.
 *
 * An original game for this app. Forty cards in four suits — Coins, Cups,
 * Blades, Staves — ranked one to ten. Each seat is dealt a hand face down,
 * then one card is turned up in the middle: the crown. Its suit is crowned
 * for the round, and a crowned card counts double (or triple, house rules).
 * A pass of betting; then each seat may draw a few more cards or stand; a
 * second pass of betting; then the show. The highest hand at or under the
 * target — 31 unless the house says otherwise — takes the pot. Ties split
 * it, and when every hand is bust the pot rolls over into the next round.
 *
 * Betting is the frame every tavern game shares (`tavern.ts`): raise, hold,
 * or fold. A pass of betting ends when every seat still in has acted since
 * the last raise.
 *
 * Cards are not dice: a deal never lands in Dice. The server shuffles, and
 * the deck order is round state that never leaves it. Pure: no React, no
 * server, no database.
 */
import {
  nextSeat,
  openBetting,
  payIn,
  splitPot,
  type Betting,
  type CrownsRules,
  type SheetMove,
} from './tavern';

export const SUITS = ['coins', 'cups', 'blades', 'staves'] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_LABEL: Record<Suit, string> = {
  coins: 'Coins',
  cups: 'Cups',
  blades: 'Blades',
  staves: 'Staves',
};

export interface Card {
  suit: Suit;
  rank: number;
}

export type CrownsPhase = 'bet1' | 'draw' | 'bet2' | 'show';

export interface CrownsResult {
  how: 'show' | 'folds' | 'rollover';
  /** Who takes a share of the pot. Empty on a rollover. */
  winners: string[];
  /** What each winner takes, copper. */
  shares: Record<string, number>;
  /** Each live hand's total, at the show. Null when it ended on folds. */
  totals: Record<string, number> | null;
  /** The pot carried into the next round on a rollover; zero otherwise. */
  carryCp: number;
}

export interface CrownsRound {
  kind: 'crowns';
  order: string[];
  /** Secret until the show; `handsFor` filters. */
  hands: Record<string, Card[]>;
  /** The rest of the deck, top first. Never leaves the server. */
  deck: Card[];
  crown: Card;
  phase: CrownsPhase;
  folded: string[];
  turn: string | null;
  /** Seats still to act in this pass of betting, or still to draw or stand. */
  pending: string[];
  draws: Record<string, number>;
  betting: Betting;
  used: Record<string, SheetMove[]>;
  result: CrownsResult | null;
}

/** The forty cards, in order. */
export function deck(): Card[] {
  return SUITS.flatMap(suit =>
    Array.from({ length: 10 }, (_, i) => ({ suit, rank: i + 1 }))
  );
}

/**
 * Fisher–Yates with the caller's randomness: `randomInt(n)` returns a whole
 * number in [0, n). The server passes `node:crypto`'s; a test passes a
 * fixed sequence.
 */
export function shuffle<T>(cards: T[], randomInt: (n: number) => number): T[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function cardValue(
  card: Card,
  crown: Suit,
  rules: Pick<CrownsRules, 'crownMultiplier'>
): number {
  return card.suit === crown ? card.rank * rules.crownMultiplier : card.rank;
}

export function handTotal(
  hand: Card[],
  crown: Suit,
  rules: Pick<CrownsRules, 'crownMultiplier'>
): number {
  return hand.reduce((n, c) => n + cardValue(c, crown, rules), 0);
}

export function isBust(
  total: number,
  rules: Pick<CrownsRules, 'target'>
): boolean {
  return total > rules.target;
}

/** Deal a round from a shuffled deck. The crown is turned after the hands. */
export function newRound(
  seats: string[],
  shuffled: Card[],
  rules: CrownsRules,
  starter: string,
  carryCp = 0
): CrownsRound {
  const rest = [...shuffled];
  const hands: Record<string, Card[]> = Object.fromEntries(
    seats.map(s => [s, [] as Card[]])
  );
  for (let i = 0; i < rules.dealt; i++) {
    for (const s of seats) hands[s].push(rest.shift()!);
  }
  const crown = rest.shift()!;
  const start = seats.includes(starter) ? starter : seats[0];
  return {
    kind: 'crowns',
    order: seats,
    hands,
    deck: rest,
    crown,
    phase: 'bet1',
    folded: [],
    turn: start,
    pending: [...seats],
    draws: {},
    betting: openBetting(seats, rules.anteCp, carryCp),
    used: {},
    result: null,
  };
}

export function live(round: CrownsRound): string[] {
  return round.order.filter(s => !round.folded.includes(s));
}

/** The next seat after `from` that still has to act. */
function nextPending(round: CrownsRound, from: string): string | null {
  const skip = round.order.filter(s => !round.pending.includes(s));
  return nextSeat(round.order, from, skip);
}

function mustBeTurn(
  round: CrownsRound,
  seat: string,
  phases: CrownsPhase[]
): void {
  if (round.result) throw new Error('ROUND_OVER');
  if (!phases.includes(round.phase)) throw new Error('WRONG_PHASE');
  if (round.turn !== seat) throw new Error('NOT_YOUR_TURN');
}

/** The show: totals, winners, shares, or a rollover when everyone busts. */
export function showdown(round: CrownsRound, rules: CrownsRules): CrownsResult {
  const seats = live(round);
  const totals = Object.fromEntries(
    seats.map(s => [s, handTotal(round.hands[s], round.crown.suit, rules)])
  );
  const standing = seats.filter(s => !isBust(totals[s], rules));
  if (standing.length === 0) {
    return {
      how: 'rollover',
      winners: [],
      shares: {},
      totals,
      carryCp: round.betting.potCp,
    };
  }
  const best = Math.max(...standing.map(s => totals[s]));
  const winners = standing.filter(s => totals[s] === best);
  return {
    how: 'show',
    winners,
    shares: splitPot(round.betting.potCp, winners),
    totals,
    carryCp: 0,
  };
}

/**
 * Move on once nobody is pending: bet1 → draw (or straight to the show when
 * the house allows no draws) → bet2 → the show.
 */
function advance(round: CrownsRound, rules: CrownsRules): CrownsRound {
  if (round.pending.length > 0) return round;
  const seats = live(round);
  const next: CrownsPhase | 'done' =
    round.phase === 'bet1'
      ? rules.maxDraws > 0
        ? 'draw'
        : 'done'
      : round.phase === 'draw'
        ? 'bet2'
        : 'done';
  if (next === 'done') {
    const done = { ...round, phase: 'show' as const, turn: null };
    return { ...done, result: showdown(done, rules) };
  }
  return { ...round, phase: next, pending: [...seats], turn: seats[0] };
}

function endOnFolds(round: CrownsRound): CrownsRound {
  const [winner] = live(round);
  return {
    ...round,
    turn: null,
    pending: [],
    result: {
      how: 'folds',
      winners: [winner],
      shares: { [winner]: round.betting.potCp },
      totals: null,
      carryCp: 0,
    },
  };
}

/** Hold, raising by `raiseCp` (zero to just hold). A raise reopens the pass. */
export function applyBet(
  round: CrownsRound,
  seat: string,
  raiseCp: number,
  rules: CrownsRules
): { round: CrownsRound; paidCp: number } {
  mustBeTurn(round, seat, ['bet1', 'bet2']);
  if (raiseCp < 0 || raiseCp > rules.raiseCapCp) throw new Error('BAD_RAISE');
  const { betting, paidCp } = payIn(round.betting, seat, raiseCp);
  const pending =
    raiseCp > 0
      ? live(round).filter(s => s !== seat)
      : round.pending.filter(s => s !== seat);
  const moved = { ...round, betting, pending };
  const after = advance(moved, rules);
  if (after !== moved) return { round: after, paidCp };
  return { round: { ...moved, turn: nextPending(moved, seat) }, paidCp };
}

export function applyFold(
  round: CrownsRound,
  seat: string,
  rules: CrownsRules
): CrownsRound {
  mustBeTurn(round, seat, ['bet1', 'draw', 'bet2']);
  const moved = {
    ...round,
    folded: [...round.folded, seat],
    pending: round.pending.filter(s => s !== seat),
  };
  if (live(moved).length === 1) return endOnFolds(moved);
  const after = advance(moved, rules);
  if (after !== moved) return after;
  return { ...moved, turn: nextPending(moved, seat) };
}

function finishDrawing(
  round: CrownsRound,
  seat: string,
  rules: CrownsRules
): CrownsRound {
  const moved = { ...round, pending: round.pending.filter(s => s !== seat) };
  const after = advance(moved, rules);
  if (after !== moved) return after;
  return { ...moved, turn: nextPending(moved, seat) };
}

/** Take the top card. Drawing your last allowed card stands you. */
export function applyDraw(
  round: CrownsRound,
  seat: string,
  rules: CrownsRules
): CrownsRound {
  mustBeTurn(round, seat, ['draw']);
  const drawn = round.draws[seat] ?? 0;
  if (drawn >= rules.maxDraws || round.deck.length === 0) {
    throw new Error('NO_MORE_DRAWS');
  }
  const [card, ...deckRest] = round.deck;
  const next: CrownsRound = {
    ...round,
    deck: deckRest,
    hands: { ...round.hands, [seat]: [...round.hands[seat], card] },
    draws: { ...round.draws, [seat]: drawn + 1 },
  };
  return drawn + 1 >= rules.maxDraws || deckRest.length === 0
    ? finishDrawing(next, seat, rules)
    : next;
}

/**
 * Dealing from the bottom, when it works: look at the top two, keep the one
 * that leaves the better hand, slide the other under the deck. Counts as one
 * draw.
 */
export function applyDrawBest(
  round: CrownsRound,
  seat: string,
  rules: CrownsRules
): CrownsRound {
  mustBeTurn(round, seat, ['draw']);
  const drawn = round.draws[seat] ?? 0;
  if (drawn >= rules.maxDraws || round.deck.length === 0) {
    throw new Error('NO_MORE_DRAWS');
  }
  if (round.deck.length === 1) return applyDraw(round, seat, rules);
  const [a, b, ...rest] = round.deck;
  const score = (c: Card) => {
    const t = handTotal([...round.hands[seat], c], round.crown.suit, rules);
    // At or under the target, higher is better; over it, anything is worse.
    return isBust(t, rules) ? -t : t;
  };
  const [keep, back] = score(a) >= score(b) ? [a, b] : [b, a];
  const next: CrownsRound = {
    ...round,
    deck: [...rest, back],
    hands: { ...round.hands, [seat]: [...round.hands[seat], keep] },
    draws: { ...round.draws, [seat]: drawn + 1 },
  };
  return drawn + 1 >= rules.maxDraws ? finishDrawing(next, seat, rules) : next;
}

export function applyStand(
  round: CrownsRound,
  seat: string,
  rules: CrownsRules
): CrownsRound {
  mustBeTurn(round, seat, ['draw']);
  return finishDrawing(round, seat, rules);
}

/** What a successful read tells you: does that seat hold a crowned card? */
export function holdsCrowned(round: CrownsRound, seat: string): boolean {
  return (round.hands[seat] ?? []).some(c => c.suit === round.crown.suit);
}

/** The hands a viewer may see: their own, or every live one at the show. */
export function handsFor(
  round: CrownsRound,
  viewer: { seat: string | null; staff: boolean }
): Record<string, Card[] | null> {
  const shown = round.result !== null && round.result.how !== 'folds';
  return Object.fromEntries(
    round.order.map(s => [
      s,
      viewer.staff || s === viewer.seat || (shown && !round.folded.includes(s))
        ? round.hands[s]
        : null,
    ])
  );
}
