/**
 * Pure dice / point-buy helpers for ability-score generation.
 * No React, no side effects — safe to unit test and to run on the server.
 */

export interface Roll4d6Result {
  /** the four raw d6 values, in roll order */
  rolls: [number, number, number, number];
  /** index into `rolls` of the die that was dropped (first lowest) */
  dropIndex: number;
  /** sum of the three kept dice */
  total: number;
}

export function rollDie(sides = 6): number {
  return 1 + Math.floor(Math.random() * sides);
}

/** Roll 4d6, drop the lowest die, sum the rest. */
export function roll4d6DropLowest(): Roll4d6Result {
  const rolls = [rollDie(), rollDie(), rollDie(), rollDie()] as [
    number,
    number,
    number,
    number,
  ];
  let dropIndex = 0;
  for (let i = 1; i < 4; i++) {
    if (rolls[i] < rolls[dropIndex]) dropIndex = i;
  }
  const total = rolls.reduce(
    (sum, v, i) => (i === dropIndex ? sum : sum + v),
    0
  );
  return { rolls, dropIndex, total };
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
