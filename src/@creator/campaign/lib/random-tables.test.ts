import { describe, expect, it } from 'vitest';

import {
  dieFor,
  entryForFace,
  faceRanges,
  formatBulkEntries,
  normalizeEntries,
  parseBulkEntries,
  rollLabel,
  totalWeight,
} from './random-tables';

const weather = [
  { text: 'Rain', weight: 3 },
  { text: 'Fog', weight: 1 },
  { text: 'Clear', weight: 2 },
];

describe('random tables', () => {
  it('reads a pasted list with optional weights', () => {
    expect(
      parseBulkEntries('3x Rain\n\n  Fog  \n2× Clear\n10 x A storm\n4xx')
    ).toEqual([
      { text: 'Rain', weight: 3 },
      { text: 'Fog', weight: 1 },
      { text: 'Clear', weight: 2 },
      { text: 'A storm', weight: 10 },
      { text: '4xx', weight: 1 },
    ]);
  });

  it('round-trips through the pasteable form', () => {
    expect(parseBulkEntries(formatBulkEntries(weather))).toEqual(weather);
  });

  it('derives the die from the total weight', () => {
    expect(totalWeight(weather)).toBe(6);
    expect(dieFor(weather)).toBe('1d6');
    expect(dieFor([])).toBeNull();
    expect(dieFor([{ text: 'Only', weight: 1 }])).toBe('1d2');
  });

  it('lands each face on its entry', () => {
    const at = (f: number) => entryForFace(weather, f)?.entry.text;
    expect([1, 2, 3, 4, 5, 6].map(at)).toEqual([
      'Rain',
      'Rain',
      'Rain',
      'Fog',
      'Clear',
      'Clear',
    ]);
    expect(entryForFace([{ text: 'Only', weight: 1 }], 2)?.entry.text).toBe(
      'Only'
    );
    expect(entryForFace([], 1)).toBeNull();
    expect(faceRanges(weather)).toEqual(['1–3', '4', '5–6']);
  });

  it('cleans what it is given', () => {
    expect(
      normalizeEntries([
        { text: ' A ', weight: 0 },
        { text: '', weight: 3 },
        { text: 'B', weight: 9999 },
        { text: 'C', weight: 'two' },
        null,
      ])
    ).toEqual([
      { text: 'A', weight: 1 },
      { text: 'B', weight: 100 },
      { text: 'C', weight: 1 },
    ]);
    expect(normalizeEntries('nope')).toEqual([]);
  });

  it('keeps the log label within 80 characters', () => {
    expect(rollLabel('Weather', 'Rain')).toBe('Weather: Rain');
    const long = rollLabel('Tavern names', 'x'.repeat(200));
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});
