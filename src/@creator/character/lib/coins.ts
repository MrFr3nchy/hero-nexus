/**
 * Coin arithmetic for a purse.
 *
 * Pure: the shop's server module pays from a purse with this and the panel
 * says in advance what a price costs. Prices travel as copper — the one unit
 * every coin is a whole number of — so a 3 sp potion and a 50 gp sword are
 * the same kind of number.
 */

export interface Purse {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export type CoinName = keyof Purse;

/** Copper per coin, 2024 PHB. */
export const COIN_VALUE_CP: Record<CoinName, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

/** Smallest to largest, the order a purse is paid from. */
const ASCENDING: CoinName[] = ['cp', 'sp', 'ep', 'gp', 'pp'];

/** Everything in the purse, as copper. */
export function purseInCp(purse: Partial<Purse>): number {
  return ASCENDING.reduce(
    (sum, k) => sum + (purse[k] ?? 0) * COIN_VALUE_CP[k],
    0
  );
}

/** A book cost in gold — `0.5` for a 5 sp item — as whole copper. */
export function gpToCp(gp: number): number {
  return Math.round(gp * 100);
}

/** A price with a markup on it: 12 gp at +25% is 15 gp; −50% is 6 gp. */
export function markedUp(cp: number, percent: number): number {
  return Math.max(0, Math.round(cp * (1 + percent / 100)));
}

/**
 * Copper as coins, largest first: 1,234 cp is 1 pp, 2 gp, 3 sp, 4 cp.
 * Electrum is never given as change — nobody wants it.
 */
export function coinsFromCp(cp: number): Purse {
  let left = Math.max(0, Math.trunc(cp));
  const out: Purse = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  out.pp = Math.floor(left / 1000);
  left -= out.pp * 1000;
  out.gp = Math.floor(left / 100);
  left -= out.gp * 100;
  out.sp = Math.floor(left / 10);
  left -= out.sp * 10;
  out.cp = left;
  return out;
}

/**
 * A price in words: "27 gp, 7 sp", or "0" for nothing. Prices are quoted the
 * way the book quotes them — in gold, never platinum — so a 1,250 gp sword
 * reads as one, whatever coins end up paying for it.
 */
export function cpWords(cp: number): string {
  let left = Math.max(0, Math.trunc(cp));
  const gp = Math.floor(left / 100);
  left -= gp * 100;
  const sp = Math.floor(left / 10);
  left -= sp * 10;
  const parts = [
    gp > 0 ? `${gp} gp` : '',
    sp > 0 ? `${sp} sp` : '',
    left > 0 ? `${left} cp` : '',
  ].filter(Boolean);
  return parts.join(', ') || '0';
}

/**
 * Pay a price from a purse, keeping as many of its coins as possible.
 *
 * Smallest coins go first, so a 3 sp potion comes out of the silver and not
 * the gold. When the small coins run out, the next larger coin is broken and
 * the change comes back as silver and copper — the way a shopkeeper makes
 * change, not the way a spreadsheet rebalances a purse. Null when the purse
 * cannot cover it, and nothing is touched.
 */
export function payFromPurse(purse: Purse, priceCp: number): Purse | null {
  const price = Math.max(0, Math.trunc(priceCp));
  if (purseInCp(purse) < price) return null;
  const next: Purse = { ...purse };
  let owed = price;

  // Small coins first, whole coins only.
  for (const k of ASCENDING) {
    if (owed === 0) break;
    const take = Math.min(next[k], Math.floor(owed / COIN_VALUE_CP[k]));
    next[k] -= take;
    owed -= take * COIN_VALUE_CP[k];
  }
  if (owed === 0) return next;

  // Something is still owed. After the pass above, every coin left is worth
  // more than what is owed (else it would have been taken), so the smallest
  // one left covers it: break it, and take the change back as small coins.
  for (const k of ASCENDING) {
    if (next[k] > 0 && COIN_VALUE_CP[k] >= owed) {
      next[k] -= 1;
      return addToPurse(next, COIN_VALUE_CP[k] - owed);
    }
  }
  // Unreachable while the purse covers the price; said so rather than assumed.
  return null;
}

/** Add copper to a purse as whole coins, largest first. */
export function addToPurse(purse: Purse, cp: number): Purse {
  const coins = coinsFromCp(cp);
  return {
    cp: purse.cp + coins.cp,
    sp: purse.sp + coins.sp,
    ep: purse.ep,
    gp: purse.gp + coins.gp,
    pp: purse.pp + coins.pp,
  };
}
