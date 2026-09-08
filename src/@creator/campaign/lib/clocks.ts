/**
 * What a clock is allowed to be, as pure data.
 *
 * Its own module for the same reason `lib/conditions.ts` is one: the panel
 * that draws a clock needs the segment sizes, and importing them from
 * `@/server/clocks` would drag a `server-only` module into the client bundle.
 * No React, no database — safe on both sides of the wire.
 */

/**
 * A clock is read as a fraction at a glance, which stops being true somewhere
 * past twelve segments. These four are the sizes a table actually uses.
 */
export const CLOCK_SEGMENTS = [4, 6, 8, 12] as const;

export type ClockSegments = (typeof CLOCK_SEGMENTS)[number];

/** Anything unrecognised becomes the six-segment default rather than failing. */
export function normalizeSegments(value: number | undefined): ClockSegments {
  return CLOCK_SEGMENTS.find(s => s === value) ?? 6;
}
