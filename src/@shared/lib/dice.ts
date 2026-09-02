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

export interface AbilityRoll {
  mode: RollMode;
  /** every die rolled, in roll order */
  dice: number[];
  /** indexes into `dice` that count toward the total */
  keptIndexes: number[];
  /** indexes into `dice` that were dropped (empty for 3d6) */
  droppedIndexes: number[];
  total: number;
}

export function rollDie(sides = 6): number {
  return 1 + Math.floor(Math.random() * sides);
}

/** Roll one ability score under the given mode. */
export function rollAbilityScore(mode: RollMode): AbilityRoll {
  const count = mode === '3d6' ? 3 : 4;
  const dice = Array.from({ length: count }, () => rollDie());

  if (mode === '3d6') {
    return {
      mode,
      dice,
      keptIndexes: dice.map((_, i) => i),
      droppedIndexes: [],
      total: dice.reduce((a, b) => a + b, 0),
    };
  }

  // 4d6kh3 — drop the single lowest die (first one on ties).
  let dropIndex = 0;
  for (let i = 1; i < dice.length; i++) {
    if (dice[i] < dice[dropIndex]) dropIndex = i;
  }
  return {
    mode,
    dice,
    keptIndexes: dice.map((_, i) => i).filter(i => i !== dropIndex),
    droppedIndexes: [dropIndex],
    total: dice.reduce((sum, v, i) => (i === dropIndex ? sum : sum + v), 0),
  };
}

/** Fold a set of raw d6 values into an {@link AbilityRoll} for the mode. */
export function tallyAbilityRoll(mode: RollMode, dice: number[]): AbilityRoll {
  if (mode === '3d6' || dice.length < 4) {
    return {
      mode,
      dice,
      keptIndexes: dice.map((_, i) => i),
      droppedIndexes: [],
      total: dice.reduce((a, b) => a + b, 0),
    };
  }
  let dropIndex = 0;
  for (let i = 1; i < dice.length; i++) {
    if (dice[i] < dice[dropIndex]) dropIndex = i;
  }
  return {
    mode,
    dice,
    keptIndexes: dice.map((_, i) => i).filter(i => i !== dropIndex),
    droppedIndexes: [dropIndex],
    total: dice.reduce((sum, v, i) => (i === dropIndex ? sum : sum + v), 0),
  };
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
