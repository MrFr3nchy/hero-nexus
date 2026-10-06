import { beforeAll, describe, expect, it, vi } from 'vitest';

import { cellAt, cellsInBrush } from '@/@creator/campaign/lib/party-map';
import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const maps = await import('./maps');
const quests = await import('./quests');
const sessions = await import('./campaign-sessions');
const pkg = await import('./library-campaign-package');

const campaignId = 'camp-m';
let dm = '';
let kessa = '';
let rurik = '';
let mapId = '';

beforeAll(async () => {
  migrateTestDb();
  dm = seedUser('Dm');
  kessa = seedUser('Kessa');
  rurik = seedUser('Rurik');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'Saltmere'
  );
  for (const [i, u] of [kessa, rurik].entries()) {
    db.prepare(
      'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).run(`m-${i}`, campaignId, u, 'player');
  }
  db.prepare(
    "INSERT INTO campaign_images (id, campaign_id, file_path, mime, bytes) VALUES ('img', ?, 'x.png', 'image/png', 1)"
  ).run(campaignId);
  db.close();
  signedIn = dm;
  mapId = await maps.createMap(campaignId, {
    imageId: 'img',
    title: 'The valley',
    visibility: 'shared',
  });
});

const mine = async (who: string) => {
  signedIn = who;
  const [map] = await maps.listMaps(campaignId);
  return map;
};

describe('marks', () => {
  it('a player may mark only a map the DM has opened', async () => {
    signedIn = kessa;
    await expect(maps.addPin(mapId, { x: 0.2, y: 0.2 })).rejects.toThrow(
      'MARKS_CLOSED'
    );
    signedIn = dm;
    await maps.setMarksOpen(mapId, true);
    signedIn = kessa;
    await maps.addPin(mapId, {
      x: 0.2,
      y: 0.2,
      label: 'The Drowned Bell',
      kind: 'camp',
      note: 'Good ale.',
      dmNote: 'ignored',
      visibility: 'dm',
    });
    const seen = (await mine(rurik)).pins;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      label: 'The Drowned Bell',
      kind: 'camp',
      note: 'Good ale.',
      dmNote: null,
      visibility: 'shared',
      byName: 'Kessa',
      mine: false,
      canEdit: false,
    });
  });

  it('a player edits only their own; the DM edits any', async () => {
    const pin = (await mine(kessa)).pins[0];
    signedIn = rurik;
    await expect(maps.updatePin(pin.id, { label: 'Mine now' })).rejects.toThrow(
      'FORBIDDEN'
    );
    await expect(maps.deletePin(pin.id)).rejects.toThrow('FORBIDDEN');
    signedIn = kessa;
    await maps.updatePin(pin.id, { note: 'Better ale.' });
    signedIn = dm;
    await maps.updatePin(pin.id, { dmNote: 'The barkeep is a spy.' });
    expect((await mine(kessa)).pins[0]).toMatchObject({
      note: 'Better ale.',
      dmNote: null,
    });
  });

  it('a link must be something the marker can read', async () => {
    signedIn = dm;
    const secret = await quests.createQuest(campaignId, {
      title: 'The cult',
      visibility: 'dm',
    });
    const open = await quests.createQuest(campaignId, {
      title: 'The missing miller',
      visibility: 'shared',
    });
    signedIn = kessa;
    await expect(
      maps.addPin(mapId, { x: 0.3, y: 0.3, questId: secret })
    ).rejects.toThrow('NOT_FOUND');
    await maps.addPin(mapId, {
      x: 0.3,
      y: 0.3,
      label: 'The mill',
      questId: open,
    });
    const mill = (await mine(rurik)).pins.find(p => p.label === 'The mill')!;
    expect(mill.quest).toEqual({ id: open, title: 'The missing miller' });
    signedIn = rurik;
    expect(
      (await maps.recordsOnMaps(campaignId)).find(r => r.questId === open)
    ).toMatchObject({ label: 'The mill', mapTitle: 'The valley' });
  });
});

describe('fog of war', () => {
  it('hides marks in fog from players, and refuses marks there', async () => {
    signedIn = dm;
    const hidden = await maps.addPin(mapId, {
      x: 0.9,
      y: 0.9,
      label: 'Cult safehouse',
      visibility: 'shared',
    });
    await maps.setMapFog(mapId, true);
    await maps.revealMapCells(mapId, cellsInBrush(0.25, 0.25, 0.1, 0.75), true);

    const seen = (await mine(rurik)).pins.map(p => p.label);
    expect(seen).toContain('The Drowned Bell');
    expect(seen).not.toContain('Cult safehouse');
    expect((await mine(dm)).pins.map(p => p.id)).toContain(hidden);

    signedIn = kessa;
    await expect(maps.addPin(mapId, { x: 0.9, y: 0.9 })).rejects.toThrow(
      'IN_FOG'
    );
    expect((await mine(kessa)).revealed).toContain(cellAt(0.25, 0.25));
  });
});

describe('the journey', () => {
  it('is the DM’s, numbered, stamped with the session, and closes up', async () => {
    signedIn = kessa;
    await expect(
      maps.addJourneyStop(mapId, { x: 0.1, y: 0.1 })
    ).rejects.toThrow('FORBIDDEN');

    signedIn = dm;
    await sessions.openSitting(campaignId);
    const bell = (await mine(dm)).pins.find(
      p => p.label === 'The Drowned Bell'
    )!;
    await maps.addJourneyStop(mapId, { x: 0.1, y: 0.1, label: 'The ford' });
    const second = await maps.addJourneyStop(mapId, {
      x: 0,
      y: 0,
      pinId: bell.id,
    });
    await maps.addJourneyStop(mapId, { x: 0.4, y: 0.3, label: 'The mill' });

    let journey = (await mine(rurik)).journey;
    expect(journey.map(s => [s.seq, s.label])).toEqual([
      [1, 'The ford'],
      [2, 'The Drowned Bell'],
      [3, 'The mill'],
    ]);
    expect(journey[1]).toMatchObject({ x: bell.x, y: bell.y, pinId: bell.id });
    expect(journey[0].sessionLabel).toBe('Session 1');
    expect((await mine(rurik)).pins.find(p => p.id === bell.id)!.stops).toEqual(
      [2]
    );

    signedIn = rurik;
    await expect(maps.renameJourneyStop(journey[2].id, 'Mine')).rejects.toThrow(
      'FORBIDDEN'
    );
    signedIn = dm;
    await maps.renameJourneyStop(journey[2].id, '  The old mill  ');
    expect((await mine(rurik)).journey[2].label).toBe('The old mill');
    signedIn = dm;
    await maps.removeJourneyStop(second);
    journey = (await mine(rurik)).journey;
    expect(journey.map(s => [s.seq, s.label])).toEqual([
      [1, 'The ford'],
      [2, 'The old mill'],
    ]);
  });
});

describe('the package', () => {
  it('carries the DM’s marks, never a player’s, the journey or the reveal', async () => {
    signedIn = dm;
    const { payload } = await pkg.buildCampaignPackage(campaignId);
    const map = payload.maps[0];
    expect(map.pins.map(p => p.label)).toEqual(['Cult safehouse']);
    expect(map).toMatchObject({ marksOpen: true, fogged: true });
    expect(JSON.stringify(payload)).not.toContain('The ford');
    expect(JSON.stringify(payload)).not.toContain('revealed');
  });
});
