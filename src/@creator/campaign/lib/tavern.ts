/**
 * Tavern games — the vocabulary and the rules every game shares.
 *
 * A tavern game is a gambling game played at the table, round by round, for
 * real coin: liar's dice, or Crowns, the card game. Both share one frame —
 * seats, an ante, a stake that can rise, a pot each round, and reads and
 * cheats off the sheet — and differ only in the middle of a round, which is
 * `liars-dice.ts` and `crowns.ts`.
 *
 * A **house game** is a DM's own named rules for one of the two: "Brannoc's
 * Bones" is liar's dice with six dice a cup, no wild ones and a 2 gp ante.
 * Every setting is one the engine already understands, so a house game is
 * data, never a rules language.
 *
 * "Tavern game", never "game" alone: in this app's copy "this game" is the
 * campaign (`docs/naming.md`).
 *
 * Pure: no React, no server, no database.
 */
import { cpWords } from '@/@creator/character/lib/coins';

export const TAVERN_KINDS = ['liars-dice', 'crowns'] as const;
export type TavernKind = (typeof TAVERN_KINDS)[number];

export function isTavernKind(value: unknown): value is TavernKind {
  return (TAVERN_KINDS as readonly unknown[]).includes(value);
}

export const TAVERN_KIND_LABEL: Record<TavernKind, string> = {
  'liars-dice': 'Liar’s dice',
  crowns: 'Crowns',
};

/** A tavern game needs somebody to lose to, and a back room has six chairs. */
export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

export const MAX_NAME = 80;
export const MAX_BLURB = 600;

/* --- the rules a DM can set ---------------------------------------------- */

/** What every tavern game is played for. Copper, like every price here. */
export interface StakeRules {
  /** Paid into the pot by every seat at the start of each round. */
  anteCp: number;
  /** The most one raise may add to the stake. Zero: nobody raises. */
  raiseCapCp: number;
}

export interface LiarsDiceRules extends StakeRules {
  /** Dice in each cup at the start of the game. */
  dicePerCup: number;
  /** Ones count as any face, and nobody bids on ones. */
  onesWild: boolean;
  /** "Spot on" may be called instead of "Liar!". */
  spotOn: boolean;
}

export interface CrownsRules extends StakeRules {
  /** The best hand is the highest at or under this. */
  target: number;
  /** What a crowned card counts for: twice its rank, or three times. */
  crownMultiplier: number;
  /** Cards dealt to each seat. */
  dealt: number;
  /** Cards a seat may draw after the first pass of betting. */
  maxDraws: number;
}

export interface RulesFor {
  'liars-dice': LiarsDiceRules;
  crowns: CrownsRules;
}

export type TavernRules = LiarsDiceRules | CrownsRules;

export const DEFAULT_RULES: RulesFor = {
  'liars-dice': {
    anteCp: 100,
    raiseCapCp: 500,
    dicePerCup: 5,
    onesWild: true,
    spotOn: false,
  },
  crowns: {
    anteCp: 100,
    raiseCapCp: 500,
    target: 31,
    crownMultiplier: 2,
    dealt: 2,
    maxDraws: 2,
  },
};

/** The limits, so the form and the server agree on them. */
export const RULE_LIMITS = {
  anteCp: { min: 0, max: 100_000 },
  raiseCapCp: { min: 0, max: 100_000 },
  dicePerCup: { min: 3, max: 6 },
  target: { min: 21, max: 41 },
  crownMultiplier: { min: 2, max: 3 },
  dealt: { min: 2, max: 3 },
  maxDraws: { min: 0, max: 3 },
} as const;

function clampInt(
  raw: unknown,
  { min, max }: { min: number; max: number },
  fallback: number
): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

/**
 * Whatever came in, as rules the engine can play by.
 *
 * Each field degrades on its own — a nonsense dice count costs you the dice
 * count, not the house game — for the same reason every content leaf carries
 * `.catch()` (content-model rule 4).
 */
export function normalizeRules<K extends TavernKind>(
  kind: K,
  raw: unknown
): RulesFor[K] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const stake = (d: StakeRules): StakeRules => ({
    anteCp: clampInt(r.anteCp, RULE_LIMITS.anteCp, d.anteCp),
    raiseCapCp: clampInt(r.raiseCapCp, RULE_LIMITS.raiseCapCp, d.raiseCapCp),
  });
  if (kind === 'liars-dice') {
    const d = DEFAULT_RULES['liars-dice'];
    return {
      ...stake(d),
      dicePerCup: clampInt(r.dicePerCup, RULE_LIMITS.dicePerCup, d.dicePerCup),
      onesWild: bool(r.onesWild, d.onesWild),
      spotOn: bool(r.spotOn, d.spotOn),
    } as RulesFor[K];
  }
  const d = DEFAULT_RULES.crowns;
  return {
    ...stake(d),
    target: clampInt(r.target, RULE_LIMITS.target, d.target),
    crownMultiplier: clampInt(
      r.crownMultiplier,
      RULE_LIMITS.crownMultiplier,
      d.crownMultiplier
    ),
    dealt: clampInt(r.dealt, RULE_LIMITS.dealt, d.dealt),
    maxDraws: clampInt(r.maxDraws, RULE_LIMITS.maxDraws, d.maxDraws),
  } as RulesFor[K];
}

