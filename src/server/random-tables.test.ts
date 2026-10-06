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
      die: 4,
      entries: [
        { text: 'Rain', from: 1, to: 3 },
        { text: 'A '.repeat(60) + 'very long fog', from: 4, to: 4 },
      ],
    });
    const [row] = await tables.listRandomTables(campaignId);
    expect(row).toMatchObject({ title: 'Weather', die: 4 });
    expect(row.entries[0]).toEqual({ text: 'Rain', from: 1, to: 3 });
    signedIn = player;
    await expect(tables.listRandomTables(campaignId)).rejects.toThrow(
      'FORBIDDEN'
    );
    await expect(tables.rollRandomTable(id)).rejects.toThrow('FORBIDDEN');
  });

  it('refuse two entries on one face, and a die not on the list', async () => {
    signedIn = dm;
    await expect(
      tables.updateRandomTable(id, {
        entries: [
          { text: 'A', from: 1, to: 3 },
          { text: 'B', from: 3, to: 4 },
        ],
      })
    ).rejects.toThrow('OVERLAP');
    await expect(tables.updateRandomTable(id, { die: 7 })).rejects.toThrow(
      'BAD_DIE'
    );
  });

  it('say so when the face lands on nothing', async () => {
    signedIn = dm;
    const gap = await tables.createRandomTable(campaignId, {
      title: 'Mostly empty',
      die: 100,
      entries: [{ text: 'Only on 01', from: 1, to: 1 }],
    });
    const r = await tables.rollRandomTable(gap);
    expect(r.notation).toBe('1d100');
    if (r.face === 1) expect(r.index).toBe(0);
    else {
      expect(r.index).toBeNull();
      expect(r.entry).toBe('nothing on that face');
    }
    await tables.deleteRandomTable(gap);
  });

  it('read a table from before dice off its weights', async () => {
    const db = rawDb();
    db.prepare(
      'INSERT INTO random_tables (id, campaign_id, title, entries) VALUES (?, ?, ?, ?)'
    ).run(
      'legacy',
      campaignId,
      'Old one',
      JSON.stringify([
        { text: 'A', weight: 2 },
        { text: 'B', weight: 4 },
      ])
    );
    db.close();
    signedIn = dm;
    const old = (await tables.listRandomTables(campaignId)).find(
      t => t.id === 'legacy'
    )!;
    expect(old).toMatchObject({
      die: 6,
      entries: [
        { text: 'A', from: 1, to: 2 },
        { text: 'B', from: 3, to: 6 },
      ],
    });
    await tables.deleteRandomTable('legacy');
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
      .prepare(
        'SELECT label, visibility, total FROM campaign_rolls ORDER BY created_at DESC LIMIT 1'
      )
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
    expect(list[0]).toMatchObject({ die: 4 });
    expect(list[0].entries[0]).toEqual({ text: 'Rain', from: 1, to: 3 });
  });
});
