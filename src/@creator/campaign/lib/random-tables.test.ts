import { describe, expect, it } from 'vitest';

import {
  checkRanges,
  entryForFace,
  faceLabel,
  formatBulkEntries,
  normalizeTable,
  parseBulkEntries,
  rangeLabel,
  rollLabel,
  spreadFaces,
} from './random-tables';

const weather = [
  { text: 'Rain', from: 1, to: 3 },
  { text: 'Fog', from: 4, to: 4 },
  { text: 'Clear', from: 5, to: 6 },
];

describe('faces as printed', () => {
  it('writes a d100 as two digits with 100 as 00', () => {
    expect(faceLabel(100, 3)).toBe('03');
    expect(faceLabel(100, 100)).toBe('00');
    expect(faceLabel(20, 3)).toBe('3');
    expect(rangeLabel(100, { from: 1, to: 3 })).toBe('01–03');
    expect(rangeLabel(100, { from: 51, to: 100 })).toBe('51–00');
    expect(rangeLabel(6, { from: 4, to: 4 })).toBe('4');
  });
});

describe('parseBulkEntries', () => {
  it('keeps ranges when every line has them, 00 meaning 100', () => {
    expect(
      parseBulkEntries(
        '01-03 The bridge is out\n04–10: A peddler\n11. A storm\n12-00 Nothing',
        100
      )
    ).toEqual([
      { text: 'The bridge is out', from: 1, to: 3 },
      { text: 'A peddler', from: 4, to: 10 },
      { text: 'A storm', from: 11, to: 11 },
      { text: 'Nothing', from: 12, to: 100 },
    ]);
  });

  it('shares the die out when the numbers are left off', () => {
    expect(parseBulkEntries('Rain\nFog\nClear', 6)).toEqual([
      { text: 'Rain', from: 1, to: 2 },
      { text: 'Fog', from: 3, to: 4 },
      { text: 'Clear', from: 5, to: 6 },
    ]);
    expect(parseBulkEntries('3x Rain\nFog\n2x Clear', 6)).toEqual(weather);
  });

  it('round-trips through the pasteable form', () => {
    const text = formatBulkEntries(6, weather);
    expect(text).toBe('1–3 Rain\n4 Fog\n5–6 Clear');
    expect(parseBulkEntries(text, 6)).toEqual(weather);
  });
});

describe('spreadFaces', () => {
  it('covers the die exactly, every entry at least one face', () => {
    const r = spreadFaces(20, [1, 1, 1]);
    expect(r[0].from).toBe(1);
    expect(r[2].to).toBe(20);
    for (let i = 1; i < r.length; i++) expect(r[i].from).toBe(r[i - 1].to + 1);
    expect(spreadFaces(4, [10, 1, 1, 1])).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 2 },
      { from: 3, to: 3 },
      { from: 4, to: 4 },
    ]);
  });

  it('stretches a table to a bigger die in proportion', () => {
    expect(spreadFaces(100, [10, 10])).toEqual([
      { from: 1, to: 50 },
      { from: 51, to: 100 },
    ]);
  });
});

describe('checkRanges', () => {
  it('reports overlaps, which block saving', () => {
    const { overlaps } = checkRanges(20, [
      { text: 'A', from: 1, to: 5 },
      { text: 'B', from: 5, to: 9 },
    ]);
    expect(overlaps).toEqual(['1–5 and 5–9 share 5']);
  });

  it('reports gaps, which are allowed', () => {
    expect(
      checkRanges(10, [
        { text: 'A', from: 1, to: 3 },
        { text: 'B', from: 6, to: 8 },
      ]).gaps
    ).toEqual([
      { from: 4, to: 5 },
      { from: 9, to: 10 },
    ]);
    expect(checkRanges(6, weather)).toEqual({ overlaps: [], gaps: [] });
  });
});

describe('normalizeTable', () => {
  it('reads a table from before dice as contiguous runs', () => {
    expect(
      normalizeTable(0, [
        { text: 'Rain', weight: 3 },
        { text: 'Fog', weight: 1 },
        { text: 'Clear', weight: 2 },
      ])
    ).toEqual({ die: 6, entries: weather });
  });

  it('clamps to the die, sorts, and drops empty entries', () => {
    expect(
      normalizeTable(20, [
        { text: 'Late', from: 15, to: 99 },
        { text: '', from: 1, to: 1 },
        { text: 'Early', from: 4, to: 2 },
      ])
    ).toEqual({
      die: 20,
      entries: [
        { text: 'Early', from: 2, to: 4 },
        { text: 'Late', from: 15, to: 20 },
      ],
    });
    expect(normalizeTable('x', 'nope')).toEqual({ die: 4, entries: [] });
  });
});

describe('rolling', () => {
  it('lands each face on its entry, and a gap on nothing', () => {
    expect(
      [1, 3, 4, 5, 6].map(f => entryForFace(weather, f)?.entry.text)
    ).toEqual(['Rain', 'Rain', 'Fog', 'Clear', 'Clear']);
    expect(entryForFace([{ text: 'A', from: 1, to: 2 }], 3)).toBeNull();
    expect(entryForFace(weather, 5)?.index).toBe(2);
  });

  it('keeps the log label within 80 characters', () => {
    expect(rollLabel('Weather', 'Rain')).toBe('Weather: Rain');
    const long = rollLabel('Tavern names', 'x'.repeat(200));
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});