/**
 * How it is played, in sentences a player reads before sitting down.
 *
 * Composed from the rules rather than written by the DM, so the words can
 * never disagree with what the server enforces. The DM's own description of
 * a house game sits above these, never in place of them.
 */
export function rulesLines(kind: TavernKind, rules: TavernRules): string[] {
  const stakes = [
    rules.anteCp > 0
      ? `Everyone antes ${cpWords(rules.anteCp)} a round.`
      : 'No ante.',
    rules.raiseCapCp > 0
      ? `One raise can add up to ${cpWords(rules.raiseCapCp)}.`
      : 'Nobody raises.',
  ];
  if (kind === 'liars-dice') {
    const r = rules as LiarsDiceRules;
    return [
      `${r.dicePerCup} dice a cup. Bid how many of a face are under every cup, or call Liar! on the last bid.`,
      r.onesWild ? 'Ones are wild.' : 'Ones are only ones.',
      ...(r.spotOn
        ? [
            'Spot on: call the last bid exactly right and take the pot; call it wrong and lose a die.',
          ]
        : []),
      'Whoever loses a call sets a die aside. The last cup with dice wins.',
      ...stakes,
    ];
  }
  const r = rules as CrownsRules;
  return [
    `Dealt ${r.dealt}, then one card is turned up: the crown. Its suit counts ${
      r.crownMultiplier === 3 ? 'three times' : 'double'
    }.`,
    r.maxDraws > 0
      ? `Draw up to ${r.maxDraws} more, one at a time. Highest at or under ${r.target} wins.`
      : `No draws. Highest at or under ${r.target} wins.`,
    'Ties split the pot. If everyone busts, the pot rolls over.',
    ...stakes,
  ];
}

/* --- betting, shared by both games --------------------------------------- */

/**
 * One round's money. `inCp` is what each seat has put in this round; a seat
 * owes the difference between that and the stake before it may act, which
 * is what "holding" is.
 */
export interface Betting {
  stakeCp: number;
  inCp: Record<string, number>;
  potCp: number;
}

/** A round's opening money: everybody who anted is in for the ante. */
export function openBetting(
  seats: string[],
  anteCp: number,
  carryCp = 0
): Betting {
  return {
    stakeCp: anteCp,
    inCp: Object.fromEntries(seats.map(s => [s, anteCp])),
    potCp: anteCp * seats.length + carryCp,
  };
}

/** What a seat must add to stay in. */
export function holdCp(betting: Betting, seat: string): number {
  return Math.max(0, betting.stakeCp - (betting.inCp[seat] ?? 0));
}

/**
 * A seat holds, and raises by `raiseCp` on top. Returns the new betting and
 * what came out of the seat's purse. The cap is checked by the caller's
 * engine, which knows the rules.
 */
export function payIn(
  betting: Betting,
  seat: string,
  raiseCp: number
): { betting: Betting; paidCp: number } {
  const raise = Math.max(0, Math.trunc(raiseCp));
  const paid = holdCp(betting, seat) + raise;
  return {
    betting: {
      stakeCp: betting.stakeCp + raise,
      inCp: { ...betting.inCp, [seat]: (betting.inCp[seat] ?? 0) + paid },
      potCp: betting.potCp + paid,
    },
    paidCp: paid,
  };
}

/** The pot split between winners, the odd copper to the first. */
export function splitPot(
  potCp: number,
  winners: string[]
): Record<string, number> {
  if (winners.length === 0) return {};
  const each = Math.floor(potCp / winners.length);
  const odd = potCp - each * winners.length;
  return Object.fromEntries(
    winners.map((w, i) => [w, each + (i === 0 ? odd : 0)])
  );
}

/* --- turns, shared by both games ----------------------------------------- */

/** The seat after `from` in `order`, skipping anybody in `skip`. */
export function nextSeat(
  order: string[],
  from: string,
  skip: readonly string[]
): string | null {
  const at = order.indexOf(from);
  for (let step = 1; step <= order.length; step++) {
    const seat = order[(at + step) % order.length];
    if (!skip.includes(seat)) return seat;
  }
  return null;
}

/* --- off the sheet ------------------------------------------------------- */

/** The two things a seat may do off its sheet, once a round each. */
export type SheetMove = 'read' | 'cheat';

