import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const discord = await import('./discord');
const sessions = await import('./campaign-sessions');

const HOOK = 'https://discord.com/api/webhooks/123456789/secret-token-abcd';
const campaignId = 'camp-d';
let dm = '';
let player = '';

const calls: { url: string; body: Record<string, unknown> }[] = [];
let answer: () => Response = () => new Response(null, { status: 204 });

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return answer();
  })
);

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  player = seedUser('Player');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'Saltmere'
  );
  db.prepare(
    'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run('m-d', campaignId, player, 'player');
  db.close();
});

afterEach(() => {
  calls.length = 0;
  answer = () => new Response(null, { status: 204 });
});

describe('the webhook', () => {
  it('is staff-only, rejects a bad URL and never comes back unmasked', async () => {
    signedIn = player;
    await expect(
      discord.saveDiscordSettings(campaignId, { webhookUrl: HOOK })
    ).rejects.toThrow('FORBIDDEN');
    await expect(discord.getDiscordSettings(campaignId)).rejects.toThrow(
      'FORBIDDEN'
    );

    signedIn = dm;
    await expect(
      discord.saveDiscordSettings(campaignId, {
        webhookUrl: 'https://evil.test/api/webhooks/1/a',
      })
    ).rejects.toThrow('BAD_WEBHOOK');

    const view = await discord.saveDiscordSettings(campaignId, {
      webhookUrl: HOOK,
    });
    expect(JSON.stringify(view)).not.toContain('secret-token');
    expect(view.masked).toBe('…/webhooks/123456789/••••abcd');
  });

  it('never lets a title ping the server, and mentions only stored ids', async () => {
    signedIn = player;
    await discord.setMyDiscordUserId(campaignId, '80351110224678912');
    signedIn = dm;
    const id = await sessions.createSession(campaignId, {
      title: '@everyone come',
    });
    await sessions.openSitting(campaignId);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(HOOK);
    expect(calls[0].body.allowed_mentions).toEqual({
      parse: [],
      users: ['80351110224678912'],
    });
    expect(String(calls[0].body.content)).toContain('@everyone come');
    expect(String(calls[0].body.content)).toContain('<@80351110224678912>');
    await sessions.closeSitting(campaignId);
    expect(id).toBeTruthy();
  });

  it('posts a date once, and not on every prep save', async () => {
    signedIn = dm;
    const id = await sessions.createSession(campaignId, { title: 'Bells' });
    await sessions.updateSession(id, { prepBody: 'secret prep' });
    await sessions.updateSession(id, { scheduledFor: '2026-12-01' });
    await sessions.updateSession(id, {
      scheduledFor: '2026-12-01',
      prepBody: 'more secret prep',
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await new Promise(r => setTimeout(r, 50));
    expect(calls).toHaveLength(1);
    expect(String(calls[0].body.content)).toContain('is set for');
    expect(JSON.stringify(calls)).not.toContain('secret prep');

    await sessions.updateSession(id, { scheduledFor: '2026-12-08' });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(String(calls[1].body.content)).toContain('has moved to');
  });

  it('respects a trigger turned off', async () => {
    signedIn = dm;
    await discord.saveDiscordSettings(campaignId, {
      events: { schedule: false },
    });
    await sessions.createSession(campaignId, {
      title: 'Quiet',
      scheduledFor: '2026-12-20',
    });
    await new Promise(r => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
    await discord.saveDiscordSettings(campaignId, {
      events: { schedule: true },
    });
  });

  it('a failure is recorded, never thrown', async () => {
    signedIn = dm;
    answer = () => new Response('gone', { status: 404 });
    const res = await discord.sendDiscordTest(campaignId);
    expect(res.ok).toBe(false);
    expect((await discord.getDiscordSettings(campaignId)).lastError).toMatch(
      /no longer exists/
    );
    answer = () => {
      throw new TypeError('fetch failed');
    };
    expect((await discord.sendDiscordTest(campaignId)).error).toBe(
      'Could not reach Discord.'
    );
  });
});

describe('the reminder loop', () => {
  it('reminds once per date, and again only when the date moves', async () => {
    signedIn = dm;
    const now = Date.parse('2026-11-01T12:00:00Z');
    const id = await sessions.createSession(campaignId, {
      title: 'Tomorrow',
      scheduledFor: '2026-11-02',
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls.length = 0;

    expect(await discord.sendDueReminders(now)).toBe(1);
    expect(await discord.sendDueReminders(now)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(String(calls[0].body.content)).toContain('reminder');

    await sessions.updateSession(id, { scheduledFor: '2026-11-03' });
    expect(await discord.sendDueReminders(now + 24 * 3600_000)).toBe(1);
  });
});
