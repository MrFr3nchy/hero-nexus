/**
 * The world's clock — a calendar the DM owns, and a moment on it.
 *
 * Pure: no React, no db, no `server-only`. `src/server/world-time.ts` is the
 * only writer of a campaign's `world_time`; this file is how everybody reads
 * it, and how the writer moves it. The same shape as `table-rules.ts`: the
 * definition lives in the campaign's settings blob (no migration to add a
 * month), the current moment on the campaign row.
 *
 * A calendar is a list of months, each with a length, a week of named days,
 * and a day of so many hours. That is enough for the Gregorian year, for
 * Harptos (ten-day weeks, thirty-day months, festival days between them as
 * one-day months), and for anything a DM makes up. Weekdays cycle over every
 * day of the year, festival days included — the simple rule — and a month of
 * zero days is allowed so a DM can drop a festival without renumbering the
 * rest.
 */

export interface CalendarMonth {
  name: string;
  /** Days in the month. Zero is a month the year skips over. */
  days: number;
}

export interface CalendarMoon {
  name: string;
  /** Days from full to full. */
  cycleDays: number;
  /** Day-of-epoch offset of the first full moon, so a DM can line it up. */
  offset: number;
}

export interface CalendarDef {
  name: string;
  months: CalendarMonth[];
  weekdays: string[];
  hoursPerDay: number;
  /** "DR", "AC", or nothing. Follows the year. */
  epochLabel: string;
  moons?: CalendarMoon[];
}

/** A moment. `month` and `day` are 1-based; `minute` is minutes into the day. */
export interface WorldTime {
  year: number;
  month: number;
  day: number;
  minute: number;
}

export const MAX_MONTHS = 24;
export const MAX_WEEKDAYS = 14;
export const MAX_MOONS = 4;
export const MAX_MONTH_DAYS = 400;

const GREGORIAN_MONTHS: CalendarMonth[] = [
  ['January', 31],
  ['February', 28],
  ['March', 31],
  ['April', 30],
  ['May', 31],
  ['June', 30],
  ['July', 31],
  ['August', 31],
  ['September', 30],
  ['October', 31],
  ['November', 30],
  ['December', 31],
].map(([name, days]) => ({ name: name as string, days: days as number }));

/** The default: twelve months, a seven-day week, no leap years. */
export const GREGORIAN_LIKE: CalendarDef = {
  name: 'Common',
  months: GREGORIAN_MONTHS,
  weekdays: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  hoursPerDay: 24,
  epochLabel: '',
  moons: [{ name: 'The moon', cycleDays: 30, offset: 0 }],
};

const harptosMonth = (name: string): CalendarMonth => ({ name, days: 30 });
const festival = (name: string): CalendarMonth => ({ name, days: 1 });

/**
 * The Forgotten Realms' year, near enough: twelve thirty-day months, five
 * festival days between them, ten-day weeks. Shieldmeet, the leap day, is
 * left out — a DM who wants it adds a one-day month after Midsummer.
 */
export const HARPTOS_LIKE: CalendarDef = {
  name: 'Harptos',
  months: [
    harptosMonth('Hammer'),
    festival('Midwinter'),
    harptosMonth('Alturiak'),
    harptosMonth('Ches'),
    harptosMonth('Tarsakh'),
    festival('Greengrass'),
    harptosMonth('Mirtul'),
    harptosMonth('Kythorn'),
    harptosMonth('Flamerule'),
    festival('Midsummer'),
    harptosMonth('Eleasis'),
    harptosMonth('Eleint'),
    festival('Highharvestide'),
    harptosMonth('Marpenoth'),
    harptosMonth('Uktar'),
    festival('The Feast of the Moon'),
    harptosMonth('Nightal'),
  ],
  weekdays: [
    'First-day',
    'Second-day',
    'Third-day',
    'Fourth-day',
    'Fifth-day',
    'Sixth-day',
    'Seventh-day',
    'Eighth-day',
    'Ninth-day',
    'Tenth-day',
  ],
  hoursPerDay: 24,
  epochLabel: 'DR',
  moons: [{ name: 'Selûne', cycleDays: 30, offset: 0 }],
};