/**
 * Whether a hero is proficient with the gaming set this tavern game uses.
 *
 * The sheet keeps tools as a line of prose (`proficiencies.tools`), so this
 * reads it with one strict matcher and the panel prints the answer back —
 * "Dice set: proficient" — so a player whose sheet says something odd can
 * see the miss and fix the sheet, rather than the bonus coming and going
 * silently.
 */
export function gamingSetProficient(tools: string, kind: TavernKind): boolean {
  const text = tools ?? '';
  return kind === 'liars-dice'
    ? /\bdice\b/i.test(text)
    : /\bplaying[- ]?cards?\b|\bcard set\b/i.test(text);
}

export const GAMING_SET_LABEL: Record<TavernKind, string> = {
  'liars-dice': 'Dice set',
  crowns: 'Playing cards',
};

/** What each game calls cheating, as the button says it. */
export const CHEAT_LABEL: Record<TavernKind, string> = {
  'liars-dice': 'Palm a die',
  crowns: 'Deal from the bottom',
};

/* --- house games, as the browser sees them -------------------------------- */

export interface HouseGameRow {
  id: string;
  kind: TavernKind;
  name: string;
  /** The DM's own words. */
  blurb: string;
  rules: TavernRules;
  /** `rulesLines`, composed on the server so every reader sees the same. */
  lines: string[];
}

/* --- a running tavern game, as one viewer may see it ---------------------- */

export type SeatStatus = 'invited' | 'seated' | 'declined' | 'out';
export type TavernStatus = 'seating' | 'playing' | 'ended';

/** A seat's passive numbers, for the DM reading who would notice a cheat. */
export interface SeatPassives {
  perception: number;
  insight: number;
  deception: number;
}

export interface TavernSeatView {
  id: string;
  name: string;
  npc: boolean;
  characterId: string | null;
  status: SeatStatus;
  /** The viewer's own seat. */
  yours: boolean;
  /** Put in this round. */
  inCp: number;
  folded: boolean;
  /** Liar's dice: dice left in the cup. Null in Crowns. */
  dice: number | null;
  /** Crowns: cards in hand. Null in liar's dice. */
  cards: number | null;
  netCp: number;
  /** Staff only: an NPC's attitude (DM-private, `docs/naming.md`). */
  attitude: string | null;
  /** Staff only: the stat block an NPC plays off, by name. */
  statBlock: string | null;
  /** Staff only. */
  passives: SeatPassives | null;
}

export interface TavernYou {
  seatId: string;
  status: SeatStatus;
  /** What bidding, calling or holding costs right now. */
  holdCp: number;
  /** The hero's whole purse, copper. */
  purseCp: number;
  /** Proficient with this game's gaming set: advantage on reads and cheats. */
  proficient: boolean;
  insight: number;
  sleight: number;
  /** Done off the sheet this round. */
  used: SheetMove[];
}

/** A seat the DM plays, with its numbers off the stat block. */
export interface TavernNpcSeat {
  seatId: string;
  holdCp: number;
  insight: number;
  sleight: number;
  used: SheetMove[];
}

export interface TavernResultView {
  line: string;
  winners: string[];
  loser: string | null;
}

export interface TavernLogLine {
  id: string;
  round: number;
  line: string;
  /** Seen by staff and whoever did it. */
  hidden: boolean;
}

export interface TavernView {
  id: string;
  kind: TavernKind;
  name: string;
  blurb: string;
  rules: TavernRules;
  lines: string[];
  status: TavernStatus;
  round: number;
  staff: boolean;
  seats: TavernSeatView[];
  /** Whose turn, by seat id; null between rounds. */
  turn: string | null;
  /** A round is being played. */
  inRound: boolean;
  potCp: number;
  stakeCp: number;
  carryCp: number;
  you: TavernYou | null;
  /** Staff: the NPC seats the DM plays. */
  npcs: TavernNpcSeat[];
  liars: {
    bid: { count: number; face: number; by: string } | null;
    cups: Record<string, number[] | null>;
    diceOut: number;
  } | null;
  crowns: {
    phase: 'bet1' | 'draw' | 'bet2' | 'show';
    crown: { suit: 'coins' | 'cups' | 'blades' | 'staves'; rank: number };
    hands: Record<
      string,
      { suit: 'coins' | 'cups' | 'blades' | 'staves'; rank: number }[] | null
    >;
    totals: Record<string, number> | null;
    draws: Record<string, number>;
  } | null;
  result: TavernResultView | null;
  log: TavernLogLine[];
}

/** Liar's dice bids in words: "four 5s", "one 6". */
export function bidWords(count: number, face: number): string {
  const words = [
    'no',
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
    'eleven',
    'twelve',
  ];
  const n = words[count] ?? String(count);
  return `${n} ${face}${count === 1 ? '' : 's'}`;
}
