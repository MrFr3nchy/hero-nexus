/**
 * The server-module pattern: a migrated temp database, a mocked `auth()`, and
 * the real module under test. See `test/db.ts`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const { createCanonEntry, listCanon } = await import('./canon');

let dm = '';
let player = '';
let stranger = '';
const campaignId = 'camp-1';

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  player = seedUser('Player');
  stranger = seedUser('Stranger');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'Saltmere'
  );
  db.prepare(
    'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run('m-1', campaignId, player, 'player');
  db.close();
});

describe('listCanon', () => {
  it('strips the DM body and hides DM-only entries from a player', async () => {
    signedIn = dm;
    await createCanonEntry(campaignId, {
      kind: 'npc',
      title: 'Ambrose Quill',
      partyBody: 'The sexton.',
      dmBody: 'Knows where the bodies are.',
      visibility: 'shared',
    });
    await createCanonEntry(campaignId, {
      kind: 'npc',
      title: 'The drowned saint',
      partyBody: '',
      dmBody: 'The villain.',
    });

    expect((await listCanon(campaignId)).map(e => e.dmBody).sort()).toEqual([
      'Knows where the bodies are.',
      'The villain.',
    ]);

    signedIn = player;
    const seen = await listCanon(campaignId);
    expect(seen.map(e => e.title)).toEqual(['Ambrose Quill']);
    expect(seen[0].dmBody).toBeNull();
  });

  it('refuses somebody who is not at the table', async () => {
    signedIn = stranger;
    await expect(listCanon(campaignId)).rejects.toThrow('NOT_FOUND');
    signedIn = null;
    await expect(listCanon(campaignId)).rejects.toThrow('NOT_AUTHENTICATED');
  });
});
