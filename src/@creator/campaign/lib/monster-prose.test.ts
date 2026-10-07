import { describe, expect, it } from 'vitest';

import { rollsIn } from './monster-prose';

describe('rollsIn', () => {
  it('reads the bonus and the dice out of a 2024 attack line', () => {
    expect(
      rollsIn(
        'Melee Attack Roll: +4, reach 5 ft. Hit: 7 (2d4 + 2) Slashing damage.'
      )
    ).toEqual({ hit: '1d20+4', damage: ['2d4+2'] });
  });

  it('reads the 2014 phrasing, and leaves prose as prose', () => {
    expect(
      rollsIn('Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 6 (1d6 + 3).')
    ).toEqual({ hit: '1d20+5', damage: ['1d6+3'] });
    expect(rollsIn('The ghoul howls.')).toEqual({ hit: null, damage: [] });
  });
});
