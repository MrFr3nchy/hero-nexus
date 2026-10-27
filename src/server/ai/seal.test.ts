import { beforeEach, describe, expect, it } from 'vitest';

import { seal, sealingConfigured, unseal } from './seal';

beforeEach(() => {
  process.env.AI_KEY_SECRET = 'a-test-secret-long-enough';
});

describe('seal', () => {
  it('opens for the user it was sealed for', () => {
    const sealed = seal('sk-live-1234', 'user-a');
    expect(sealed).not.toContain('sk-live');
    expect(unseal(sealed, 'user-a')).toBe('sk-live-1234');
  });

  it('does not open on another user’s row', () => {
    const sealed = seal('sk-live-1234', 'user-a');
    expect(() => unseal(sealed, 'user-b')).toThrow('AI_KEY_UNREADABLE');
  });

  it('does not open once the secret changes', () => {
    const sealed = seal('sk-live-1234', 'user-a');
    process.env.AI_KEY_SECRET = 'a-different-secret-entirely';
    expect(() => unseal(sealed, 'user-a')).toThrow('AI_KEY_UNREADABLE');
  });

  it('is off without a secret', () => {
    delete process.env.AI_KEY_SECRET;
    expect(sealingConfigured()).toBe(false);
    expect(() => seal('sk', 'user-a')).toThrow('AI_NOT_CONFIGURED');
  });
});
