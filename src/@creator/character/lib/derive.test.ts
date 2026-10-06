import { describe, expect, it } from 'vitest';

import { refKey, type ContentEntry, type ContentRef } from '@/@shared/content';

import { makeEmptySheet, type CharacterSheet } from '../schema';
import {
  abilityModifier,
  armorClass,
  capacityFor,
  carryingCapacity,
  passivePerception,
  proficiencyBonus,
  savingThrow,
  skillBonus,
  spellAttackBonus,
  spellSaveDC,
  weaponAttacks,
  type ResolvedContent,
} from './derive';

function sheet(edit: (s: CharacterSheet) => void = () => {}): CharacterSheet {
  const s = makeEmptySheet();
  edit(s);
  return s;
}

function item(key: string, data: unknown, name = key): ContentEntry {
  const ref: ContentRef = { source: 'srd', type: 'item', key };
  return { ref, type: 'item', name, description: '', data };
}

function carrying(...entries: ContentEntry[]): {
  resolved: ResolvedContent;
  rows: CharacterSheet['inventory'];
} {
  return {
    resolved: new Map(entries.map(e => [refKey(e.ref), e])),
    rows: entries.map((e, i) => ({
      id: `row-${i}`,
      ref: { ...e.ref, name: e.name },
      name: e.name,
      quantity: 1,
      equipped: true,
      attuned: false,
      notes: '',
      grantedBy: '',
    })),
  };
}

const armor = (
  category: string,
  ac_base: number,
  ac_add_dexmod: boolean,
  ac_cap_dexmod: number | null = null
) => ({
  kind: 'armor',
  armor: { category, ac_base, ac_add_dexmod, ac_cap_dexmod },
});

describe('the basic numbers', () => {
  it('abilityModifier rounds down', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(20)).toBe(5);
  });

  it('proficiencyBonus by level, clamped to 1–20', () => {
    expect([0, 1, 4, 5, 8, 9, 13, 17, 20, 30].map(proficiencyBonus)).toEqual([
      2, 2, 2, 3, 3, 4, 5, 6, 6, 6,
    ]);
  });

  it('adds proficiency to saves and skills only when proficient', () => {
    const s = sheet(s => {
      s.identity.level = 5;
      s.abilities.dexterity.score = 16;
      s.abilities.dexterity.proficientSave = true;
      s.abilities.wisdom.score = 14;
    });
    expect(savingThrow(s, 'dexterity')).toBe(6);
    expect(savingThrow(s, 'strength')).toBe(0);
    expect(skillBonus(s, 'perception')).toBe(2);
    expect(passivePerception(s)).toBe(12);
    s.skills.perception = true;
    expect(skillBonus(s, 'perception')).toBe(5);
    expect(passivePerception(s)).toBe(15);
  });

  it('spell DC and attack bonus need a spellcasting ability', () => {
    const s = sheet(s => {
      s.identity.level = 9;
      s.abilities.intelligence.score = 18;
    });
    expect(spellSaveDC(s)).toBeNull();
    expect(spellAttackBonus(s)).toBeNull();
    s.spellcasting.ability = 'intelligence';
    expect(spellSaveDC(s)).toBe(8 + 4 + 4);
    expect(spellAttackBonus(s)).toBe(8);
  });
});

describe('armorClass', () => {
  const dex16 = (s: CharacterSheet) => (s.abilities.dexterity.score = 16);

  it('is 10 + Dex unarmoured, or with nothing resolved', () => {
    expect(armorClass(sheet(dex16))).toBe(13);
  });

  it('takes body armour, capped Dex, and one shield on top', () => {
    const { resolved, rows } = carrying(
      item('breastplate', armor('medium', 14, true, 2)),
      item('shield', armor('shield', 2, false))
    );
    const s = sheet(s => {
      dex16(s);
      s.inventory = rows;
    });
    expect(armorClass(s, resolved)).toBe(14 + 2 + 2);
  });

  it('heavy armour ignores Dex', () => {
    const { resolved, rows } = carrying(
      item('plate', armor('heavy', 18, false))
    );
    const s = sheet(s => {
      s.abilities.dexterity.score = 8;
      s.inventory = rows;
    });
    expect(armorClass(s, resolved)).toBe(18);
  });

  it('does not count armour that is carried but not worn', () => {
    const { resolved, rows } = carrying(
      item('plate', armor('heavy', 18, false))
    );
    rows[0].equipped = false;
    expect(
      armorClass(
        sheet(s => (s.inventory = rows)),
        resolved
      )
    ).toBe(10);
  });

  it('a spell under the same key is not a shield', () => {
    // The Shield spell and the shield item share a slug; only the item counts.
    const ref: ContentRef = { source: 'srd', type: 'item', key: 'shield' };
    const spell: ContentEntry = {
      ref,
      type: 'spell',
      name: 'Shield',
      description: '',
      data: {},
    };
    const s = sheet(s => {
      s.inventory = carrying(item('shield', armor('shield', 2, false))).rows;
    });
    expect(armorClass(s, new Map([[refKey(ref), spell]]))).toBe(10);
  });
});

describe('weaponAttacks', () => {
  it('uses the better of Str and Dex for a finesse weapon', () => {
    const { resolved, rows } = carrying(
      item(
        'rapier',
        {
          kind: 'weapon',
          weapon: {
            damage_dice: '1d8',
            damage_type: 'piercing',
            is_simple: false,
            properties: ['Finesse'],
          },
        },
        'Rapier'
      )
    );
    const s = sheet(s => {
      s.abilities.strength.score = 10;
      s.abilities.dexterity.score = 16;
      s.inventory = rows;
      s.proficiencies.weaponProficiency.martial = true;
    });
    const [a] = weaponAttacks(s, resolved);
    expect(a).toMatchObject({
      name: 'Rapier',
      ability: 'dexterity',
      proficient: true,
      attackBonus: 5,
      damage: '1d8+3',
    });
  });
});

describe('carrying capacity', () => {
  it('is Strength × 15, scaled by size', () => {
    expect(capacityFor(15, 'Medium')).toBe(225);
    expect(capacityFor(15, 'tiny')).toBe(112);
    expect(capacityFor(15, 'Large')).toBe(450);
    expect(carryingCapacity(sheet(s => (s.abilities.strength.score = 8)))).toBe(
      120
    );
  });
});