export interface CalendarPreset {
  key: string;
  label: string;
  line: string;
  def: CalendarDef;
}

/** What the manage page offers. `custom` is whatever the DM has typed. */
export const CALENDAR_PRESETS: readonly CalendarPreset[] = [
  {
    key: 'gregorian',
    label: 'Common',
    line: 'Twelve months, a seven-day week, 24 hours. No leap years.',
    def: GREGORIAN_LIKE,
  },
  {
    key: 'harptos',
    label: 'Harptos',
    line: 'Thirty-day months, five festival days, ten-day weeks. Dale Reckoning.',
    def: HARPTOS_LIKE,
  },
];

/** The year a fresh clock starts counting from, when the DM sets none. */
export const DEFAULT_YEAR = 1;

/* --- reading ------------------------------------------------------------- */

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' ? Math.trunc(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

const cleanName = (v: unknown, fallback: string, max = 60): string => {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().slice(0, max);
  return s || fallback;
};

/**
 * Fold a stored (possibly partial, possibly garbage) definition over the
 * default, one field at a time — a bad month costs that month its length,
 * not the campaign its calendar. A calendar with no month or no weekday
 * falls back whole: nothing below can count on an empty list.
 */
export function normalizeCalendar(raw: unknown): CalendarDef {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const months = Array.isArray(obj.months)
    ? obj.months
        .slice(0, MAX_MONTHS)
        .map((m, i) => {
          const mm =
            m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
          return {
            name: cleanName(mm.name, `Month ${i + 1}`),
            days: clampInt(mm.days, 0, MAX_MONTH_DAYS, 30),
          };
        })
        .filter(m => m.name)
    : GREGORIAN_LIKE.months;
  const weekdays = Array.isArray(obj.weekdays)
    ? obj.weekdays
        .slice(0, MAX_WEEKDAYS)
        .map((w, i) => cleanName(w, `Day ${i + 1}`, 30))
    : GREGORIAN_LIKE.weekdays;
  const moons = Array.isArray(obj.moons)
    ? obj.moons.slice(0, MAX_MOONS).map((m, i) => {
        const mm =
          m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
        return {
          name: cleanName(mm.name, i === 0 ? 'The moon' : `Moon ${i + 1}`),
          cycleDays: clampInt(mm.cycleDays, 2, 1000, 30),
          offset: clampInt(mm.offset, 0, 1000, 0),
        };
      })
    : (GREGORIAN_LIKE.moons ?? []);
  const def: CalendarDef = {
    name: cleanName(obj.name, GREGORIAN_LIKE.name),
    months: months.length > 0 ? months : GREGORIAN_LIKE.months,
    weekdays: weekdays.length > 0 ? weekdays : GREGORIAN_LIKE.weekdays,
    hoursPerDay: clampInt(obj.hoursPerDay, 1, 100, 24),
    epochLabel:
      typeof obj.epochLabel === 'string'
        ? obj.epochLabel.trim().slice(0, 12)
        : '',
    moons,
  };
  // A year of no days at all cannot be advanced through.
  if (daysInYear(def) === 0) return { ...def, months: GREGORIAN_LIKE.months };
  return def;
}

/** A stored moment, checked against the calendar it is read under. */
export function normalizeWorldTime(
  def: CalendarDef,
  raw: unknown
): WorldTime | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const year = clampInt(obj.year, -100_000, 100_000, Number.NaN);
  if (!Number.isFinite(year)) return null;
  const minutesPerDay = def.hoursPerDay * 60;
  const t: WorldTime = {
    year,
    month: clampInt(obj.month, 1, def.months.length, 1),
    day: 1,
    minute: clampInt(obj.minute, 0, minutesPerDay - 1, 0),
  };
  // A day past the end of its month (the calendar shrank) folds forward,
  // which is what the arithmetic below does with any out-of-range day.
  const day = clampInt(obj.day, 1, MAX_MONTH_DAYS, 1);
  return fromOrdinal(def, ordinalOf(def, { ...t, day }), t.minute);
}

/** The first moment of year one — where a table starts counting. */
export function startOfTime(def: CalendarDef, year = DEFAULT_YEAR): WorldTime {
  return fromOrdinal(def, (year - 1) * daysInYear(def), dawnMinute(def));
}

