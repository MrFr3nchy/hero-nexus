import { describe, expect, it } from 'vitest';

import { makeEmptySheet } from '@/@creator/character/schema';
import {
  isSheetRoll,
  sheetBonuses,
  sheetRollBonus,
  sheetRollLabel,
  sheetRollNotation,
  sheetRollTest,
  signed,
} from './sheet-rolls';

/** A fifth-level rogue: Dex 18, proficient in Stealth and Dex saves. */
function rogue() {
  const sheet = makeEmptySheet();
  sheet.identity.level = 5;
  sheet.abilities.dexterity = { score: 18, proficientSave: true };
  sheet.abilities.wisdom = { score: 13, proficientSave: false };
  sheet.skills.stealth = true;
  return sheet;
}

describe('sheetRollBonus', () => {
  it('reads each kind of roll off the sheet', () => {
    const sheet = rogue();
    expect(sheetRollBonus(sheet, { kind: 'skill', key: 'stealth' })).toBe(7);
    expect(sheetRollBonus(sheet, { kind: 'skill', key: 'perception' })).toBe(1);
    expect(sheetRollBonus(sheet, { kind: 'save', key: 'dexterity' })).toBe(7);
    expect(sheetRollBonus(sheet, { kind: 'save', key: 'wisdom' })).toBe(1);
    expect(sheetRollBonus(sheet, { kind: 'ability', key: 'dexterity' })).toBe(
      4
    );
    expect(sheetRollBonus(sheet, { kind: 'initiative' })).toBe(4);
  });

  it('prints the same numbers the server rolls', () => {
    const sheet = rogue();
    const b = sheetBonuses(sheet);
    expect(b.skills.stealth).toEqual({ bonus: 7, proficient: true });
    expect(b.abilities.dexterity).toEqual({
      score: 18,
      mod: 4,
      save: 7,
      proficientSave: true,
    });
    expect(b.initiative).toBe(4);
  });
});

describe('isSheetRoll', () => {
  it('accepts only rolls this module knows', () => {
    expect(isSheetRoll({ kind: 'skill', key: 'stealth' })).toBe(true);
    expect(isSheetRoll({ kind: 'initiative' })).toBe(true);
    expect(isSheetRoll({ kind: 'skill', key: 'dexterity' })).toBe(false);
    expect(isSheetRoll({ kind: 'save', key: 'luck' })).toBe(false);
    expect(isSheetRoll({ kind: 'attack' })).toBe(false);
    expect(isSheetRoll(null)).toBe(false);
  });
});

describe('words and notation', () => {
  it('labels the roll as the log says it', () => {
    expect(sheetRollLabel({ kind: 'skill', key: 'sleightOfHand' })).toBe(
      'Sleight of Hand'
    );
    expect(sheetRollLabel({ kind: 'save', key: 'wisdom' })).toBe('Wisdom save');
    expect(sheetRollLabel({ kind: 'ability', key: 'strength' })).toBe(
      'Strength'
    );
  });

  it('says what kind of d20 test it is', () => {
    expect(sheetRollTest({ kind: 'skill', key: 'stealth' })).toEqual({
      what: 'check',
      ability: 'dexterity',
    });
    expect(sheetRollTest({ kind: 'save', key: 'wisdom' })).toEqual({
      what: 'save',
      ability: 'wisdom',
    });
  });

  it('writes the notation the server rolls', () => {
    expect(sheetRollNotation(7, 'straight')).toBe('1d20+7');
    expect(sheetRollNotation(-1, 'advantage')).toBe('2d20kh1-1');
    expect(sheetRollNotation(0, 'disadvantage')).toBe('2d20kl1');
    expect(signed(3)).toBe('+3');
    expect(signed(0)).toBe('+0');
    expect(signed(-2)).toBe('−2');
  });
});
