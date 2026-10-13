/**
 * The live sitting is on every open table, so a chronicle write that changes
 * it must `bumpVersion` (src/db/README.md § Real-time); one that only touches
 * an evening nobody is sitting in must not wake every table.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const sessions = await import('./campaign-sessions');
const hub = await import('./live-hub');

const campaignId = 'camp-s';
let dm = '';

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'Saltmere'
  );
  db.close();
});

beforeEach(() => {
  signedIn = dm;
});

const bumped = async (write: () => Promise<unknown>) => {
  const before = hub.versionOf(campaignId);
  await write();
  return hub.versionOf(campaignId) > before;
};

describe('chronicle writes and the live sitting', () => {
  it('leaves the tables alone when the evening is not the live one', async () => {
    const planned = await sessions.createSession(campaignId, {
      title: 'Later',
    });
    expect(
      await bumped(() =>
        sessions.updateSession(planned, { prepBody: 'Bring the map.' })
      )
    ).toBe(false);
    expect(await bumped(() => sessions.deleteSession(planned))).toBe(false);
  });

  it('bumps when the live sitting is retitled', async () => {
    const live = await sessions.openSitting(campaignId);
    expect(
      await bumped(() => sessions.updateSession(live, { title: 'The Gaol' }))
    ).toBe(true);
  });

  it('bumps when the live sitting is marked played from the chronicle', async () => {
    const live = await sessions.openSitting(campaignId);
    expect(await bumped(() => sessions.markSessionPlayed(live))).toBe(true);
  });

  it('bumps when the live sitting is deleted', async () => {
    const live = await sessions.openSitting(campaignId);
    expect(await bumped(() => sessions.deleteSession(live))).toBe(true);
  });
});