/* --- arithmetic ----------------------------------------------------------- */

export function daysInYear(def: CalendarDef): number {
  return def.months.reduce((n, m) => n + m.days, 0);
}

/**
 * Days since the first day of year 1, day 0. Negative years count back.
 * A day past its month's end is carried into the following months.
 */
export function ordinalOf(def: CalendarDef, t: WorldTime): number {
  let n = (t.year - 1) * daysInYear(def);
  for (let i = 0; i < t.month - 1 && i < def.months.length; i++) {
    n += def.months[i].days;
  }
  return n + (t.day - 1);
}

function fromOrdinal(
  def: CalendarDef,
  ordinal: number,
  minute: number
): WorldTime {
  const perYear = daysInYear(def);
  const year = Math.floor(ordinal / perYear) + 1;
  let rest = ordinal - (year - 1) * perYear;
  let month = 1;
  for (let i = 0; i < def.months.length; i++) {
    // A zero-day month is never landed on; the day passes straight through.
    if (rest < def.months[i].days) {
      month = i + 1;
      break;
    }
    rest -= def.months[i].days;
    month = i + 2;
  }
  return { year, month, day: rest + 1, minute };
}

/** Move a moment by so many minutes, forwards or back. */
export function advance(
  def: CalendarDef,
  t: WorldTime,
  minutes: number
): WorldTime {
  const perDay = def.hoursPerDay * 60;
  const total = ordinalOf(def, t) * perDay + t.minute + Math.trunc(minutes);
  const ordinal = Math.floor(total / perDay);
  const minute = total - ordinal * perDay;
  return fromOrdinal(def, ordinal, minute);
}

/** Whole days from `a` to `b`, by the day ordinal: negative when b is earlier. */
export function daysBetween(
  def: CalendarDef,
  a: WorldTime,
  b: WorldTime
): number {
  return ordinalOf(def, b) - ordinalOf(def, a);
}

/** Whole day boundaries crossed moving from `a` to `b`. Never negative. */
export function daysCrossed(
  def: CalendarDef,
  a: WorldTime,
  b: WorldTime
): number {
  return Math.max(0, daysBetween(def, a, b));
}

export function weekday(def: CalendarDef, t: WorldTime): string {
  const n = ordinalOf(def, t);
  const len = def.weekdays.length;
  return def.weekdays[((n % len) + len) % len];
}

/** Dawn is a quarter of the way into the day; dusk three quarters. */
export function dawnMinute(def: CalendarDef): number {
  return Math.round((def.hoursPerDay * 60) / 4);
}
export function duskMinute(def: CalendarDef): number {
  return Math.round((def.hoursPerDay * 60 * 3) / 4);
}

/** Minutes until the next time the clock reads `minute` — tomorrow's if passed. */
export function minutesUntil(
  def: CalendarDef,
  t: WorldTime,
  minute: number
): number {
  const perDay = def.hoursPerDay * 60;
  const delta = minute - t.minute;
  return delta > 0 ? delta : delta + perDay;
}

/* --- words ---------------------------------------------------------------- */

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "Dawn", "Morning", "Midday" … from where in the day the minute falls. */
export function timeOfDay(def: CalendarDef, t: WorldTime): string {
  const frac = t.minute / (def.hoursPerDay * 60);
  const dawn = dawnMinute(def);
  const dusk = duskMinute(def);
  if (Math.abs(t.minute - dawn) < 30) return 'Dawn';
  if (Math.abs(t.minute - dusk) < 30) return 'Dusk';
  if (frac < 0.125) return 'The small hours';
  if (t.minute < dawn) return 'Before dawn';
  if (frac < 0.45) return 'Morning';
  if (frac < 0.55) return 'Midday';
  if (t.minute < dusk) return 'Afternoon';
  if (frac < 0.9) return 'Evening';
  return 'Night';
}

