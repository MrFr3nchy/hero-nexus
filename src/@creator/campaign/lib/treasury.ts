/**
 * The party purse and its arithmetic.
 *
 * Pure — no React, no DB — so the ledger can preview a split in the browser
 * before anyone commits to it, and the server can do the same sum.
 */

export type CoinKey = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

export type Treasury = Record<CoinKey, number>;

/** Largest first, which is the order a table counts money in. */
export const COIN_KEYS: CoinKey[] = ['pp', 'gp', 'ep', 'sp', 'cp'];

export const COIN_LABELS: Record<CoinKey, string> = {
  pp: 'Platinum',
  gp: 'Gold',
  ep: 'Electrum',
  sp: 'Silver',
  cp: 'Copper',
};

/** Copper value of one of each coin — the 2024 rates. */
export const COIN_IN_COPPER: Record<CoinKey, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

export const EMPTY_TREASURY: Treasury = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

export interface SplitResult {
  /** Each share, in coins. */
  share: Treasury;
  /** What the arithmetic could not divide, left in the purse. */
  remainder: Treasury;
  ways: number;
}

/** Total value of a purse, in copper. */
export function inCopper(purse: Treasury): number {
  return COIN_KEYS.reduce(
    (sum, key) => sum + purse[key] * COIN_IN_COPPER[key],
    0
  );
}

/**
 * Convert a copper amount back into coins, largest first.
 *
 * Electrum is skipped on the way back: every table that uses it does so on
 * purpose, and nobody wants to be handed a share in it by rounding.
 */
export function fromCopper(copper: number): Treasury {
  let rest = Math.max(0, Math.floor(copper));
  const out: Treasury = { ...EMPTY_TREASURY };
  for (const key of ['pp', 'gp', 'sp', 'cp'] as CoinKey[]) {
    out[key] = Math.floor(rest / COIN_IN_COPPER[key]);
    rest -= out[key] * COIN_IN_COPPER[key];
  }
  return out;
}

/**
 * Work out an even split of the purse without touching it.
 *
 * The whole purse goes to copper, is divided, and comes back as coins —
 * otherwise "split 3 gold four ways" reads as nothing each, when the honest
 * answer is 7 silver 5 copper each.
 */
export function splitTreasury(purse: Treasury, ways: number): SplitResult {
  const safeWays = Math.max(1, Math.floor(ways));
  const total = inCopper(purse);
  const perShare = Math.floor(total / safeWays);
  return {
    share: fromCopper(perShare),
    remainder: fromCopper(total - perShare * safeWays),
    ways: safeWays,
  };
}

/** "1 pp, 7 sp, 5 cp" — empty denominations dropped, "nothing" when broke. */
export function describeTreasury(purse: Treasury): string {
  const parts = COIN_KEYS.filter(key => purse[key] > 0).map(
    key => `${purse[key]} ${key}`
  );
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}
