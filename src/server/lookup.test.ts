/**
 * Search on the session screen opens only what the reader could have read
 * on the tab it lives on: no hidden canon entry by id, no DM body, and no
 * homebrew monster out of the campaign's library for a player.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const { createCanonEntry } = await import('./canon');
const { createHomebrew } = await import('./homebrew');
const { addCampaignContent } = await import('./campaign-content');
const { bookIndex, openBook, openRecord } = await import('./lookup');

let dm = '';
let player = '';
const campaignId = 'camp-lookup';
let shared = '';
let hidden = '';
let monster = '';
let houseRule = '';

beforeAll(async () => {
  migrateTestDb();
  dm = seedUser('Dm');
  player = seedUser('Player');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'The Salt Road'
  );
  db.prepare(
    'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run('m-1', campaignId, player, 'player');
  db.close();

  signedIn = dm;
  shared = await createCanonEntry(campaignId, {
    kind: 'npc',
    title: 'Harrow Quill',
    partyBody: 'The ferryman.',
    dmBody: 'Knows about the ghouls.',
    visibility: 'shared',
  });
  hidden = await createCanonEntry(campaignId, {
    kind: 'npc',
    title: 'The drowned saint',
    partyBody: '',
    dmBody: 'The villain.',
  });
  monster = await createHomebrew({
    type: 'creature',
    name: 'Drowned ghoul',
    data: { creature_type: 'undead', challenge_rating: 2 },
  });
  houseRule = await createHomebrew({
    type: 'rule',
    name: 'Flanking',
    data: { summary: 'Advantage when an ally is opposite.' },
  });
  await addCampaignContent(campaignId, monster);
  await addCampaignContent(campaignId, houseRule);
});

const ref = (type: 'creature' | 'rule', key: string) => ({
  source: 'homebrew' as const,
  type,
  key,
});

describe('openRecord', () => {
  it('gives a player the shared entry without its DM body', async () => {
    signedIn = player;
    const got = await openRecord(campaignId, 'canon', shared);
    expect(got?.record).toBe('canon');
    if (got?.record !== 'canon') return;
    expect(got.entry.title).toBe('Harrow Quill');
    expect(got.entry.dmBody).toBeNull();
  });

  it('opens nothing a player has not been shown, even by id', async () => {
    signedIn = player;
    expect(await openRecord(campaignId, 'canon', hidden)).toBeNull();
    signedIn = dm;
    const got = await openRecord(campaignId, 'canon', hidden);
    expect(got?.record === 'canon' && got.entry.dmBody).toBe('The villain.');
  });
});

describe('the books', () => {
  it('lists the library’s house rules for everyone, its monsters for staff', async () => {
    signedIn = player;
    const forPlayer = (await bookIndex(campaignId)).map(h => h.name);
    expect(forPlayer).toContain('Flanking');
    expect(forPlayer).not.toContain('Drowned ghoul');
    expect(await openBook(campaignId, ref('creature', monster))).toBeNull();
    expect((await openBook(campaignId, ref('rule', houseRule)))?.name).toBe(
      'Flanking'
    );

    signedIn = dm;
    const forDm = await bookIndex(campaignId);
    const ghoul = forDm.find(h => h.name === 'Drowned ghoul');
    expect(ghoul).toMatchObject({ homebrew: true });
    expect(ghoul?.line).toContain('CR 2');
    expect((await openBook(campaignId, ref('creature', monster)))?.name).toBe(
      'Drowned ghoul'
    );
  });

  it('refuses somebody who is not at the table', async () => {
    signedIn = seedUser('Stranger');
    await expect(bookIndex(campaignId)).rejects.toThrow('NOT_FOUND');
  });
});
