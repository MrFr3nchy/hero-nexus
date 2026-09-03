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

/** Roll a parsed notation. Rolling happens wherever this is called — the
 *  shared table log calls it on the server so the dice are not the client's
 *  to choose. */
export function rollNotation(input: string): NotationRoll | null {
  const parsed = parseNotation(input);
  if (!parsed) return null;

  const dice: number[] = [];
  const dropped: number[] = [];
  let total = parsed.modifier;

  for (const term of parsed.terms) {
    const base = dice.length;
    const faces = Array.from({ length: term.count }, () => rollDie(term.sides));
    dice.push(...faces);

    const keep = term.keepHighest ?? term.keepLowest;
    let counted = faces.map((_, i) => i);
    if (keep !== undefined) {
      const order = faces
        .map((value, index) => ({ value, index }))
        .sort((a, b) =>
          term.keepHighest !== undefined
            ? b.value - a.value || a.index - b.index
            : a.value - b.value || a.index - b.index
        );
      counted = order.slice(0, keep).map(d => d.index);
      const kept = new Set(counted);
      faces.forEach((_, i) => {
        if (!kept.has(i)) dropped.push(base + i);
      });
    }

    const sum = counted.reduce((acc, i) => acc + faces[i], 0);
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
