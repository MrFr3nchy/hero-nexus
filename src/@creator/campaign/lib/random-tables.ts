/**
 * Random tables — the pure half.
 *
 * A random table is a list of entries, each with a weight. The die is the
 * total weight, and a face lands on the entry whose run of faces covers it:
 * `Rain ×3, Fog, Clear ×2` is a d6 where 1–3 is rain, 4 fog, 5–6 clear.
 * That covers the printed "d20 with ranges" table and the flat "d6" one.
 *
 * Always "random table", never "table": a table is the people playing
 * (`docs/naming.md`).
 *
 * Pure: no React, no server, no database.
 */

export interface RandomTableEntry {
  text: string;
  weight: number;
}

export interface RandomTableRow {
  id: string;
  title: string;
  entries: RandomTableEntry[];
  updatedAt: string;
}

export const MAX_ENTRIES = 200;
export const MAX_ENTRY_TEXT = 300;
export const MAX_WEIGHT = 100;
export const MAX_TITLE = 80;

/** Coerce stored or submitted entries into ones that can be rolled. */
export function normalizeEntries(raw: unknown): RandomTableEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RandomTableEntry[] = [];
  for (const r of raw.slice(0, MAX_ENTRIES)) {
    if (!r || typeof r !== 'object') continue;
    const e = r as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text.trim() : '';
    if (!text) continue;
    const w = Math.trunc(Number(e.weight));
    out.push({
      text: text.slice(0, MAX_ENTRY_TEXT),
      weight: Number.isFinite(w) ? Math.max(1, Math.min(MAX_WEIGHT, w)) : 1,
    });
  }
  return out;
}

/**
 * Read a pasted list: one entry per line, an optional `3x ` (or `3× `, or
 * `3 x `) in front for the weight. Blank lines are skipped, so pasting a
 * list straight out of a book just works.
 */
export function parseBulkEntries(text: string): RandomTableEntry[] {
  return normalizeEntries(
    text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const m = /^(\d{1,3})\s*[x×]\s+(.+)$/i.exec(line);
        return m
          ? { text: m[2], weight: Number(m[1]) }
          : { text: line, weight: 1 };
      })
  );
}

/** Back to the pasteable form, for editing. */
export function formatBulkEntries(entries: RandomTableEntry[]): string {
  return entries
    .map(e => (e.weight > 1 ? `${e.weight}x ${e.text}` : e.text))
    .join('\n');
}

/** How many faces the die has: the total weight. */
export function totalWeight(entries: RandomTableEntry[]): number {
  return entries.reduce((n, e) => n + e.weight, 0);
}

/** The notation to roll, or null for an empty random table. */
export function dieFor(entries: RandomTableEntry[]): string | null {
  const total = totalWeight(entries);
  return total >= 1 ? `1d${Math.max(2, total)}` : null;
}

/**
 * The entry a face lands on. A random table of one entry rolls a d2 (there
 * is no d1), and both faces land on it.
 */
export function entryForFace(
  entries: RandomTableEntry[],
  face: number
): { entry: RandomTableEntry; index: number } | null {
  if (entries.length === 0) return null;
  let upTo = 0;
  for (let i = 0; i < entries.length; i++) {
    upTo += entries[i].weight;
    if (face <= upTo) return { entry: entries[i], index: i };
  }
  return { entry: entries[entries.length - 1], index: entries.length - 1 };
}

/** "1–3", "4", "5–6": each entry's run of faces, for the printed view. */
export function faceRanges(entries: RandomTableEntry[]): string[] {
  let from = 1;
  return entries.map(e => {
    const to = from + e.weight - 1;
    const label = to === from ? `${from}` : `${from}–${to}`;
    from = to + 1;
    return label;
  });
}

/** How a result reads in the log, which keeps 80 characters of it. */
export function rollLabel(title: string, entry: string, max = 80): string {
  const full = `${title || 'Random table'}: ${entry}`;
  return full.length <= max ? full : `${full.slice(0, max - 1)}…`;
}
