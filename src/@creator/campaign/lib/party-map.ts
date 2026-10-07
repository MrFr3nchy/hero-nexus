/**
 * The party's map — the pure half.
 *
 * A canon map is a picture with marks on it. Marks, the journey and fog of
 * war are all stored as fractions of the picture, so they land in the same
 * place on the DM's monitor and a player's phone; this module is the maths
 * and the vocabulary both sides share.
 *
 * Words (`docs/naming.md`): a **mark** is a named point on a map ("marker"
 * is reserved — it is what a ping is never called); the **journey** is the
 * party's route, a run of numbered **stops**; **fog of war** is the same
 * thing it is on a battle board.
 *
 * Pure: no React, no server, no database.
 */
import type { GlyphName } from '@/@shared/components/ui/Glyph';

export const MARK_KINDS = [
  'place',
  'danger',
  'treasure',
  'rumour',
  'camp',
  'note',
] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export const MARK_KIND_META: Record<
  MarkKind,
  { label: string; glyph: GlyphName; hint: string }
> = {
  place: { label: 'Place', glyph: 'compass', hint: 'Somewhere worth a name.' },
  danger: { label: 'Danger', glyph: 'sword', hint: 'Somewhere to avoid.' },
  treasure: {
    label: 'Treasure',
    glyph: 'chest',
    hint: 'Something to come back for.',
  },
  rumour: { label: 'Rumour', glyph: 'whisper', hint: 'Somebody said so.' },
  camp: { label: 'Camp', glyph: 'tankard', hint: 'Somewhere safe to rest.' },
  note: { label: 'Note', glyph: 'quill', hint: 'Anything else.' },
};

export function isMarkKind(v: unknown): v is MarkKind {
  return (MARK_KINDS as readonly unknown[]).includes(v);
}

/** Fractions of the picture: anything outside is a mark nobody can see. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/* --- fog of war ------------------------------------------------------------ */

/**
 * The fog lattice: FOG_COLS × FOG_ROWS cells over the picture, whatever its
 * shape. Coarse on purpose — a map is revealed a region at a time, not a
 * pixel at a time, and 1,536 cells store as a short list.
 */
export const FOG_COLS = 48;
export const FOG_ROWS = 32;
export const FOG_CELLS = FOG_COLS * FOG_ROWS;

/** The cell a point of the picture lies in. */
export function cellAt(x: number, y: number): number {
  const c = Math.min(FOG_COLS - 1, Math.floor(clamp01(x) * FOG_COLS));
  const r = Math.min(FOG_ROWS - 1, Math.floor(clamp01(y) * FOG_ROWS));
  return r * FOG_COLS + c;
}

/** A stored revealed list, cleaned: whole cells, on the lattice, once each. */
export function normalizeRevealed(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n < FOG_CELLS) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The cells a round brush covers. `radius` is a fraction of the picture's
 * width; `aspect` is height ÷ width, so the brush is round on the picture
 * rather than round on the lattice.
 */
export function cellsInBrush(
  x: number,
  y: number,
  radius: number,
  aspect: number
): number[] {
  const out: number[] = [];
  const a = aspect > 0 ? aspect : 1;
  for (let r = 0; r < FOG_ROWS; r++) {
    for (let c = 0; c < FOG_COLS; c++) {
      // The cell's centre, in picture-width units both ways.
      const cx = (c + 0.5) / FOG_COLS;
      const cy = ((r + 0.5) / FOG_ROWS) * a;
      if (Math.hypot(cx - x, cy - y * a) <= radius) out.push(r * FOG_COLS + c);
    }
  }
  // Never nothing: a tap reveals at least the cell under it.
  return out.length > 0 ? out : [cellAt(x, y)];
}

/**
 * Runs of fogged cells per row, for drawing: `{ row, from, to }` with `to`
 * exclusive. One rectangle per run rather than per cell.
 */
export function fogRuns(
  revealed: ReadonlySet<number>
): { row: number; from: number; to: number }[] {
  const runs: { row: number; from: number; to: number }[] = [];
  for (let r = 0; r < FOG_ROWS; r++) {
    let start = -1;
    for (let c = 0; c <= FOG_COLS; c++) {
      const fog = c < FOG_COLS && !revealed.has(r * FOG_COLS + c);
      if (fog && start < 0) start = c;
      if (!fog && start >= 0) {
        runs.push({ row: r, from: start, to: c });
        start = -1;
      }
    }
  }
  return runs;
}

/* --- the journey ------------------------------------------------------------ */

export interface JourneyStop {
  id: string;
  /** 1, 2, 3… in the order the party went. 0 while planned. */
  seq: number;
  /** Not reached yet: where the party is headed. */
  planned: boolean;
  /** A planned stop is the DM's until shown; a reached one is the party's. */
  visibility: 'dm' | 'shared';
  x: number;
  y: number;
  label: string;
  pinId: string | null;
  sessionId: string | null;
  /** "Session 7 · The bridge", when the stop was reached in one. */
  sessionLabel: string | null;
  /** The world's date, already written out, when the table was counting. */
  worldDate: string | null;
  createdAt: string;
}

/** The stops the party has actually reached, in order. */
export function reachedStops(stops: readonly JourneyStop[]): JourneyStop[] {
  return stops.filter(s => !s.planned).sort((a, b) => a.seq - b.seq);
}

/** Where the party is headed, in the order the DM planned them. */
export function plannedStops(stops: readonly JourneyStop[]): JourneyStop[] {
  return stops
    .filter(s => s.planned)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The reached stops up to and including `upTo` (a seq), in order. */
export function journeyUpTo(
  stops: readonly JourneyStop[],
  upTo: number
): JourneyStop[] {
  return reachedStops(stops).filter(s => s.seq <= upTo);
}

/** The SVG polyline points for a run of stops, in a 0–100 box. */
export function trailPoints(
  stops: readonly Pick<JourneyStop, 'x' | 'y'>[]
): string {
  return stops.map(s => `${s.x * 100},${s.y * 100}`).join(' ');
}

/** "Stop 3 of 7 · Session 4 · 12th of Mirtul". */
export function stopLine(stop: JourneyStop, of: number): string {
  return [`Stop ${stop.seq} of ${of}`, stop.sessionLabel, stop.worldDate]
    .filter(Boolean)
    .join(' · ');
}
