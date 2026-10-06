import { describe as group, expect, it } from 'vitest';

import { describe, TABLE_EVENT_KINDS, type TableEvent } from './events';

const viewer = { userId: 'u-me', characterId: 'c-me' };
const base = { id: 'e1', at: '2026-10-06T19:00:00.000Z', by: null };

group('describe', () => {
  it('reads a roll, with its tone and how it was rolled', () => {
    const roll = (over: Partial<Extract<TableEvent, { kind: 'roll' }>>) =>
      describe(
        {
          ...base,
          kind: 'roll',
          actorName: 'Kessa',
          label: 'Stealth',
          notation: '1d20+5',
          total: 17,
          tone: 'plain',
          secret: false,
          ...over,
        },
        viewer
      );
    expect(roll({})).toMatchObject({
      glyph: 'die',
      title: 'Kessa · Stealth · 17',
      detail: '1d20+5',
      tone: 'gold',
    });
    expect(roll({ tone: 'crit' }).tone).toBe('success');
    expect(roll({ tone: 'fumble' }).tone).toBe('danger');
    expect(roll({ secret: true }).detail).toBe('1d20+5 · behind the screen');
    expect(roll({ physical: true }).detail).toBe('1d20+5 · real dice');
    expect(roll({ label: '' }).title).toBe('Kessa · 17');
  });

  it('addresses a turn to the reader whose turn it is, and asks of them', () => {
    const turn = (characterId: string | null) =>
      describe(
        {
          ...base,
          kind: 'turn',
          encounterName: 'The bridge',
          round: 2,
          label: 'Kessa',
          characterId,
        },
        viewer
      );
    expect(turn('c-me')).toMatchObject({ title: 'Your turn', asks: true });
    expect(turn('c-other')).toMatchObject({
      title: "Kessa's turn",
      asks: false,
      detail: 'Round 2 · The bridge',
    });
    expect(turn(null).asks).toBe(false);
  });

  it('names the recipient of a whisper, or "you"', () => {
    const w = (toUserIds: string[]) =>
      describe(
        {
          ...base,
          kind: 'whisper',
          whisperId: 'w',
          fromName: 'Rurik',
          toUserIds,
          toNames: ['Kessa'],
          body: 'psst',
        },
        viewer
      );
    expect(w(['u-me']).title).toBe('Rurik whispers to you');
    expect(w(['u-other']).title).toBe('Rurik whispers to Kessa');
  });

  it('does not show a DC that was not sent', () => {
    const asked = describe(
      {
        ...base,
        kind: 'check',
        checkId: 'k',
        ask: 'Dexterity (Stealth)',
        state: 'asked',
        targetNames: [],
        dc: null,
        actorName: null,
        total: null,
        outcome: null,
      },
      viewer
    );
    expect(asked.detail).toBe('The DM is asking');
    expect(asked.asks).toBe(false);
  });

  it('the X-card asks of staff and names nobody', () => {
    const r = describe(
      { ...base, kind: 'safety', by: null, pausedTimers: 2 },
      viewer
    );
    expect(r).toMatchObject({
      glyph: 'x',
      title: 'Someone tapped the X-card',
      asks: true,
    });
    expect(r.detail).toMatch(/held until you resume/);
  });

  it('has a glyph for every kind', () => {
    // A kind added to the list without a GLYPHS entry fails to compile;
    // this pins that the list itself is what the switch covers.
    expect(new Set(TABLE_EVENT_KINDS).size).toBe(TABLE_EVENT_KINDS.length);
  });
});
