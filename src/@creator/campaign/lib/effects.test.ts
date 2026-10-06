import { describe, expect, it } from 'vitest';

import {
  durationWords,
  effectDetail,
  effectName,
  tick,
  type EffectRow,
} from './effects';

function effect(over: Partial<EffectRow>): EffectRow {
  return {
    id: 'e',
    encounterId: 'enc',
    entryId: 'a',
    kind: 'effect',
    conditionKey: null,
    label: 'Bless',
    roundsLeft: 3,
    endsOn: 'end',
    anchorEntryId: null,
    saveAbility: null,
    saveDc: null,
    sourceEntryId: null,
    sourceLabel: '',
    concentration: false,
    visibility: 'shared',
    createdAt: '2026-10-06T00:00:00.000Z',
    ...over,
  };
}

const endOf = (id: string) => ({
  endedEntryId: id,
  beganEntryId: 'next',
  newRound: false,
});

describe('tick', () => {
  it('counts down only on its own moment', () => {
    const e = effect({});
    expect(tick([e], endOf('b')).remaining[0].roundsLeft).toBe(3);
    expect(tick([e], endOf('a')).remaining[0].roundsLeft).toBe(2);
  });

  it('measures on the anchor when there is one', () => {
    const e = effect({ anchorEntryId: 'caster' });
    expect(tick([e], endOf('a')).remaining[0].roundsLeft).toBe(3);
    expect(tick([e], endOf('caster')).remaining[0].roundsLeft).toBe(2);
  });

  it('a start-of-turn effect counts when the turn begins', () => {
    const e = effect({ endsOn: 'start' });
    const r = tick([e], {
      endedEntryId: 'x',
      beganEntryId: 'a',
      newRound: false,
    });
    expect(r.remaining[0].roundsLeft).toBe(2);
  });

  it('expires at zero', () => {
    const r = tick([effect({ roundsLeft: 1 })], endOf('a'));
    expect(r.remaining).toEqual([]);
    expect(r.expired[0].roundsLeft).toBe(0);
  });

  it('prompts a save each moment, and "until removed" is left alone', () => {
    const held = effect({
      roundsLeft: null,
      saveAbility: 'wisdom',
      saveDc: 15,
    });
    const forever = effect({ id: 'f', roundsLeft: null });
    const r = tick([held, forever], endOf('a'));
    expect(r.remaining).toHaveLength(2);
    expect(r.prompts.map(p => p.id)).toEqual(['e']);
  });

  it('a room countdown counts at the top of the round', () => {
    const room = effect({ kind: 'countdown', entryId: null, roundsLeft: 2 });
    expect(tick([room], endOf('a')).remaining[0].roundsLeft).toBe(2);
    expect(
      tick([room], { endedEntryId: 'a', beganEntryId: 'b', newRound: true })
        .remaining[0].roundsLeft
    ).toBe(1);
  });
});

describe('how one reads', () => {
  it('names conditions by their label', () => {
    expect(
      effectName({ kind: 'condition', conditionKey: 'prone', label: '' })
    ).toBe('Prone');
    expect(
      effectName({ kind: 'countdown', conditionKey: null, label: '' })
    ).toBe('Countdown');
  });

  it('words a duration', () => {
    expect(durationWords(effect({ roundsLeft: 1 }))).toBe('1 round');
    expect(durationWords(effect({ roundsLeft: null }))).toBe('until removed');
    expect(
      durationWords(
        effect({ roundsLeft: 2, saveAbility: 'wisdom', saveDc: 12 })
      )
    ).toBe('2 rounds, or until saved');
  });

  it('composes the tooltip', () => {
    expect(
      effectDetail(
        effect({
          roundsLeft: null,
          saveAbility: 'wisdom',
          saveDc: 15,
          sourceLabel: 'the lich',
          concentration: true,
        })
      )
    ).toBe(
      'until saved · Wisdom save DC 15, at the end of each turn · from the lich · concentration'
    );
  });
});
