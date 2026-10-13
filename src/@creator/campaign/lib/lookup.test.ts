import { describe, expect, it } from 'vitest';

import type { ContentEntry } from '@/@shared/content';
import {
  bookLine,
  isLookupRef,
  KEPT_LIMIT,
  lookupKey,
  matchBooks,
  matchConditions,
  matchRules,
  nameScore,
  normalizeKept,
  type BookHit,
  type LookupRef,
  withKept,
} from './lookup';

const hit = (name: string): BookHit => ({
  ref: { source: 'srd', type: 'creature', key: name.toLowerCase() },
  name,
  line: '',
  homebrew: false,
});

describe('matching the books', () => {
  it('ranks a prefix over a word inside over anywhere', () => {
    const index = ['Hobgoblin', 'Ghoul', "Ghoul's Tooth", 'Mighoulish'].map(
      hit
    );
    expect(matchBooks(index, 'ghou').map(h => h.name)).toEqual([
      'Ghoul',
      "Ghoul's Tooth",
      'Mighoulish',
    ]);
    expect(nameScore('Hold Person', 'person')).toBe(2);
    expect(nameScore('Hold Person', 'zz')).toBe(0);
  });

  it('waits for two letters', () => {
    expect(matchBooks([hit('Ghoul')], 'g')).toEqual([]);
    expect(matchConditions('p')).toEqual([]);
  });

  it('finds conditions and rules passages by name', () => {
    expect(matchConditions('para').map(c => c.key)).toEqual(['paralyzed']);
    expect(matchRules('grapple').length).toBeGreaterThan(0);
  });
});

describe('bookLine', () => {
  const entry = (type: ContentEntry['type'], data: unknown): ContentEntry => ({
    ref: { source: 'srd', type, key: 'x' },
    type,
    name: 'X',
    description: '',
    data,
  });

  it('says what a spell, a creature and an item are in one line', () => {
    expect(bookLine(entry('spell', { level: 2, school: 'enchantment' }))).toBe(
      '2nd-level enchantment'
    );
    expect(bookLine(entry('spell', { level: 0, school: 'evocation' }))).toBe(
      'Cantrip · evocation'
    );
    expect(
      bookLine(
        entry('creature', {
          size: 'medium',
          creature_type: 'undead',
          challenge_rating: 0.25,
          armor_class: 12,
        })
      )
    ).toBe('Medium undead · CR 1/4 · AC 12');
    expect(bookLine(entry('item', { rarity: 'common', cost: 50 }))).toBe(
      'Common · 50 gp'
    );
  });
});

describe('kept lookups', () => {
  const book: LookupRef = {
    kind: 'book',
    ref: { source: 'srd', type: 'spell', key: 'srd-2024_hold-person' },
  };

  it('accepts only references this build can open', () => {
    expect(isLookupRef(book)).toBe(true);
    expect(isLookupRef({ kind: 'condition', key: 'paralyzed' })).toBe(true);
    expect(isLookupRef({ kind: 'condition', key: 'sleepy' })).toBe(false);
    expect(
      isLookupRef({
        kind: 'book',
        ref: { source: 'srd', type: 'class', key: 'x' },
      })
    ).toBe(false);
    expect(isLookupRef({ kind: 'record', record: 'canon', id: '' })).toBe(
      false
    );
    expect(isLookupRef({ kind: 'rule', section: 'nope', key: 'nope' })).toBe(
      false
    );
  });

  it('keeps each once, strips extra fields, and stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ref: { kind: 'record', record: 'canon', id: `e${i}` },
      name: `Entry ${i}`,
    }));
    const out = normalizeKept([
      { ref: { ...book, extra: 'dropped' }, name: ' Hold Person ' },
      { ref: book, name: 'Hold Person' },
      { ref: { kind: 'nonsense' }, name: 'x' },
      ...many,
    ]);
    expect(out).toHaveLength(KEPT_LIMIT);
    expect(out[0]).toEqual({ ref: book, name: 'Hold Person' });
    expect(new Set(out.map(k => lookupKey(k.ref))).size).toBe(out.length);
    expect(normalizeKept('not a list')).toEqual([]);
  });

  it('puts the newest at the top, once', () => {
    const a = { ref: book, name: 'Hold Person' };
    const b = {
      ref: { kind: 'condition', key: 'paralyzed' } as LookupRef,
      name: 'Paralyzed',
    };
    expect(withKept([a, b], a)).toEqual([a, b]);
    expect(withKept([a], b)).toEqual([b, a]);
  });
});
