/**
 * Drafting against a migrated temp database, with the provider's HTTP
 * replaced: what is asserted is what the app does with a reply, and that the
 * key only ever goes to the provider's own host.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

process.env.AI_KEY_SECRET = 'a-test-secret-long-enough';

const { getAiSettings, saveAiKey, removeAiKey } = await import('./keys');
const { draftHomebrew } = await import('./drafts');

let dm = '';
let player = '';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function reply(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  player = seedUser('Player');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    'camp-1',
    dm,
    'Saltmere'
  );
  db.close();
});

afterEach(() => fetchMock.mockReset());

describe('saveAiKey', () => {
  it('checks the key with the provider, then keeps only a hint', async () => {
    signedIn = dm;
    fetchMock.mockImplementationOnce(() =>
      reply({
        data: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }],
      })
    );
    const out = await saveAiKey('anthropic', '  sk-ant-secret-9876  ');
    expect(out.model).toBe('claude-sonnet-5-5');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'sk-ant-secret-9876'
    );

    const settings = await getAiSettings();
    expect(settings.key).toMatchObject({
      provider: 'anthropic',
      hint: '9876',
    });
    expect(JSON.stringify(settings)).not.toContain('sk-ant-secret');

    const raw = rawDb();
    const row = raw
      .prepare('SELECT key_sealed FROM user_ai_keys WHERE user_id = ?')
      .get(dm) as { key_sealed: string };
    raw.close();
    expect(row.key_sealed).not.toContain('sk-ant-secret');
  });

  it('keeps nothing when the provider turns the key down', async () => {
    signedIn = player;
    fetchMock.mockImplementationOnce(() => reply({}, 401));
    await expect(saveAiKey('openai', 'sk-bad-key-0000')).rejects.toThrow(
      'AI_KEY_REJECTED'
    );
    expect((await getAiSettings()).key).toBeNull();
  });
});

describe('draftHomebrew', () => {
  it('degrades a bad field instead of failing the draft', async () => {
    signedIn = dm;
    fetchMock.mockImplementationOnce(() =>
      reply({
        content: [
          {
            type: 'text',
            text:
              'Here you go:\n```json\n' +
              JSON.stringify({
                name: 'Cloak of the Last Wearer',
                description: 'It remembers.',
                data: { rarity: 'rare', weight: 'heavy-ish', bogus: true },
              }) +
              '\n```',
          },
        ],
      })
    );
    const draft = await draftHomebrew('item', 'a cloak that remembers');
    expect(draft.name).toBe('Cloak of the Last Wearer');
    const data = draft.data as Record<string, unknown>;
    expect(data.rarity).toBe('rare');
    expect(data).not.toHaveProperty('bogus');
    expect(typeof data.weight).toBe('number');

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
  });

  it('is a DM’s tool: an account running no table cannot draft', async () => {
    signedIn = player;
    await expect(draftHomebrew('item', 'a cloak')).rejects.toThrow('FORBIDDEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when there is no key', async () => {
    signedIn = dm;
    await removeAiKey();
    await expect(draftHomebrew('item', 'a cloak')).rejects.toThrow('AI_NO_KEY');
  });
});
