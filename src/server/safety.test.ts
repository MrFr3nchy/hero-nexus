import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const safety = await import('./safety');
const hub = await import('./live-hub');
const session = await import('./session');

const campaignId = 'camp-s';
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
  ).run('m-s', campaignId, player, 'player');
  db.close();
});

describe('lines and veils', () => {
  it('stores a player’s addition with no trace of who', async () => {
    signedIn = player;
    await safety.addSafety(campaignId, { kind: 'line', text: ' Spiders ' });
    signedIn = dm;
    await safety.addSafety(campaignId, { kind: 'veil', text: 'Torture' });

    const db = rawDb();
    const rows = db.prepare('SELECT * FROM campaign_safety').all();
    const cols = db
      .prepare('PRAGMA table_info(campaign_safety)')
      .all()
      .map(c => (c as { name: string }).name);
    db.close();
    expect(cols).toEqual([
      'id',
      'campaign_id',
      'kind',
      'text',
      'source',
      'created_at',
    ]);
    expect(JSON.stringify(rows)).not.toContain(player);
    expect(JSON.stringify(rows)).not.toContain(dm);

    signedIn = player;
    const list = await safety.listSafety(campaignId);
    expect(list.map(r => [r.kind, r.text, r.source])).toEqual([
      ['line', 'Spiders', 'player'],
      ['veil', 'Torture', 'staff'],
    ]);
  });

  it('only staff take one down', async () => {
    signedIn = player;
    const [row] = await safety.listSafety(campaignId);
    await expect(safety.deleteSafety(campaignId, row.id)).rejects.toThrow(
      'FORBIDDEN'
    );
    signedIn = dm;
    await safety.deleteSafety(campaignId, row.id);
    expect(await safety.listSafety(campaignId)).toHaveLength(1);
  });
});

describe('the X-card', () => {
  it('tells staff with no identity, and holds the countdowns', async () => {
    signedIn = dm;
    await session.startTimer(campaignId, { label: 'The bridge', seconds: 60 });
    const before = hub.currentSeq(campaignId);

    signedIn = player;
    expect(await safety.tapXCard(campaignId)).toEqual({ pausedTimers: 1 });

    const frames = hub.replaySince(campaignId, before, {
      userId: dm,
      role: 'gm',
    });
    // The SSE frame, exactly as the DM's browser would receive it.
    expect(frames).toHaveLength(1);
    const data = /^data: (.*)$/m.exec(frames![0])![1];
    expect(JSON.parse(data)).toMatchObject({ kind: 'safety', by: null });
    expect(JSON.stringify(frames)).not.toContain(player);
    expect(
      hub.replaySince(campaignId, before, { userId: player, role: 'player' })
    ).toHaveLength(0);

    signedIn = dm;
    const held = (await session.getLiveState(campaignId)).timers;
    expect(held[0].pausedAt).not.toBeNull();
    await session.resumeTimers(campaignId);
    const running = (await session.getLiveState(campaignId)).timers;
    expect(running[0].pausedAt).toBeNull();
    expect(Date.parse(running[0].endsAt)).toBeGreaterThanOrEqual(
      Date.parse(held[0].endsAt)
    );
  });

  it('staff cannot tap it, and a player cannot flood it', async () => {
    signedIn = dm;
    await expect(safety.tapXCard(campaignId)).rejects.toThrow('FORBIDDEN');
    signedIn = player;
    await safety.tapXCard(campaignId);
    await safety.tapXCard(campaignId);
    await expect(safety.tapXCard(campaignId)).rejects.toThrow('RATE_LIMITED');
  });
});

describe('session zero', () => {
  it('is session 0 with the questionnaire, planned once', async () => {
    signedIn = dm;
    const a = await safety.planSessionZero(campaignId);
    const b = await safety.planSessionZero(campaignId);
    expect(a).toBe(b);
    const db = rawDb();
    const s = db
      .prepare('SELECT number, title FROM campaign_sessions WHERE id = ?')
      .get(a);
    const form = db
      .prepare(
        'SELECT questions FROM session_feedback_forms WHERE session_id = ?'
      )
      .get(a) as { questions: string };
    db.close();
    expect(s).toEqual({ number: 0, title: 'Session zero' });
    expect(JSON.parse(form.questions)[0].prompt).toMatch(/drew you/);
  });
});
