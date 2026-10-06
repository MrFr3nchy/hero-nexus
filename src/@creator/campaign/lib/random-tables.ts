/**
 * Random tables — the pure half.
 *
 * A random table is rolled on one die the DM picks — d4 to d100 — and each
 * entry owns a run of that die's faces, written the way printed tables write
 * them: `01–03 The bridge is out`, `04 A peddler`, `05–00 Nothing`. Ranges
 * may leave a face uncovered (it lands on nothing, and says so) but may
 * never overlap: one face, at most one entry.
 *
 * Tables written before ranges (0068) stored a weight per entry; they read
 * as contiguous runs from 1, on a die the size of their total.
 *
 * Always "random table", never "table": a table is the people playing
 * (`docs/naming.md`).
 *
 * Pure: no React, no server, no database.
 */

/** The dice a random table can be rolled on. */
export const RANDOM_TABLE_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export interface RandomTableEntry {
  text: string;
  /** First face, inclusive. */
  from: number;
  /** Last face, inclusive. */
  to: number;
}

export interface RandomTableRow {
  id: string;
  title: string;
  /** Faces on the die: 4, 6, 8, 10, 12, 20 or 100 (or an older table's total). */
  die: number;
  entries: RandomTableEntry[];
  updatedAt: string;
}

export const MAX_ENTRIES = 200;
export const MAX_ENTRY_TEXT = 300;
export const MAX_TITLE = 80;
/** The largest die an old weighted table can have grown to. */
const MAX_DIE = 1000;

export function isRandomTableDie(n: number): boolean {
  return (RANDOM_TABLE_DICE as readonly number[]).includes(n);
}

type Obj = Record<string, unknown>;
const int = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Coerce a stored or submitted random table into one that can be rolled.
 * Ranges are clamped to the die and sorted by where they start; an entry
 * with no text is dropped. Overlaps are left for {@link checkRanges} to
 * report, because which entry should give way is the DM's call.
 */
export function normalizeTable(
  rawDie: unknown,
  rawEntries: unknown
): { die: number; entries: RandomTableEntry[] } {
  const list = (Array.isArray(rawEntries) ? rawEntries : [])
    .slice(0, MAX_ENTRIES)
    .filter((r): r is Obj => Boolean(r) && typeof r === 'object')
    .map(
      r =>
        ({
          ...r,
          text: typeof r.text === 'string' ? r.text.trim() : '',
        }) as Obj & { text: string }
    )
    .filter(r => r.text);

  const legacy = list.length > 0 && list.every(r => r.from === undefined);
  if (legacy) {
    // 0068: `{ text, weight }`, contiguous from 1.
    let at = 1;
    const entries = list.map(r => {
      const w = Math.max(1, Math.min(100, int(r.weight) ?? 1));
      const e = {
        text: r.text.slice(0, MAX_ENTRY_TEXT),
        from: at,
        to: at + w - 1,
      };
      at += w;
      return e;
    });
    const total = Math.max(2, Math.min(MAX_DIE, at - 1));
    const asked = int(rawDie) ?? 0;
    const die = isRandomTableDie(asked) ? asked : total;
    return { die, entries: clampTo(die, entries) };
  }

  const asked = int(rawDie) ?? 0;
  const highest = list.reduce((m, r) => Math.max(m, int(r.to) ?? 0), 0);
  const die =
    isRandomTableDie(asked) || (asked >= 2 && asked <= MAX_DIE)
      ? asked
      : (RANDOM_TABLE_DICE.find(d => d >= highest) ?? 100);
  const entries = list.map(r => {
    let from = int(r.from) ?? 1;
    let to = int(r.to) ?? from;
    if (to < from) [from, to] = [to, from];
    return { text: r.text.slice(0, MAX_ENTRY_TEXT), from, to };
  });
  return { die, entries: clampTo(die, entries) };
}

