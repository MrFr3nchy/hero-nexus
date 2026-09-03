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
  const droppedIndexes = order.slice(0, drop).map(d => d.index).sort((a, b) => a - b);
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
