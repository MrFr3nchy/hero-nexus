/**
 * Pure dice / point-buy helpers for ability-score generation.
 * No React, no side effects — safe to unit test and to run on the server.
 */

/** `3d6` = roll three, keep all. `4d6kh3` = roll four, keep the highest three. */
export type RollMode = '3d6' | '4d6kh3';

export const ROLL_MODES: { key: RollMode; label: string; hint: string }[] = [
  { key: '3d6', label: '3d6', hint: 'Roll three d6, keep all three.' },
  {
    key: '4d6kh3',
    label: '4d6 keep 3',
    hint: 'Roll four d6, drop the lowest die.',
  },
];

/** One handful of dice: `count`d`sides`, optionally keeping the best few. */
export interface RollSpec {
  sides: number;
  count: number;
  /** Keep only the highest N dice; omit to keep them all. */
  keepHighest?: number;
}

export interface RollResult {
  spec: RollSpec;
  /** every die rolled, in roll order */
  dice: number[];
  /** indexes into `dice` that count toward the total */
  keptIndexes: number[];
  /** indexes into `dice` that were dropped */
  droppedIndexes: number[];
  total: number;
}

export interface AbilityRoll extends RollResult {
  mode: RollMode;
}

export function rollDie(sides = 6): number {
  return 1 + Math.floor(Math.random() * sides);
}

/** Fold already-rolled values into a {@link RollResult} for the spec. */
export function tallyRoll(spec: RollSpec, dice: number[]): RollResult {
  const drop = Math.max(0, dice.length - (spec.keepHighest ?? dice.length));
  const order = dice
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const droppedIndexes = order
    .slice(0, drop)
    .map(d => d.index)
    .sort((a, b) => a - b);
  const dropped = new Set(droppedIndexes);
  return {
    spec,
    dice,
    keptIndexes: dice.map((_, i) => i).filter(i => !dropped.has(i)),
    droppedIndexes,
    total: dice.reduce((sum, v, i) => (dropped.has(i) ? sum : sum + v), 0),
  };
}

/** Roll a handful of dice. */
export function rollGroup(spec: RollSpec): RollResult {
  return tallyRoll(
    spec,
    Array.from({ length: spec.count }, () => rollDie(spec.sides))
  );
}

/** The dice a roll mode asks for. */
export function specForMode(mode: RollMode): RollSpec {
  return mode === '3d6'
    ? { sides: 6, count: 3 }
    : { sides: 6, count: 4, keepHighest: 3 };
}

/** Roll one ability score under the given mode. */
export function rollAbilityScore(mode: RollMode): AbilityRoll {
  return { ...rollGroup(specForMode(mode)), mode };
}

/** Fold a set of raw d6 values into an {@link AbilityRoll} for the mode. */
export function tallyAbilityRoll(mode: RollMode, dice: number[]): AbilityRoll {
  return { ...tallyRoll(specForMode(mode), dice), mode };
}

/* ---- Point buy (D&D 5e 2024) --------------------------------------- */

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** Cost of a single score under point buy, or null if out of the 8–15 band. */
export function pointBuyCost(score: number): number | null {
  return POINT_BUY_COST[score] ?? null;
}