function clampTo(die: number, entries: RandomTableEntry[]): RandomTableEntry[] {
  return entries
    .map(e => ({
      ...e,
      from: Math.max(1, Math.min(die, e.from)),
      to: Math.max(1, Math.min(die, e.to)),
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * What is wrong with a set of ranges. `overlaps` blocks saving — a face
 * cannot mean two things; `gaps` is advice — faces that land on nothing.
 */
export function checkRanges(
  die: number,
  entries: readonly RandomTableEntry[]
): { overlaps: string[]; gaps: { from: number; to: number }[] } {
  const sorted = [...entries].sort((a, b) => a.from - b.from);
  const overlaps: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.from <= prev.to) {
      overlaps.push(
        `${rangeLabel(die, prev)} and ${rangeLabel(die, cur)} share ${faceLabel(die, cur.from)}`
      );
    }
  }
  const covered = new Array(die + 1).fill(false);
  for (const e of entries)
    for (let f = e.from; f <= e.to; f++) covered[f] = true;
  const gaps: { from: number; to: number }[] = [];
  for (let f = 1; f <= die; f++) {
    if (covered[f]) continue;
    const last = gaps[gaps.length - 1];
    if (last && last.to === f - 1) last.to = f;
    else gaps.push({ from: f, to: f });
  }
  return { overlaps, gaps };
}

/**
 * Share the die's faces among entries, in order, in proportion to their
 * weights (all 1 for "evenly"). Every entry gets at least one face while
 * there are faces to give; the remainders go to the largest fractions.
 */
export function spreadFaces(
  die: number,
  weights: readonly number[]
): { from: number; to: number }[] {
  const n = weights.length;
  if (n === 0) return [];
  const w = weights.map(x => Math.max(1, x));
  const total = w.reduce((a, b) => a + b, 0);
  const minEach = die >= n ? 1 : 0;
  const pool = die - minEach * n;
  const exact = w.map(x => (x / total) * pool);
  const counts = exact.map(x => Math.floor(x) + minEach);
  let left = die - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) counts[order[k].i] += 1;
  let at = 1;
  return counts.map(c => {
    const r = { from: at, to: Math.max(at, at + c - 1) };
    at += c;
    return r;
  });
}

/**
 * Read a pasted list, one entry per line. A line may start with its faces —
 * `01-03 Rain`, `4: Fog`, `05–00. Clear` (`00` is 100 on a d100) — and then
 * every line must, and the ranges are kept. Otherwise the lines share the
 * die evenly, a leading `3x ` making one three times as likely.
 */
export function parseBulkEntries(
  text: string,
  die: number
): RandomTableEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, MAX_ENTRIES);
  const face = (s: string) => {
    const n = Number(s);
    return die === 100 && s === '00' ? 100 : n;
  };
  const ranged = lines.map(l =>
    /^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*[:.)]?\s+(.+)$/.exec(l)
  );
  if (ranged.every(Boolean)) {
    return normalizeTable(
      die,
      ranged.map(m => ({
        text: m![3],
        from: face(m![1]),
        to: face(m![2] ?? m![1]),
      }))
    ).entries;
  }
  const weighted = lines.map(l => {
    const m = /^(\d{1,3})\s*[x×]\s+(.+)$/i.exec(l);
    return m ? { text: m[2], weight: Number(m[1]) } : { text: l, weight: 1 };
  });
  const ranges = spreadFaces(
    die,
    weighted.map(e => e.weight)
  );
  return weighted.map((e, i) => ({
    text: e.text.slice(0, MAX_ENTRY_TEXT),
    ...ranges[i],
  }));
}

/** Back to the pasteable form, with its faces. */
export function formatBulkEntries(
  die: number,
  entries: readonly RandomTableEntry[]
): string {
  return entries.map(e => `${rangeLabel(die, e)} ${e.text}`).join('\n');
}

/** A face as printed: on a d100 two digits, with 100 written `00`. */
export function faceLabel(die: number, n: number): string {
  if (die !== 100) return String(n);
  return n === 100 ? '00' : String(n).padStart(2, '0');
}

/** `01–03`, `04`, `05–00`. */
export function rangeLabel(
  die: number,
  e: Pick<RandomTableEntry, 'from' | 'to'>
): string {
  return e.from === e.to
    ? faceLabel(die, e.from)
    : `${faceLabel(die, e.from)}–${faceLabel(die, e.to)}`;
}

export function dieNotation(die: number): string {
  return `1d${die}`;
}

/** The entry a face lands on, or null for a face no entry covers. */
export function entryForFace(
  entries: readonly RandomTableEntry[],
  face: number
): { entry: RandomTableEntry; index: number } | null {
  const index = entries.findIndex(e => face >= e.from && face <= e.to);
  return index < 0 ? null : { entry: entries[index], index };
}

/** How a result reads in the log, which keeps 80 characters of it. */
export function rollLabel(title: string, entry: string, max = 80): string {
  const full = `${title || 'Random table'}: ${entry}`;
  return full.length <= max ? full : `${full.slice(0, max - 1)}…`;
}
