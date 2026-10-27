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
const { draftEncounter, draftHomebrew, draftNpc, heroFacts } = await import(
  './drafts'
);

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
  db.prepare(
    "INSERT INTO homebrew (id, owner_id, type, name, data) VALUES (?, ?, 'creature', ?, ?)"
  ).run(
    'hb-eel',
    dm,
    'Reed Eel',
    JSON.stringify({ challenge_rating: 2, armor_class: 13, hit_points: 30 })
  );
  db.prepare(
    'INSERT INTO campaign_homebrew (id, campaign_id, homebrew_id) VALUES (?, ?, ?)'
  ).run('ch-1', 'camp-1', 'hb-eel');
  db.prepare(
    "INSERT INTO canon_entries (id, campaign_id, kind, title, dm_body) VALUES (?, ?, 'location', ?, ?)"
  ).run('place-1', 'camp-1', 'The Drowned Lantern', 'A smugglers’ tavern.');
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

/** Save a working key for the DM, so the drafts below have one to use. */
async function dmKey() {
  signedIn = dm;
  fetchMock.mockImplementationOnce(() =>
    reply({ data: [{ id: 'claude-sonnet-5-5' }] })
  );
  await saveAiKey('anthropic', 'sk-ant-secret-9876');
  fetchMock.mockReset();
}

function says(text: unknown) {
  fetchMock.mockImplementationOnce(() =>
    reply({ content: [{ type: 'text', text: JSON.stringify(text) }] })
  );
}

describe('draftEncounter', () => {
  it('keeps only creatures the table can use, by key, with counts clamped', async () => {
    await dmKey();
    says({
      name: 'Reeds at dusk',
      notes: 'They come up out of the water.',
      lines: [
        { key: 'homebrew:creature:hb-eel', count: 400 },
        { key: 'srd:creature:tarrasque', count: 1 },
        { key: 'homebrew:creature:hb-eel', count: 2 },
      ],
    });
    const out = await draftEncounter('camp-1', 'eels in the reeds');
    expect(out.name).toBe('Reeds at dusk');
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({
      name: 'Reed Eel',
      ref: { source: 'homebrew', type: 'creature', key: 'hb-eel' },
    });
    expect(out.lines[0].count).toBeLessThanOrEqual(50);

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(prompt.system).toContain('homebrew:creature:hb-eel | Reed Eel');
  });

  it('is staff-only', async () => {
    signedIn = player;
    await expect(draftEncounter('camp-1', 'eels')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('draftNpc', () => {
  it('gives the place to the model and keeps only the card’s own fields', async () => {
    await dmKey();
    says({
      name: 'Mags Tull',
      role: 'Harbourmaster',
      personality: 'Brisk, frightened of the magistrate',
      shoeSize: '11',
      dmBody: 'Owes the smugglers.',
      statBlock: 'homebrew:creature:hb-eel',
    });
    const out = await draftNpc('camp-1', 'place-1', 'the harbourmaster');
    expect(out).toEqual({
      name: 'Mags Tull',
      fields: {
        role: 'Harbourmaster',
        personality: 'Brisk, frightened of the magistrate',
      },
      dmBody: 'Owes the smugglers.',
      statBlock: {
        ref: { source: 'homebrew', type: 'creature', key: 'hb-eel' },
        name: 'Reed Eel',
        challengeRating: 2,
      },
    });
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(prompt.system).toContain('The Drowned Lantern');
  });

  it('drops a stat block the table cannot use', async () => {
    await dmKey();
    says({ name: 'Old Wick', statBlock: 'srd:creature:tarrasque' });
    const out = await draftNpc('camp-1', null, 'a lamplighter');
    expect(out.statBlock).toBeNull();
  });
});

describe('heroFacts', () => {
  const classes = [{ name: 'Bard', data: { hitDie: 8 } }];
  const species = [{ name: 'Halfling' }];
  const backgrounds = [{ name: 'Entertainer' }];

  it('holds a reply to what the import accepts', () => {
    const facts = heroFacts(
      {
        name: 'Pip Underbough',
        class: 'bard',
        level: 99,
        species: 'halfling',
        background: 'Entertainer',
        abilities: { charisma: 40, dexterity: '14' },
        hitPointsMax: -3,
        items: [{ name: 'Lute', quantity: 0 }, { name: '' }],
        spells: [{ name: 'Vicious Mockery', level: 0 }],
        currency: { gp: -10, sp: 12 },
      },
      classes,
      species,
      backgrounds
    );
    expect(facts.classes).toEqual([
      { name: 'Bard', subclass: '', level: 20, hitDie: 8 },
    ]);
    expect(facts.species).toBe('Halfling');
    expect(facts.abilities.charisma).toBe(20);
    expect(facts.abilities.dexterity).toBe(14);
    expect(facts.abilities.strength).toBe(10);
    expect(facts.hitPointsMax).toBeNull();
    expect(facts.items).toEqual([
      { name: 'Lute', quantity: 1, equipped: false },
    ]);
    expect(facts.spells[0]).toEqual({
      name: 'Vicious Mockery',
      level: 0,
      prepared: true,
    });
    expect(facts.currency).toMatchObject({ gp: 0, sp: 12 });
  });

  it('needs a name', () => {
    expect(() => heroFacts({}, classes, species, backgrounds)).toThrow(
      'AI_BAD_REPLY'
    );
  });
});