/** Total points spent across six scores (out-of-band scores count as 0). */
export function pointBuySpent(scores: number[]): number {
  return scores.reduce((sum, s) => sum + (POINT_BUY_COST[s] ?? 0), 0);
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/* ---- Free dice notation (the table's shared roller) ----------------- *
 * Kept separate from the ability-score helpers above: those model one
 * specific 5e procedure, this parses whatever someone types at the table.
 * ------------------------------------------------------------------- */

/** One `NdS`, optionally keeping the highest/lowest few, plus its sign. */
export interface NotationTerm {
  count: number;
  sides: number;
  keepHighest?: number;
  keepLowest?: number;
  negative: boolean;
}

export interface Notation {
  terms: NotationTerm[];
  /** Flat bonus/penalty, already summed. */
  modifier: number;
}

export interface NotationRoll {
  notation: string;
  /** Every die face rolled, in roll order across all terms. */
  dice: number[];
  /** Indexes into `dice` that did not count (dropped by keep-highest/lowest). */
  dropped: number[];
  modifier: number;
  total: number;
}

/** Sane ceilings so a typo can't ask for a million dice. */
const MAX_DICE = 100;
const MAX_SIDES = 1000;

const TERM = /^([+-]?)(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i;
const FLAT = /^([+-]?)(\d+)$/;

/**
 * Parse `2d6+3`, `d20`, `4d6kh3`, `2d20kl1-1`. Whitespace is ignored and terms
 * may appear in any order. Returns null when the string isn't dice notation —
 * callers show that as "not dice", never as a roll of zero.
 */
export function parseNotation(input: string): Notation | null {
  const cleaned = input.replace(/\s+/g, '').toLowerCase();
  if (!cleaned) return null;

  // Split before each sign, keeping the sign with its term.
  const chunks = cleaned
    .replace(/([+-])/g, ' $1')
    .trim()
    .split(/\s+/);
  const terms: NotationTerm[] = [];
  let modifier = 0;

  for (const chunk of chunks) {
    const flat = FLAT.exec(chunk);
    if (flat) {
      const value = Number(flat[2]);
      modifier += flat[1] === '-' ? -value : value;
      continue;
    }

    const term = TERM.exec(chunk);
    if (!term) return null;

    const count = term[2] === '' ? 1 : Number(term[2]);
    const sides = Number(term[3]);
    if (count < 1 || count > MAX_DICE) return null;
    if (sides < 2 || sides > MAX_SIDES) return null;

    const keep = term[5] ? Number(term[5]) : undefined;
    if (keep !== undefined && (keep < 1 || keep > count)) return null;

    terms.push({
      count,
      sides,
      negative: term[1] === '-',
      keepHighest: term[4] === 'kh' ? keep : undefined,
      keepLowest: term[4] === 'kl' ? keep : undefined,
    });
  }

  if (terms.length === 0) return null;
  return { terms, modifier };
}

/**
 * Sum a parsed notation over faces already decided — the server's own dice,
 * or the faces a player read off real ones. Rolling and tallying are two
 * steps so the second can be checked apart from the first, and so a claim
 * about a die never arrives as a claim about a total.
 *
 * `faces` must be one per die across the terms, in term order, each within
 * its die — see {@link facesFit}. Returns null when it does not fit.
 */
export function tallyNotation(
  input: string,
  parsed: Notation,
  faces: number[]
): NotationRoll | null {
  if (!facesFit(parsed, faces)) return null;

  const dice: number[] = [];
  const dropped: number[] = [];
  let total = parsed.modifier;
  let next = 0;

  for (const term of parsed.terms) {
    const base = dice.length;
    const own = faces.slice(next, next + term.count);
    next += term.count;
    dice.push(...own);

    const keep = term.keepHighest ?? term.keepLowest;
    let counted = own.map((_, i) => i);
    if (keep !== undefined) {
      const order = own
        .map((value, index) => ({ value, index }))
        .sort((a, b) =>
          term.keepHighest !== undefined
            ? b.value - a.value || a.index - b.index
            : a.value - b.value || a.index - b.index
        );
      counted = order.slice(0, keep).map(d => d.index);
      const kept = new Set(counted);
      own.forEach((_, i) => {
        if (!kept.has(i)) dropped.push(base + i);
      });
    }

    const sum = counted.reduce((acc, i) => acc + own[i], 0);
    total += term.negative ? -sum : sum;
  }

  return {
    notation: input.trim(),
    dice,
    dropped,
    modifier: parsed.modifier,
    total,
  };
}

/**
 * Whether a list of faces is exactly what a notation asks for: one per die,
 * in term order, each an integer from 1 to that die's sides. `2d20kh1` wants
 * two faces — advantage is two dice, whoever rolled them.
 */
export function facesFit(parsed: Notation, faces: number[]): boolean {
  const wanted = parsed.terms.reduce((n, t) => n + t.count, 0);
  if (faces.length !== wanted) return false;
  let i = 0;
  for (const term of parsed.terms) {
    for (let k = 0; k < term.count; k++, i++) {
      const f = faces[i];
      if (!Number.isInteger(f) || f < 1 || f > term.sides) return false;
    }
  }
  return true;
}

/**
 * Roll a parsed notation. Rolling happens wherever this is called — the
 * shared table log calls it on the server so the dice are not the client's
 * to choose. With `faces` given, nothing is rolled: the faces are tallied as
 * they stand, and null comes back if they do not fit the notation.
 */
export function rollNotation(
  input: string,
  faces?: number[]
): NotationRoll | null {
  const parsed = parseNotation(input);
  if (!parsed) return null;
  if (faces) return tallyNotation(input, parsed, faces);
  const rolled: number[] = [];
  for (const term of parsed.terms) {
    for (let i = 0; i < term.count; i++) rolled.push(rollDie(term.sides));
  }
  return tallyNotation(input, parsed, rolled);
}

/**
 * A d20 test's dice: one face straight, two with advantage or
 * disadvantage. Given faces, they are checked rather than rolled — the
 * right count, each 1–20 — and null says they do not fit.
 */
export function d20Faces(
  mode: 'straight' | 'advantage' | 'disadvantage',
  faces?: number[]
): number[] | null {
  const count = mode === 'straight' ? 1 : 2;
  if (!faces) return Array.from({ length: count }, () => rollDie(20));
  if (faces.length !== count) return null;
  if (!faces.every(f => Number.isInteger(f) && f >= 1 && f <= 20)) return null;
  return faces;
}

/** The face a d20 test counts, and which die it was. */
export function d20Result(
  mode: 'straight' | 'advantage' | 'disadvantage',
  dice: number[]
): { face: number; dropped: number[] } {
  const face =
    mode === 'advantage'
      ? Math.max(...dice)
      : mode === 'disadvantage'
        ? Math.min(...dice)
        : dice[0];
  return {
    face,
    dropped: dice.length === 2 ? [dice[0] === face ? 1 : 0] : [],
  };
}

/** Rewrite `1d20+5` as its advantage / disadvantage form. */
export function withAdvantage(
  input: string,
  mode: 'advantage' | 'disadvantage'
): string {
  const keep = mode === 'advantage' ? 'kh1' : 'kl1';
  return input.replace(
    /^\s*(\d*)d(\d+)/i,
    (_, __, sides) => `2d${sides}${keep}`
  );
}

/* ---- Die sizes ------------------------------------------------------ *
 * The polyhedra the app can draw. Anything else still rolls fine — the
 * roller falls back to the d20 silhouette — but these are the ones with
 * their own shape.
 * ------------------------------------------------------------------- */

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export const DIE_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20, 100];

export function isDieSides(sides: number): sides is DieSides {
  return (DIE_SIDES as number[]).includes(sides);
}

/**
 * Which die produced each face in a {@link NotationRoll}'s `dice` array.
 *
 * `rollNotation` flattens every term's faces into one list in term order, so
 * the sides can be recovered from the notation alone. That is what lets a roll
 * read back off the server — where only the notation and the faces are
 * stored — be re-drawn as the right polyhedra.
 */
export function notationSides(input: string): number[] | null {
  const parsed = parseNotation(input);
  if (!parsed) return null;
  const sides: number[] = [];
  for (const term of parsed.terms) {
    for (let i = 0; i < term.count; i++) sides.push(term.sides);
  }
  return sides;
}

/**
 * A natural 20 or a natural 1, but only when a single d20 decided the roll.
 * `2d20kh1` counts — one die is kept. `2d20` does not: there is no "the" die.
 */
export function critToneOf(
  notation: string,
  dice: number[],
  dropped: number[]
): 'crit' | 'fumble' | null {
  const sides = notationSides(notation);
  const counted = dice
    .map((value, index) => ({ value, index }))
    .filter(d => !dropped.includes(d.index));
  if (counted.length !== 1) return null;
  if ((sides?.[counted[0].index] ?? 0) !== 20) return null;
  if (counted[0].value === 20) return 'crit';
  if (counted[0].value === 1) return 'fumble';
  return null;
}
