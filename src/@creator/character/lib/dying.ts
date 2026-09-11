/**
 * Death saving throws: the state a character is in, and what a roll does to it.
 *
 * Pure and sheet-shaped — no database, no React, no dice. `play.ts` rolls the
 * die and calls in here; the UI reads `dyingState` to decide what to draw. That
 * split is what lets the rules be checked without a server and drawn without
 * re-deriving them.
 *
 * The rules are 2024. Two are pinned by SRD rows shipping in this repo:
 * `srd-2024_periapt-of-wound-closure` turns "a roll of 9 or lower" into a
 * success, fixing the threshold at 10, and `srd-2024_beacon-of-hope` grants
 * advantage on death saves, which is why `mode` exists at all. The rest —
 * natural 20, natural 1, damage at 0, massive damage — is from the rulebook;
 * the SRD subset here carries classes, spells, items and monsters, not the
 * combat chapter.
 */

/** The successes and failures a character has collected, plus stability. */
export interface DeathTracks {
  successes: number;
  failures: number;
  stable: boolean;
}

export type DyingState = 'alive' | 'dying' | 'stable' | 'dead';

/**
 * Where a character stands.
 *
 * Order matters: dead outranks everything, because three failures is three
 * failures whatever the hit points say — a character killed by massive damage
 * is not un-killed by a heal that has not happened yet.
 */
export function dyingState(hpCurrent: number, tracks: DeathTracks): DyingState {
  if (tracks.failures >= 3) return 'dead';
  if (hpCurrent > 0) return 'alive';
  return tracks.stable ? 'stable' : 'dying';
}

/** Straight, or with the advantage Beacon of Hope grants. */
export type DeathSaveMode = 'straight' | 'advantage' | 'disadvantage';

export interface DeathSaveOutcome {
  tracks: DeathTracks;
  /** Set when a natural 20 brings them back up. */
  hpCurrent: number | null;
  /** The die faces rolled, in order. Two of them for advantage. */
  dice: number[];
  /** The face that counted. */
  result: number;
  state: DyingState;
  /** One line for the roll log, written for a reader at the table. */
  summary: string;
}

/** Which of two faces counts, given the mode. */
function chooseFace(dice: number[], mode: DeathSaveMode): number {
  if (dice.length === 1) return dice[0];
  return mode === 'advantage'
    ? Math.max(dice[0], dice[1])
    : Math.min(dice[0], dice[1]);
}

/**
 * Apply one death saving throw.
 *
 * `dice` is passed in rather than rolled here so the caller owns the randomness
 * — `play.ts` rolls on the server so the log is a record rather than a claim,
 * and a test can hand this a 1 and a 20 without stubbing anything.
 */
export function applyDeathSave(
  tracks: DeathTracks,
  dice: number[],
  mode: DeathSaveMode = 'straight'
): DeathSaveOutcome {
  const result = chooseFace(dice, mode);
  const next: DeathTracks = { ...tracks };
  let hpCurrent: number | null = null;
  let summary: string;

  if (result === 20) {
    // A natural 20 is not a success — it is being back on your feet with one
    // hit point, which also ends the dying outright.
    next.successes = 0;
    next.failures = 0;
    next.stable = false;
    hpCurrent = 1;
    summary = 'Natural 20 — up with 1 hit point.';
  } else if (result === 1) {
    next.failures = Math.min(3, next.failures + 2);
    summary =
      next.failures >= 3
        ? 'Natural 1 — that is three. Dead.'
        : 'Natural 1 — two failures.';
  } else if (result >= 10) {
    next.successes = Math.min(3, next.successes + 1);
    if (next.successes >= 3) {
      // Stabilising clears both tracks, which is exactly why `stable` has to
      // be stored: without it this is indistinguishable from just going down.
      next.successes = 0;
      next.failures = 0;
      next.stable = true;
      summary = `${result} — third success. Stable.`;
    } else {
      summary = `${result} — success (${next.successes}/3).`;
    }
  } else {
    next.failures = Math.min(3, next.failures + 1);
    summary =
      next.failures >= 3
        ? `${result} — third failure. Dead.`
        : `${result} — failure (${next.failures}/3).`;
  }

  return {
    tracks: next,
    hpCurrent,
    dice,
    result,
    state: dyingState(hpCurrent ?? 0, next),
    summary,
  };
}

/**
 * What damage does to a character who is already at 0 hit points, or who this
 * damage kills outright.
 *
 * Two rules in one place because they are one decision at the table: how much
 * of that hit was left over after it took you down.
 *
 * - Damage whose excess over the remaining hit points meets or beats the hit
 *   point maximum kills, with no saves at all.
 * - Otherwise, damage taken while already at 0 is a failure, or two from a
 *   critical hit.
 */
export function applyDamageWhileDown(
  tracks: DeathTracks,
  damage: number,
  hpBefore: number,
  hpMax: number,
  critical = false
): { tracks: DeathTracks; instantDeath: boolean } {
  const next: DeathTracks = { ...tracks };
  if (damage <= 0) return { tracks: next, instantDeath: false };

  const excess = damage - Math.max(0, hpBefore);
  if (hpMax > 0 && excess >= hpMax) {
    // Killed outright. Three failures rather than a second way of being dead,
    // so everything that reads a corpse reads one field.
    next.failures = 3;
    next.stable = false;
    return { tracks: next, instantDeath: true };
  }

  if (hpBefore <= 0) {
    next.failures = Math.min(3, next.failures + (critical ? 2 : 1));
    // Being hit while stable puts you back to dying.
    next.stable = false;
  }
  return { tracks: next, instantDeath: false };
}

/** Healing above 0 ends the dying entirely — conscious, and off both tracks. */
export function clearDying(): DeathTracks {
  return { successes: 0, failures: 0, stable: false };
}
