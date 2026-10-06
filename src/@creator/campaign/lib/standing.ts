/**
 * NPC attitude and faction standing — the pure half.
 *
 * An attitude is the 2024 rules' three (friendly, indifferent, hostile): how
 * one NPC regards the party, DM-private. Standing is a faction's, a running
 * sum of changes that is clamped to −3…+3 for reading, so a long campaign of
 * small favours does not end at "+17", which means nothing.
 *
 * Pure: no React, no server, no database.
 */

export const ATTITUDES = ['friendly', 'indifferent', 'hostile'] as const;
export type Attitude = (typeof ATTITUDES)[number];

export const ATTITUDE_LABEL: Record<Attitude, string> = {
  friendly: 'Friendly',
  indifferent: 'Indifferent',
  hostile: 'Hostile',
};

export function isAttitude(v: unknown): v is Attitude {
  return (ATTITUDES as readonly unknown[]).includes(v);
}

export const STANDING_MIN = -3;
export const STANDING_MAX = 3;

/**
 * Words for each step. Deliberately not the attitude words: an attitude is
 * one person's, standing is a whole faction's, and one word for two things
 * is the thing `docs/naming.md` exists to stop.
 */
const STANDING_WORDS: Record<number, string> = {
  [-3]: 'Sworn enemies',
  [-2]: 'Enemies',
  [-1]: 'Wary',
  0: 'Neutral',
  1: 'Warm',
  2: 'Trusted',
  3: 'Allies',
};

export function clampStanding(sum: number): number {
  return Math.max(STANDING_MIN, Math.min(STANDING_MAX, Math.trunc(sum) || 0));
}

export function standingLabel(sum: number): string {
  return STANDING_WORDS[clampStanding(sum)];
}

export interface StandingChange {
  id: string;
  delta: number;
  reason: string;
  shown: boolean;
  createdAt: string;
}

/** The whole sum, and the sum of what the party has been shown. */
export function standingTotals(changes: readonly StandingChange[]): {
  total: number;
  shown: number;
} {
  let total = 0;
  let shown = 0;
  for (const c of changes) {
    total += c.delta;
    if (c.shown) shown += c.delta;
  }
  return { total, shown };
}

/** A delta a DM may record: a step or two, never zero. */
export function validDelta(n: number): boolean {
  return Number.isInteger(n) && n !== 0 && Math.abs(n) <= 3;
}

/** "+1", "−2" — signed, with a real minus. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/**
 * The line that goes to Revealed when a change is shown to the party:
 * "The Duskwater: Wary (−1) — you burned their ledger."
 */
export function standingRevealLine(
  faction: string,
  shownTotalAfter: number,
  change: Pick<StandingChange, 'delta' | 'reason'>
): string {
  const reason = change.reason.trim();
  return `${faction}: ${standingLabel(shownTotalAfter)} (${signed(change.delta)})${
    reason ? ` — ${reason}` : ''
  }`;
}
