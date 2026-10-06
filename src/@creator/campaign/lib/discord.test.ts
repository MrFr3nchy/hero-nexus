import { describe, expect, it } from 'vitest';

import {
  discordDate,
  maskWebhookUrl,
  normalizeDiscordEvents,
  reminderDue,
  validateDiscordUserId,
  validateWebhookUrl,
} from './discord';

const HOOK = 'https://discord.com/api/webhooks/123456789/abc_DEF-xyz9';

describe('validateWebhookUrl', () => {
  it('accepts Discord webhooks on every Discord host', () => {
    expect(validateWebhookUrl(HOOK)).toBe(HOOK);
    expect(validateWebhookUrl(` ${HOOK}?wait=true `)).toBe(HOOK);
    for (const host of [
      'discordapp.com',
      'canary.discord.com',
      'ptb.discord.com',
    ]) {
      expect(
        validateWebhookUrl(HOOK.replace('discord.com', host))
      ).not.toBeNull();
    }
  });

  it('refuses anything else the server would fetch', () => {
    for (const bad of [
      'http://discord.com/api/webhooks/1/a',
      'https://discord.com.evil.test/api/webhooks/1/a',
      'https://evil.test/api/webhooks/1/a',
      'https://discord.com:8443/api/webhooks/1/a',
      'https://user:pw@discord.com/api/webhooks/1/a',
      'https://discord.com/api/webhooks/1/a/../../users',
      'https://discord.com/api/webhooks/abc/a',
      'https://discord.com/api/v10/channels/1/messages',
      'https://127.0.0.1/api/webhooks/1/a',
      'not a url',
      '',
    ]) {
      expect(validateWebhookUrl(bad), bad).toBeNull();
    }
  });
});

describe('the rest', () => {
  it('masks a webhook to its id and the last four of the token', () => {
    expect(maskWebhookUrl(HOOK)).toBe('…/webhooks/123456789/••••xyz9');
    expect(maskWebhookUrl(HOOK)).not.toContain('abc_DEF');
  });

  it('reads toggles with missing keys on', () => {
    const e = normalizeDiscordEvents({ recap: false, levelup: 'no' });
    expect(e.recap).toBe(false);
    expect(e.levelup).toBe(true);
    expect(e.schedule).toBe(true);
  });

  it('accepts only snowflakes for a user id', () => {
    expect(validateDiscordUserId(' 80351110224678912 ')).toBe(
      '80351110224678912'
    );
    expect(validateDiscordUserId('@everyone')).toBeNull();
    expect(validateDiscordUserId('1234')).toBeNull();
  });

  it('a bare date is due from a day before it until it ends', () => {
    const at = Date.parse('2026-10-10T00:00:00Z');
    const h = 3600_000;
    expect(reminderDue('2026-10-10', at - 25 * h)).toBe(false);
    expect(reminderDue('2026-10-10', at - 23 * h)).toBe(true);
    expect(reminderDue('2026-10-10', at + 20 * h)).toBe(true);
    expect(reminderDue('2026-10-10', at + 25 * h)).toBe(false);
  });

  it('an instant is due from a day before it until it arrives', () => {
    const at = Date.parse('2026-10-10T19:00:00Z');
    expect(reminderDue('2026-10-10T19:00:00Z', at - 3600_000)).toBe(true);
    expect(reminderDue('2026-10-10T19:00:00Z', at + 1)).toBe(false);
    expect(reminderDue('soon', at)).toBe(false);
  });

  it('writes a date for the channel', () => {
    expect(discordDate('2026-10-10')).toBe('Saturday, October 10, 2026');
    expect(discordDate('2026-10-10T19:00:00Z')).toBe('<t:1791658800:F>');
  });
});
