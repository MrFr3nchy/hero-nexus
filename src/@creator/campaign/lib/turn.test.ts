import { describe, expect, it } from 'vitest';

import {
  actionDef,
  applyAction,
  beginTurn,
  FRESH_TURN,
  movementBudget,
  parseTurn,
  slotFor,
  spend,
} from './turn';

describe('parseTurn', () => {
  it('reads anything missing as unspent', () => {
    expect(parseTurn('{}')).toEqual(FRESH_TURN);
    expect(parseTurn(null)).toEqual(FRESH_TURN);
    expect(parseTurn({})).toEqual(FRESH_TURN);
  });

  it('keeps only true flags and a whole, non-negative movement', () => {
    expect(
      parseTurn({ action: true, bonus: 'yes', movedFeet: -5.5, hidden: true })
    ).toEqual({ ...FRESH_TURN, action: true, hidden: true });
    expect(parseTurn({ movedFeet: 17.9 }).movedFeet).toBe(17);
  });

  it('drops an empty Ready', () => {
    expect(parseTurn({ ready: { trigger: '', action: '' } }).ready).toBe(
      undefined
    );
    expect(parseTurn({ ready: { trigger: 'door opens' } }).ready).toEqual({
      trigger: 'door opens',
      action: '',
    });
  });
});

describe('the turn', () => {
  it('beginTurn resets everything but hiding and recharge', () => {
    const spent = {
      ...FRESH_TURN,
      action: true,
      reaction: true,
      dodging: true,
      movedFeet: 30,
      hidden: true,
      recharge: { Breath: { min: 5, ready: false } },
    };
    expect(beginTurn(spent)).toEqual({
      ...FRESH_TURN,
      hidden: true,
      recharge: { Breath: { min: 5, ready: false } },
    });
  });

  it('spend refuses a slot twice', () => {
    const once = spend(FRESH_TURN, 'action');
    expect(once?.action).toBe(true);
    expect(spend(once!, 'action')).toBeNull();
    expect(spend(FRESH_TURN, 'interaction')?.freeInteraction).toBe(true);
  });

  it('Dash doubles the budget it is measured against', () => {
    expect(movementBudget({ ...FRESH_TURN, movedFeet: 20 }, 30)).toBe(10);
    expect(
      movementBudget({ ...FRESH_TURN, movedFeet: 20, dashed: true }, 30)
    ).toBe(40);
    expect(movementBudget({ ...FRESH_TURN, movedFeet: 50 }, 30)).toBe(0);
  });

  it('applyAction: Ready splits on an arrow, standing costs half speed', () => {
    expect(
      applyAction(FRESH_TURN, 'ready', 'if the door opens -> cast Shield', 30)
        .ready
    ).toEqual({ trigger: 'if the door opens', action: 'cast Shield' });
    expect(applyAction(FRESH_TURN, 'stand', '', 30).movedFeet).toBe(15);
    expect(applyAction(FRESH_TURN, 'stand', '', 25).movedFeet).toBe(10);
    expect(applyAction(FRESH_TURN, 'dash', '', 30).dashed).toBe(true);
  });

  it('slotFor maps costs to slots', () => {
    expect(slotFor(actionDef('dash')!)).toBe('action');
    expect(actionDef('nothing')).toBeUndefined();
  });
});
