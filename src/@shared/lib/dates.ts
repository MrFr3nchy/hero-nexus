/**
 * Calendar dates — the kind a table writes on a calendar, with no time and no
 * timezone.
 *
 * `new Date('2026-09-10')` parses as midnight **UTC**, so west of Greenwich it
 * renders as the 9th: a session planned for Thursday shows up as Wednesday.
 * Everything here treats a bare `YYYY-MM-DD` as a local calendar day instead,
 * which is what it means when someone types it into a date field.
 *
 * Pure — no React, no DB. Used by anything that shows a session date.
 */

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a stored date. Bare calendar dates are local; timestamps are as given. */
export function parseCalendarDate(
  value: string | null | undefined
): Date | null {
  if (!value) return null;
  const match = CALENDAR_DATE.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Render a stored date, or `fallback` when there isn't one. */
export function formatCalendarDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  },
  fallback = 'no date yet'
): string {
  const date = parseCalendarDate(value);
  return date ? date.toLocaleDateString(undefined, options) : fallback;
}

/** The value a `<input type="date">` wants: `YYYY-MM-DD` in local terms. */
export function toDateInputValue(value: string | null | undefined): string {
  const date = parseCalendarDate(value);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * How far off a date is, in the words a table would use. Null when there is no
 * readable date to count towards.
 */
export function countdownWords(
  value: string | null | undefined
): string | null {
  const date = parseCalendarDate(value);
  if (!date) return null;
  const days = Math.round(
    (new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
      86400000
  );
  if (days < 0) return 'overdue';
  if (days === 0) return 'tonight';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
