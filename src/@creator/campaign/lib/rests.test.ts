import { describe, expect, it } from 'vitest';

import {
  normalizeRestAnswers,
  regainsInspirationOnLongRest,
  restLabel,
} from './rests';

describe('rests', () => {
  it('normalises stored answers, dropping junk', () => {
    expect(
      normalizeRestAnswers({
        a: { hitDice: 2.7, confirmed: true },
        b: { hitDice: -3, confirmed: 'yes' },
        c: null,
        d: { hitDice: Infinity },
      })
    ).toEqual({
      a: { hitDice: 2, confirmed: true },
      b: { hitDice: 0, confirmed: false },
      d: { hitDice: 0, confirmed: false },
    });
    expect(normalizeRestAnswers('nope')).toEqual({});
  });

  it('labels and the human rule', () => {
    expect(restLabel('long')).toBe('long rest');
    expect(restLabel('short')).toBe('short rest');
    expect(regainsInspirationOnLongRest('Variant Human')).toBe(true);
    expect(regainsInspirationOnLongRest('Humanoid construct')).toBe(false);
  });
});
