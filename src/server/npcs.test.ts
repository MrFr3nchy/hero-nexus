import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const canon = await import('./canon');
const npcs = await import('./npcs');
const plans = await import('./encounter-plans');
const pkg = await import('./library-campaign-package');

const campaignId = 'camp-n';
const GOBLIN = {
  source: 'srd' as const,
  type: 'creature' as const,
  key: 'srd-2024_goblin-boss',
};
let dm = '';
let player = '';
let npc = '';
let faction = '';

beforeAll(async () => {
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
  ).run('m-n', campaignId, player, 'player');
  const [row] = JSON.parse(
    readFileSync('test/fixtures/srd-goblin-boss.json', 'utf8')
  ) as { category: string; slug: string; name: string; data: string }[];
  db.prepare(
    'INSERT OR IGNORE INTO reference_data (category, slug, name, data) VALUES (?, ?, ?, ?)'
  ).run(row.category, row.slug, row.name, row.data);
  db.close();

  signedIn = dm;
  npc = await canon.createCanonEntry(campaignId, {
    kind: 'npc',
    title: 'Grizzlefang',
    partyBody: 'A goblin with ambitions.',
    dmBody: '',
    visibility: 'shared',
  });
  faction = await canon.createCanonEntry(campaignId, {
    kind: 'faction',
    title: 'The Duskwater',
    partyBody: '',
    dmBody: '',
    visibility: 'dm',
  });
});

describe('an NPC that can act', () => {
  it('keeps attitude and stat block from players', async () => {
    signedIn = dm;
    await npcs.setAttitude(npc, 'hostile');
    await npcs.setStatBlock(npc, GOBLIN);
    const staffView = (await canon.listCanon(campaignId)).find(
      e => e.id === npc
    )!;
    expect(staffView.attitude).toBe('hostile');
    expect(staffView.stat).toEqual({
      ref: GOBLIN,
      name: 'Goblin Boss',
      available: true,
    });

    signedIn = player;
    const playerView = (await canon.listCanon(campaignId)).find(
      e => e.id === npc
    )!;
    expect(playerView.attitude).toBeNull();
    expect(playerView.stat).toBeNull();
    expect(JSON.stringify(playerView)).not.toContain('hostile');
    await expect(npcs.setAttitude(npc, 'friendly')).rejects.toThrow(
      'FORBIDDEN'
    );
  });

  it('refuses a stat block that is not a creature in play', async () => {
    signedIn = dm;
    await expect(
      npcs.setStatBlock(npc, { ...GOBLIN, type: 'spell' as 'creature' })
    ).rejects.toThrow('NOT_A_CREATURE');
    await expect(
      npcs.setStatBlock(npc, { ...GOBLIN, key: 'srd-2024_nothing' })
    ).rejects.toThrow('NOT_IN_PLAY');
    await expect(npcs.setStatBlock(faction, GOBLIN)).rejects.toThrow(
      'NOT_AN_NPC'
    );
  });

  it('goes into an encounter as its stat block', async () => {
    signedIn = dm;
    const plan = await plans.createPlan(campaignId, { name: 'Ambush' });
    await npcs.addNpcToEncounter(npc, plan, 2);
    const [row] = (await plans.listPlans(campaignId)).filter(
      p => p.id === plan
    );
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0]).toMatchObject({ name: 'Goblin Boss', count: 2 });
  });
});

describe('faction standing', () => {
  it('sums all of it for staff, and only what was shown for the party', async () => {
    signedIn = dm;
    await npcs.recordStanding(faction, {
      delta: -2,
      reason: 'you burned their ledger',
      show: false,
    });
    // A faction the party has not been shown cannot have its standing shown.
    await expect(
      npcs.recordStanding(faction, { delta: 1, reason: 'a gift', show: true })
    ).rejects.toThrow('FACTION_HIDDEN');
    expect(await npcs.listStanding(faction)).toHaveLength(1);
    await canon.updateCanonEntry(faction, { visibility: 'shared' });
    await npcs.recordStanding(faction, {
      delta: 1,
      reason: 'a gift',
      show: false,
    });
    const [, second] = await npcs.listStanding(faction);
    await npcs.showStandingChange(second.id);

    const staffView = (await canon.listCanon(campaignId)).find(
      e => e.id === faction
    )!;
    expect(staffView.standing).toEqual({ shown: 1, total: -1 });

    signedIn = player;
    const playerView = (await canon.listCanon(campaignId)).find(
      e => e.id === faction
    )!;
    expect(playerView.standing).toEqual({ shown: 1, total: null });
    await expect(npcs.listStanding(faction)).rejects.toThrow('FORBIDDEN');

    const db = rawDb();
    const reveal = db
      .prepare('SELECT body FROM campaign_reveals WHERE campaign_id = ?')
      .get(campaignId) as { body: string };
    db.close();
    expect(reveal.body).toBe('The Duskwater: Warm (+1) — a gift');
  });

  it('refuses a step of nothing, and keeps a shown change', async () => {
    signedIn = dm;
    await expect(
      npcs.recordStanding(faction, { delta: 0, reason: '', show: false })
    ).rejects.toThrow('BAD_DELTA');
    const shown = (await npcs.listStanding(faction)).find(c => c.shown)!;
    await expect(npcs.removeStandingChange(shown.id)).rejects.toThrow(
      'ALREADY_SHOWN'
    );
  });
});

describe('the package', () => {
  it('carries attitude and an SRD stat block, never standing', async () => {
    signedIn = dm;
    const { payload } = await pkg.buildCampaignPackage(campaignId);
    const entry = payload.entries.find(e => e.title === 'Grizzlefang')!;
    expect(entry).toMatchObject({
      attitude: 'hostile',
      statSource: 'srd',
      statKey: GOBLIN.key,
    });
    expect(JSON.stringify(payload)).not.toContain('burned their ledger');
  });
});
