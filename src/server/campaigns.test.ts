/**
 * Leaving is a member's own act; the DM cannot leave their own table, and
 * every open screen hears that the party changed.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const campaigns = await import('./campaigns');
const hub = await import('./live-hub');

const campaignId = 'camp-l';
let dm = '';
let player = '';

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
  ).run('m-l', campaignId, player, 'player');
  db.close();
});

describe('leaveCampaign', () => {
  it('takes the player off the table and tells the open screens', async () => {
    signedIn = player;
    const before = hub.versionOf(campaignId);
    await campaigns.leaveCampaign(campaignId);
    expect(hub.versionOf(campaignId)).toBeGreaterThan(before);
    await expect(
      campaigns.requireCampaignRole(campaignId, ['player'])
    ).rejects.toThrow('NOT_FOUND');
  });

  it('leaves the DM where they are', async () => {
    signedIn = dm;
    await campaigns.leaveCampaign(campaignId);
    const { role } = await campaigns.requireCampaignRole(campaignId, ['gm']);
    expect(role).toBe('gm');
  });
});
