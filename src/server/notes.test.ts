/**
 * A line passed on after the fact still arrives as a slip, to exactly the
 * people it now reaches — not something a player happens across later.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const notes = await import('./notes');
const hub = await import('./live-hub');

const campaignId = 'camp-n';
let dm = '';
let ada = '';
let bram = '';
let cass = '';

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  ada = seedUser('Ada');
  bram = seedUser('Bram');
  cass = seedUser('Cass');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'Saltmere'
  );
  const member = db.prepare(
    'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
  );
  member.run('m-a', campaignId, ada, 'player');
  member.run('m-b', campaignId, bram, 'player');
  member.run('m-c', campaignId, cass, 'player');
  db.close();
});

const revealsFor = (since: number, userId: string) =>
  (hub.replaySince(campaignId, since, { userId, role: 'player' }) ?? [])
    .map(frame => JSON.parse(/^data: (.*)$/m.exec(frame)![1]))
    .filter(event => event.kind === 'reveal');

describe('passing a private line on', () => {
  it('announces to the one person added, and nobody else', async () => {
    signedIn = dm;
    const id = await notes.revealExcerpt(campaignId, {
      body: 'The sexton lied about the bell.',
      visibility: 'selected',
      targetUserIds: [ada],
    });

    const before = hub.currentSeq(campaignId);
    await notes.addRevealTarget(id, bram);
    expect(revealsFor(before, bram)).toHaveLength(1);
    expect(revealsFor(before, cass)).toHaveLength(0);
  });

  it('announces to the whole party when it is shown to them', async () => {
    signedIn = dm;
    const id = await notes.revealExcerpt(campaignId, {
      body: 'The bell was never rung.',
      visibility: 'selected',
      targetUserIds: [ada],
    });

    const before = hub.currentSeq(campaignId);
    await notes.widenRevealToParty(id);
    expect(revealsFor(before, cass)).toHaveLength(1);
  });
});
