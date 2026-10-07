/**
 * An attack's verdict reaches each side of the screen in the words that side
 * may read: staff with the AC, players only where the table shows hit and
 * miss, and never the AC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RollEvent } from '@/@shared/table/events';

const sent: { event: RollEvent; audience: unknown }[] = [];
vi.mock('./live-hub', () => ({
  publish: (_campaignId: string, event: RollEvent, audience = 'everyone') =>
    sent.push({ event, audience }),
}));

const { announceAttackRoll } = await import('./roll-announce');
const { reaches } =
  await vi.importActual<typeof import('./live-hub')>('./live-hub');

const event: Omit<RollEvent, 'verdict'> = {
  kind: 'roll',
  id: 'e1',
  at: '2026-10-07T20:00:00.000Z',
  by: 'u-kestrel',
  actorName: 'Kestrel Vane',
  label: 'Rapier vs Ghoul 2',
  notation: '1d20+7',
  total: 19,
  tone: 'plain',
  secret: false,
};
const hit = { hit: true, critical: false, ac: 12, targetLabel: 'Ghoul 2' };

beforeEach(() => {
  sent.length = 0;
});

describe('announceAttackRoll', () => {
  it('tells staff the AC and players nothing, at a table that hides hits', () => {
    announceAttackRoll('c', event, hit, 'staff');
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      audience: 'staff',
      event: { verdict: { result: 'hit', target: 'Ghoul 2', ac: 12 } },
    });
    expect(sent[1].audience).toBe('players');
    expect(sent[1].event.verdict).toBeUndefined();
    // Two moments, two ids: a replay can tell them apart.
    expect(sent[1].event.id).not.toBe(sent[0].event.id);
  });

  it('tells players the verdict but never the AC where hits are shown', () => {
    announceAttackRoll('c', event, { ...hit, critical: true }, 'everyone');
    expect(sent[1]).toMatchObject({
      audience: 'players',
      event: { verdict: { result: 'critical', ac: null } },
    });
  });

  it('announces once, to everyone, when there is no verdict to give', () => {
    announceAttackRoll('c', event, { ...hit, hit: null }, 'everyone');
    announceAttackRoll('c', event, null, 'everyone');
    expect(sent.map(s => s.audience)).toEqual(['everyone', 'everyone']);
    expect(sent.every(s => s.event.verdict === undefined)).toBe(true);
  });
});

describe('the players audience', () => {
  it('reaches players and never staff', () => {
    expect(reaches('players', { userId: 'p', role: 'player' })).toBe(true);
    expect(reaches('players', { userId: 'd', role: 'gm' })).toBe(false);
    expect(reaches('players', { userId: 'c', role: 'co-gm' })).toBe(false);
  });
});
