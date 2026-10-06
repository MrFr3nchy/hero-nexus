import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { characterSheetSchema, makeEmptySheet } from '../schema';
import {
  NEEDS_A_MATCH,
  buildImportedSheet,
  baseKey,
  matchKey,
  nameIndex,
  parseDdbCharacter,
  type ImportRef,
} from './ddb-import';

const DIR = join(process.cwd(), 'test/fixtures/ddb');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(DIR, name), 'utf8'));

let n = 0;
const makeId = () => `row-${++n}`;

describe('parseDdbCharacter', () => {
  const facts = parseDdbCharacter(fixture('hand-made-wizard.json'))!;

  it('reads identity, level and the starting class first', () => {
    expect(facts.name).toBe('Ilsa Thorn');
    expect(facts.level).toBe(4);
    expect(facts.classes.map(c => c.name)).toEqual(['Wizard', 'Fighter']);
    expect(facts.classes[0]).toMatchObject({
      subclass: 'School of Evocation',
      hitDie: 6,
    });
    expect(facts.species).toBe('High Elf');
    expect(facts.background).toBe('Sage');
    expect(facts.alignment).toBe('Neutral Good');
    expect(facts.xp).toBe(2700);
    expect(facts.warnings[0]).toMatch(/Multiclassed/);
  });

  it('makes ability scores final numbers: base, bonus, modifiers, override', () => {
    expect(facts.abilities).toEqual({
      strength: 8, // the item's "set" is the item's business
      dexterity: 14,
      constitution: 14, // 13 + 1 bonus
      intelligence: 17, // 15 + 2 species
      wisdom: 12,
      charisma: 11, // override
    });
  });

  it('works out hit points the way D&D Beyond does', () => {
    // 21 base + Con +2 × level 4.
    expect(facts.hitPointsMax).toBe(29);
  });

  it('lists items and spells by name, each spell once', () => {
    expect(facts.items.map(i => i.name)).toEqual([
      'Dagger',
      'Potion of Healing',
      'Bag of Tricks (Rust)',
    ]);
    expect(facts.spells.map(s => s.name)).toEqual([
      'Magic Missile',
      'Fire Bolt',
      "Tasha's Caustic Brew",
    ]);
  });

  it('keeps the notes', () => {
    expect(facts.notes.backstory).toBe('Raised in the library at Candlekeep.');
    expect(facts.notes.personality).toBe('Always takes notes.\n\nKnowledge.');
    expect(facts.notes.other).toBe('Allies: The Lantern Society');
  });

  it('refuses what is not a character, and survives garbage', () => {
    expect(parseDdbCharacter(null)).toBeNull();
    expect(parseDdbCharacter({ hello: 'world' })).toBeNull();
    const odd = parseDdbCharacter({
      name: 'Odd',
      stats: 'nope',
      classes: [{ level: 'x', definition: { name: 'Bard' } }],
      inventory: [{ definition: null }],
    })!;
    expect(odd.level).toBe(1);
    expect(odd.abilities.strength).toBe(10);
    expect(odd.items).toEqual([]);
  });
});

describe('buildImportedSheet', () => {
  const facts = parseDdbCharacter(fixture('hand-made-wizard.json'))!;
  const dagger: ImportRef = {
    source: 'srd',
    type: 'item',
    key: 'srd-2024_dagger',
    name: 'Dagger',
  };
  const missile: ImportRef = {
    source: 'srd',
    type: 'spell',
    key: 'srd-2024_magic-missile',
    name: 'Magic Missile',
  };
  const sheet = buildImportedSheet(
    facts,
    [dagger, null, null],
    [missile, null, null],
    makeId,
    makeEmptySheet
  );

  it('is a sheet the schema accepts', () => {
    expect(() => characterSheetSchema.parse(sheet)).not.toThrow();
  });

  it('references what matched and names what did not', () => {
    expect(sheet.inventory[0]).toMatchObject({ ref: dagger, notes: '' });
    expect(sheet.inventory[1]).toMatchObject({
      ref: null,
      name: 'Potion of Healing',
      notes: NEEDS_A_MATCH,
    });
    expect(sheet.spellcasting.spells.map(s => s.ref.key)).toEqual([
      missile.key,
    ]);
    expect(sheet.details.classFeatures).toContain("Tasha's Caustic Brew");
  });

  it('carries the numbers', () => {
    expect(sheet.identity).toMatchObject({ class: 'Wizard', level: 4 });
    expect(sheet.combat).toMatchObject({
      hitPointsMax: 29,
      hitDiceMax: 4,
      hitDieSize: 6,
    });
    expect(sheet.currency.gp).toBe(41);
  });
});

describe('every fixture in test/fixtures/ddb', () => {
  for (const file of readdirSync(DIR).filter(f => f.endsWith('.json'))) {
    it(`${file} parses and builds a valid sheet`, () => {
      const facts = parseDdbCharacter(fixture(file));
      expect(facts).not.toBeNull();
      const sheet = buildImportedSheet(
        facts!,
        facts!.items.map(() => null),
        facts!.spells.map(() => null),
        makeId,
        makeEmptySheet
      );
      expect(() => characterSheetSchema.parse(sheet)).not.toThrow();
    });
  }
});

describe('matching names', () => {
  it('ignores case, apostrophes and punctuation', () => {
    expect(matchKey("Tasha's Caustic Brew")).toBe(
      matchKey('tashas caustic brew')
    );
    expect(matchKey('Potion  of Healing')).toBe('potion of healing');
    expect(baseKey('Bag of Tricks (Rust)')).toBe('bag of tricks');
  });

  it('prefers the exact name, and never lands plain on a variant', () => {
    const find = nameIndex([
      { name: 'Dagger (+1)' },
      { name: 'Dagger' },
      { name: 'Bag of Tricks (Gray)' },
      { name: 'Rope' },
    ]);
    expect(find('Dagger')?.name).toBe('Dagger');
    expect(find('dagger (+1)')?.name).toBe('Dagger (+1)');
    expect(find('Bag of Tricks (Rust)')).toBeNull();
    expect(find('Rope (50 feet)')?.name).toBe('Rope');
  });
});
