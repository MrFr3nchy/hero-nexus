import { describe, expect, it } from 'vitest';

import {
  FOG_CELLS,
  FOG_COLS,
  FOG_ROWS,
  cellAt,
  cellsInBrush,
  fogRuns,
  isMarkKind,
  journeyUpTo,
  normalizeRevealed,
  plannedStops,
  reachedStops,
  stopLine,
  trailPoints,
  type JourneyStop,
} from './party-map';

const stop = (seq: number, over: Partial<JourneyStop> = {}): JourneyStop => ({
  id: `s${seq}`,
  seq,
  planned: false,
  visibility: 'shared',
  x: seq / 10,
  y: 0.5,
  label: '',
  pinId: null,
  sessionId: null,
  sessionLabel: null,
  worldDate: null,
  createdAt: '',
  ...over,
});

describe('the fog lattice', () => {
  it('finds the cell under a point, corners included', () => {
    expect(cellAt(0, 0)).toBe(0);
    expect(cellAt(1, 1)).toBe(FOG_CELLS - 1);
    expect(cellAt(0.5, 0)).toBe(FOG_COLS / 2);
    expect(cellAt(-3, 7)).toBe((FOG_ROWS - 1) * FOG_COLS);
  });

  it('cleans a stored list', () => {
    expect(normalizeRevealed([5, 5, '3', -1, 1.5, FOG_CELLS, 0])).toEqual([
      0, 3, 5,
    ]);
    expect(normalizeRevealed('nope')).toEqual([]);
  });

  it('a brush is round on the picture and never empty', () => {
    const tiny = cellsInBrush(0.5, 0.5, 0.0001, 1);
    expect(tiny).toEqual([cellAt(0.5, 0.5)]);
    const wide = cellsInBrush(0.5, 0.5, 0.1, 0.5);
    // On a wide picture (h = w/2) a round brush spans more rows than columns
    // of the lattice, because a row is shorter than a column is wide.
    const rows = new Set(wide.map(i => Math.floor(i / FOG_COLS)));
    const cols = new Set(wide.map(i => i % FOG_COLS));
    expect(rows.size).toBeGreaterThan(cols.size / 2);
    expect(wide).toContain(cellAt(0.5, 0.5));
  });

  it('draws fog as one run per gap in a row', () => {
    const revealed = new Set([2, 3, FOG_COLS + 0]);
    const runs = fogRuns(revealed);
    expect(runs[0]).toEqual({ row: 0, from: 0, to: 2 });
    expect(runs[1]).toEqual({ row: 0, from: 4, to: FOG_COLS });
    expect(runs[2]).toEqual({ row: 1, from: 1, to: FOG_COLS });
    expect(
      fogRuns(new Set(Array.from({ length: FOG_CELLS }, (_, i) => i)))
    ).toEqual([]);
  });
});

describe('the journey', () => {
  it('replays up to a stop, in order', () => {
    const stops = [stop(3), stop(1), stop(2)];
    expect(journeyUpTo(stops, 2).map(s => s.seq)).toEqual([1, 2]);
    expect(trailPoints(journeyUpTo(stops, 2))).toBe('10,50 20,50');
  });

  it('leaves planned stops off the route until they are reached', () => {
    const stops = [
      stop(1),
      stop(0, { id: 'p2', planned: true, createdAt: '2026-02' }),
      stop(2),
      stop(0, { id: 'p1', planned: true, createdAt: '2026-01' }),
    ];
    expect(journeyUpTo(stops, 99).map(s => s.id)).toEqual(['s1', 's2']);
    expect(reachedStops(stops)).toHaveLength(2);
    expect(plannedStops(stops).map(s => s.id)).toEqual(['p1', 'p2']);
  });

  it('says where and when a stop was', () => {
    expect(
      stopLine(
        stop(3, { sessionLabel: 'Session 4', worldDate: '12th of Mirtul' }),
        7
      )
    ).toBe('Stop 3 of 7 · Session 4 · 12th of Mirtul');
    expect(stopLine(stop(1), 1)).toBe('Stop 1 of 1');
  });

  it('knows the mark kinds', () => {
    expect(isMarkKind('rumour')).toBe(true);
    expect(isMarkKind('marker')).toBe(false);
  });
});
