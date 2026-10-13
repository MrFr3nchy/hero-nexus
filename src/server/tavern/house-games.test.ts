import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const house = await import('./house-games');
const pkg = await import('../library-campaign-package');

const campaignId = 'camp-house';
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
  ).run('m-house', campaignId, player, 'player');
  db.close();
});

describe('house games', () => {
  let id = '';

  it('are the DM’s to write, and everyone’s to read', async () => {
    signedIn = dm;
    id = await house.createHouseGame(campaignId, {
      kind: 'liars-dice',
      name: '  Brannoc’s Bones ',
      blurb: 'Played in the Eel’s back room.',
      rules: { dicePerCup: 6, onesWild: false, anteCp: 200, junk: 'x' },
    });
    signedIn = player;
    const [row] = await house.listHouseGames(campaignId);
    expect(row).toMatchObject({
      name: 'Brannoc’s Bones',
      kind: 'liars-dice',
      rules: {
        dicePerCup: 6,
        onesWild: false,
        anteCp: 200,
        raiseCapCp: 500,
        spotOn: false,
      },
    });
    expect(row.rules).not.toHaveProperty('junk');
    expect(row.lines).toContain('Ones are only ones.');
    await expect(
      house.createHouseGame(campaignId, { kind: 'crowns', name: 'Mine' })
    ).rejects.toThrow('FORBIDDEN');
    await expect(house.deleteHouseGame(id)).rejects.toThrow('FORBIDDEN');
  });

  it('need a name and a kind the app knows', async () => {
    signedIn = dm;
    await expect(
      house.createHouseGame(campaignId, { kind: 'crowns', name: '  ' })
    ).rejects.toThrow('NO_NAME');
    await expect(
      house.createHouseGame(campaignId, {
        kind: 'poker' as 'crowns',
        name: 'Poker',
      })
    ).rejects.toThrow('BAD_KIND');
  });

  it('travel in a published campaign; tavern games played do not', async () => {
    signedIn = dm;
    const db = rawDb();
    db.prepare(
      "INSERT INTO tavern_games (id, campaign_id, kind, name, status) VALUES ('tg-1', ?, 'crowns', 'Played', 'ended')"
    ).run(campaignId);
    db.close();
    const publicationId = await pkg.publishCampaign(campaignId, {
      title: 'Saltmere',
    });
    signedIn = adopter;
    const adopted = await pkg.adoptCampaign(publicationId);
    const list = await house.listHouseGames(adopted);
    expect(list.map(g => g.name)).toEqual(['Brannoc’s Bones']);
    expect(list[0].rules).toMatchObject({ dicePerCup: 6, onesWild: false });
    const check = rawDb();
    const played = check
      .prepare('SELECT COUNT(*) AS n FROM tavern_games WHERE campaign_id = ?')
      .get(adopted) as { n: number };
    check.close();
    expect(played.n).toBe(0);
  });
});
