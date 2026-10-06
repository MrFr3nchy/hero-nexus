import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const tables = await import('./random-tables');
const hub = await import('./live-hub');
const pkg = await import('./library-campaign-package');

const campaignId = 'camp-r';
let dm = '';
let player = '';
let adopter = '';

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  player = seedUser('Player');
  adopter = seedUser('Adopter');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'Saltmere'
  );
  db.prepare(
    'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run('m-r', campaignId, player, 'player');
  db.close();
});

describe('random tables', () => {
  let id = '';

  it('are the DM’s to write and read', async () => {
    signedIn = dm;
    id = await tables.createRandomTable(campaignId, {
      title: 'Weather',
      entries: [
        { text: 'Rain', weight: 3 },
        { text: 'A '.repeat(60) + 'very long fog', weight: 1 },
      ],
    });
    expect((await tables.listRandomTables(campaignId))[0].title).toBe(
      'Weather'
    );
    signedIn = player;
    await expect(tables.listRandomTables(campaignId)).rejects.toThrow(
      'FORBIDDEN'
    );
    await expect(tables.rollRandomTable(id)).rejects.toThrow('FORBIDDEN');
  });

  it('roll into Dice behind the screen, announced to staff only', async () => {
    signedIn = dm;
    const before = hub.currentSeq(campaignId);
    const r = await tables.rollRandomTable(id);
    expect(r.notation).toBe('1d4');
    expect(r.face).toBeGreaterThanOrEqual(1);
    expect(r.face).toBeLessThanOrEqual(4);
    expect(r.entry).toBe(
      r.face <= 3 ? 'Rain' : 'A '.repeat(60) + 'very long fog'
    );

    const db = rawDb();
    const row = db
      .prepare('SELECT label, visibility, total FROM campaign_rolls')
      .get() as { label: string; visibility: string; total: number };
    db.close();
    expect(row.visibility).toBe('dm');
    expect(row.total).toBe(r.face);
    expect(row.label.length).toBeLessThanOrEqual(80);

    expect(
      hub.replaySince(campaignId, before, { userId: player, role: 'player' })
    ).toEqual([]);
    expect(
      hub.replaySince(campaignId, before, { userId: dm, role: 'gm' })
    ).toHaveLength(1);
  });

  it('can be shown to the party', async () => {
    signedIn = dm;
    const before = hub.currentSeq(campaignId);
    await tables.rollRandomTable(id, true);
    expect(
      hub.replaySince(campaignId, before, { userId: player, role: 'player' })
    ).toHaveLength(1);
  });

  it('travel in a published campaign', async () => {
    signedIn = dm;
    const publicationId = await pkg.publishCampaign(campaignId, {
      title: 'Saltmere',
    });
    signedIn = adopter;
    const adopted = await pkg.adoptCampaign(publicationId);
    const list = await tables.listRandomTables(adopted);
    expect(list.map(t => t.title)).toEqual(['Weather']);
    expect(list[0].entries[0]).toEqual({ text: 'Rain', weight: 3 });
  });
});
