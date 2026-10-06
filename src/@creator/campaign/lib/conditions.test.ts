import { describe, expect, it } from 'vitest';

import {
  conditionDef,
  CONDITIONS,
  CONDITION_KEYS,
  parseConditions,
  serializeConditions,
} from './conditions';

describe('conditions', () => {
  it('has one definition per key', () => {
    expect(CONDITIONS.map(c => c.key).sort()).toEqual(
      [...CONDITION_KEYS].sort()
    );
    expect(conditionDef('prone')?.key).toBe('prone');
    expect(conditionDef('on the floor')).toBeUndefined();
  });

  it('parses the column deduped, known-only, in canonical order', () => {
    expect(parseConditions('prone, blinded,prone,,on fire')).toEqual([
      'blinded',
      'prone',
    ]);
    expect(parseConditions('')).toEqual([]);
  });

  it('serialises back the same way', () => {
    expect(serializeConditions(['stunned', 'blinded', 'stunned', 'x'])).toBe(
      'blinded,stunned'
    );
  });
});