/** "06:10" on the clock. Hours are as long as the calendar says they are. */
export function clock(def: CalendarDef, t: WorldTime): string {
  const h = Math.floor(t.minute / 60) % Math.max(1, def.hoursPerDay);
  const m = t.minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * One line, three ways. A festival day (a one-day month) reads by its name
 * alone — "Midsummer, 1492 DR" — because "1st of Midsummer" is not a thing
 * anybody says.
 */
export function format(
  def: CalendarDef,
  t: WorldTime,
  style: 'date' | 'datetime' | 'weekday' | 'short'
): string {
  const month = def.months[t.month - 1] ?? def.months[0];
  const year = `${t.year}${def.epochLabel ? ` ${def.epochLabel}` : ''}`;
  const dayPart =
    month.days === 1 ? month.name : `${ordinal(t.day)} of ${month.name}`;
  switch (style) {
    case 'date':
      return `${dayPart}, ${year}`;
    case 'short':
      return dayPart;
    case 'weekday':
      return weekday(def, t);
    case 'datetime':
      return `${clock(def, t)}, ${dayPart}, ${year}`;
  }
}

/** "Dawn, 3rd of Mirtul" — what the `time` event says. */
export function moment(def: CalendarDef, t: WorldTime): string {
  return `${timeOfDay(def, t)}, ${format(def, t, 'short')}`;
}

/** Where a moon is in its cycle, as a word. */
export function moonPhase(moon: CalendarMoon, ordinalDay: number): string {
  const into =
    (((ordinalDay - moon.offset) % moon.cycleDays) + moon.cycleDays) %
    moon.cycleDays;
  const frac = into / moon.cycleDays;
  if (frac < 0.0625 || frac >= 0.9375) return 'full';
  if (frac < 0.1875) return 'waning gibbous';
  if (frac < 0.3125) return 'last quarter';
  if (frac < 0.4375) return 'waning crescent';
  if (frac < 0.5625) return 'new';
  if (frac < 0.6875) return 'waxing crescent';
  if (frac < 0.8125) return 'first quarter';
  return 'waxing gibbous';
}

/** "3 hours", "a day", "10 minutes" — for the log line an advance writes. */
export function describeMinutes(minutes: number, def?: CalendarDef): string {
  const m = Math.abs(Math.trunc(minutes));
  const perDay = (def?.hoursPerDay ?? 24) * 60;
  if (m === 0) return 'no time';
  if (m % perDay === 0) {
    const d = m / perDay;
    return d === 1 ? 'a day' : `${d} days`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? 'an hour' : `${h} hours`;
  }
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * The DM's clock control, in order. `minutes` is fixed; the dawn and dusk
 * entries are computed at press time from where the clock stands.
 */
export type ClockStep =
  | { key: string; label: string; minutes: number }
  | { key: 'dawn' | 'dusk'; label: string; to: 'dawn' | 'dusk' };

export const CLOCK_STEPS: readonly ClockStep[] = [
  { key: '10m', label: '+10 minutes', minutes: 10 },
  { key: '1h', label: '+1 hour', minutes: 60 },
  { key: '8h', label: '+8 hours', minutes: 8 * 60 },
  { key: 'dawn', label: 'To dawn', to: 'dawn' },
  { key: 'dusk', label: 'To dusk', to: 'dusk' },
  { key: '1d', label: '+1 day', minutes: 24 * 60 },
];

/** Minutes a clock step moves the clock from `t`. */
export function stepMinutes(
  def: CalendarDef,
  t: WorldTime,
  step: ClockStep
): number {
  if ('minutes' in step) {
    // A day is a day of this calendar, not of ours.
    return step.key === '1d' ? def.hoursPerDay * 60 : step.minutes;
  }
  return minutesUntil(
    def,
    t,
    step.to === 'dawn' ? dawnMinute(def) : duskMinute(def)
  );
}

/* --- rests ------------------------------------------------------------------ */

/**
 * How long a rest takes at this table, in minutes. The book, then the two
 * 2014 DMG variants — the `rests` table rule from 01.
 */
export function restMinutes(
  kind: 'short' | 'long',
  rests: 'standard' | 'gritty' | 'heroic',
  def: CalendarDef = GREGORIAN_LIKE
): number {
  const day = def.hoursPerDay * 60;
  if (kind === 'short') {
    return rests === 'gritty' ? 8 * 60 : rests === 'heroic' ? 5 : 60;
  }
  return rests === 'gritty' ? 7 * day : rests === 'heroic' ? 60 : 8 * 60;
}
