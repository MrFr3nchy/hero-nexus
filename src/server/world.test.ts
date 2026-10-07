import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const canon = await import('./canon');
const maps = await import('./maps');
const shops = await import('./shops');
const plans = await import('./encounter-plans');
const tables = await import('./random-tables');
const pkg = await import('./library-campaign-package');
const quests = await import('./quests');
const clocks = await import('./clocks');

/*
 * The world (0072): one pointer — where a thing is — joining canon, maps,
 * shops, encounter plans and random tables. Every check here is about what
 * that pointer may point at, and who may see it.
 */

const campaignId = 'camp-w';
let dm = '';
let kessa = '';
let rurik = '';
let adopter = '';
let mapId = '';

let coast = '';
let waterdeep = '';
let docks = '';
let durnan = '';

beforeAll(async () => {
  migrateTestDb();
  dm = seedUser('Dm');
  kessa = seedUser('Kessa');
  rurik = seedUser('Rurik');
  adopter = seedUser('Adopter');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'The Coast'
  );
  for (const [i, u] of [kessa, rurik].entries()) {
    db.prepare(
      'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).run(`w-${i}`, campaignId, u, 'player');
  }
  db.prepare(
    "INSERT INTO campaign_images (id, campaign_id, file_path, mime, bytes) VALUES ('img-w', ?, 'x.png', 'image/png', 1)"
  ).run(campaignId);
  db.close();

  signedIn = dm;
  const place = (title: string, placeId: string | null, shared = true) =>
    canon.createCanonEntry(campaignId, {
      kind: 'location',
      title,
      dmBody: '',
      partyBody: '',
      placeId,
      visibility: shared ? 'shared' : 'dm',
    });
  coast = await place('Sword Coast', null);
  waterdeep = await place('Waterdeep', coast);
  docks = await place('Dock Ward', waterdeep, false);
  durnan = await canon.createCanonEntry(campaignId, {
    kind: 'npc',
    title: 'Durnan',
    dmBody: 'Was an adventurer.',
    partyBody: 'Keeps the Portal.',
    visibility: 'shared',
    placeId: docks,
    fields: { personality: 'Gruff. '.repeat(80), role: 'Innkeeper' },
  });
  mapId = await maps.createMap(campaignId, {
    imageId: 'img-w',
    title: 'The Coast',
    visibility: 'shared',
    placeId: coast,
  });
});

const entriesAs = async (who: string) => {
  signedIn = who;
  return canon.listCanon(campaignId);
};
const mapAs = async (who: string) => {
  signedIn = who;
  return (await maps.listMaps(campaignId)).find(m => m.id === mapId)!;
};

describe('where things are', () => {
  it('is always a place, never one inside itself', async () => {
    signedIn = dm;
    await expect(
      canon.updateCanonEntry(waterdeep, { placeId: durnan })
    ).rejects.toThrow('NOT_A_PLACE');
    await expect(
      canon.updateCanonEntry(coast, { placeId: docks })
    ).rejects.toThrow('PLACE_LOOP');
    await expect(
      canon.updateCanonEntry(coast, { placeId: coast })
    ).rejects.toThrow('PLACE_LOOP');
    await expect(
      canon.updateCanonEntry(docks, { kind: 'lore' })
    ).rejects.toThrow('PLACE_IN_USE');
  });

  it('keeps a long fact long, and a short one short', async () => {
    const d = (await entriesAs(dm)).find(e => e.id === durnan)!;
    expect(d.fields.personality.length).toBe(400);
    expect(d.placeId).toBe(docks);
  });

  it('is hidden from a player when the place is', async () => {
    const seen = await entriesAs(kessa);
    expect(seen.find(e => e.id === durnan)!.placeId).toBeNull();
    expect(seen.find(e => e.id === waterdeep)!.placeId).toBe(coast);
    expect(seen.some(e => e.id === docks)).toBe(false);
  });

  it('sets a home loose, rather than deleting it, when the place goes', async () => {
    signedIn = dm;
    const shack = await canon.createCanonEntry(campaignId, {
      kind: 'location',
      title: 'Shack',
      dmBody: '',
      partyBody: '',
    });
    const hermit = await canon.createCanonEntry(campaignId, {
      kind: 'npc',
      title: 'Hermit',
      dmBody: '',
      partyBody: '',
      placeId: shack,
    });
    await canon.deleteCanonEntry(shack);
    const row = (await entriesAs(dm)).find(e => e.id === hermit)!;
    expect(row.placeId).toBeNull();
    await canon.deleteCanonEntry(hermit);
  });
});

describe('party notes', () => {
  it('any player who can read the entry may write one, signed', async () => {
    signedIn = kessa;
    await canon.addPartyNote(durnan, '  Owes us a drink.  ');
    await expect(canon.addPartyNote(docks, 'Smells of fish')).rejects.toThrow(
      'NOT_FOUND'
    );
    await expect(canon.addPartyNote(durnan, '   ')).rejects.toThrow(
      'EMPTY_NOTE'
    );
    const [note] = (await entriesAs(rurik)).find(
      e => e.id === durnan
    )!.partyNotes;
    expect(note).toMatchObject({
      body: 'Owes us a drink.',
      byName: 'Kessa',
      mine: false,
      canEdit: false,
    });
  });

  it('only its author rewrites it; the DM may take it down', async () => {
    const [note] = (await entriesAs(kessa)).find(
      e => e.id === durnan
    )!.partyNotes;
    signedIn = rurik;
    await expect(canon.updatePartyNote(note.id, 'Lies')).rejects.toThrow(
      'FORBIDDEN'
    );
    await expect(canon.deletePartyNote(note.id)).rejects.toThrow('FORBIDDEN');
    signedIn = dm;
    await expect(canon.updatePartyNote(note.id, 'Lies')).rejects.toThrow(
      'FORBIDDEN'
    );
    signedIn = kessa;
    await canon.updatePartyNote(note.id, 'Owes us two drinks.');
    expect(
      (await entriesAs(dm)).find(e => e.id === durnan)!.partyNotes[0]
    ).toMatchObject({ body: 'Owes us two drinks.', canEdit: true });
    signedIn = dm;
    await canon.deletePartyNote(note.id);
    expect(
      (await entriesAs(kessa)).find(e => e.id === durnan)!.partyNotes
    ).toEqual([]);
  });
});

describe('maps of places', () => {
  it('says what it shows, and a mark for a place opens its map', async () => {
    signedIn = dm;
    const cityMap = await maps.createMap(campaignId, {
      imageId: 'img-w',
      title: 'Waterdeep',
      visibility: 'shared',
      placeId: waterdeep,
    });
    await maps.addPin(mapId, {
      x: 0.5,
      y: 0.5,
      label: 'Waterdeep',
      canonEntryId: waterdeep,
      visibility: 'shared',
    });
    const pin = (await mapAs(rurik)).pins[0];
    expect(pin).toMatchObject({ canonKind: 'location', opensMapId: cityMap });
    signedIn = dm;
    await expect(maps.setMapPlace(cityMap, durnan)).rejects.toThrow(
      'NOT_A_PLACE'
    );
    // A map of a place the party has not been shown says nothing of it.
    await maps.setMapPlace(cityMap, docks);
    signedIn = rurik;
    expect(
      (await maps.listMaps(campaignId)).find(m => m.id === cityMap)!.placeId
    ).toBeNull();
    signedIn = dm;
    await maps.deleteMap(cityMap);
  });
});

describe('where the party is headed', () => {
  it('is planned by the DM, unnumbered and unseen until shown', async () => {
    signedIn = dm;
    await maps.addJourneyStop(mapId, { x: 0.1, y: 0.1, label: 'Daggerford' });
    const ahead = await maps.addJourneyStop(mapId, {
      x: 0.9,
      y: 0.1,
      label: 'Neverwinter',
      planned: true,
    });
    expect((await mapAs(dm)).journey.find(s => s.id === ahead)).toMatchObject({
      planned: true,
      seq: 0,
      visibility: 'dm',
    });
    expect((await mapAs(kessa)).journey.map(s => s.label)).toEqual([
      'Daggerford',
    ]);

    signedIn = kessa;
    await expect(maps.setStopVisibility(ahead, 'shared')).rejects.toThrow(
      'FORBIDDEN'
    );
    signedIn = dm;
    await maps.setStopVisibility(ahead, 'shared');
    expect((await mapAs(kessa)).journey).toHaveLength(2);

    // A stop made while one is planned takes the next number, not the
    // planned one's.
    signedIn = dm;
    await maps.addJourneyStop(mapId, { x: 0.3, y: 0.1, label: 'Ditch' });
    signedIn = dm;
    await maps.arriveAtStop(ahead);
    const journey = (await mapAs(kessa)).journey;
    expect(
      journey
        .filter(s => !s.planned)
        .sort((a, b) => a.seq - b.seq)
        .map(s => [s.seq, s.label])
    ).toEqual([
      [1, 'Daggerford'],
      [2, 'Ditch'],
      [3, 'Neverwinter'],
    ]);
  });
});

describe('battle marks', () => {
  it('point at the fight for the DM, and only say "battle" to a player', async () => {
    signedIn = dm;
    const planId = await plans.createPlan(campaignId, {
      name: 'Alley ambush',
      placeId: docks,
    });
    await expect(plans.updatePlan(planId, { placeId: durnan })).rejects.toThrow(
      'NOT_A_PLACE'
    );
    await maps.addPin(mapId, {
      x: 0.6,
      y: 0.6,
      label: 'The alley',
      kind: 'danger',
      encounterPlanId: planId,
      visibility: 'shared',
    });
    const dmPin = (await mapAs(dm)).pins.find(p => p.label === 'The alley')!;
    expect(dmPin).toMatchObject({
      battle: true,
      encounter: { id: planId, title: 'Alley ambush', ran: null },
    });
    const playerPin = (await mapAs(kessa)).pins.find(
      p => p.label === 'The alley'
    )!;
    expect(playerPin).toMatchObject({ battle: true, encounter: null });

    // A player cannot tie their own mark to a plan.
    signedIn = dm;
    await maps.setMarksOpen(mapId, true);
    signedIn = kessa;
    const theirs = await maps.addPin(mapId, {
      x: 0.2,
      y: 0.7,
      label: 'Ours',
      encounterPlanId: planId,
    });
    expect((await mapAs(dm)).pins.find(p => p.id === theirs)!.battle).toBe(
      false
    );

    signedIn = dm;
    const db = rawDb();
    db.prepare(
      "UPDATE encounter_plans SET ran_at = '2026-10-01T00:00:00Z' WHERE id = ?"
    ).run(planId);
    db.close();
    expect(
      (await mapAs(dm)).pins.find(p => p.label === 'The alley')!.encounter!.ran
    ).toBe('Fought');
    const [plan] = await plans.listPlans(campaignId);
    expect(plan).toMatchObject({ placeId: docks, ranSession: null });
  });
});

describe('shops', () => {
  it('stand somewhere and are kept by somebody', async () => {
    signedIn = dm;
    const shopId = await shops.createShop(campaignId, {
      name: 'The Portal bar',
      placeId: docks,
      keeperId: durnan,
      visibility: 'shared',
    });
    await expect(shops.updateShop(shopId, { keeperId: docks })).rejects.toThrow(
      'NOT_AN_NPC'
    );
    await expect(shops.updateShop(shopId, { placeId: durnan })).rejects.toThrow(
      'NOT_A_PLACE'
    );
    signedIn = dm;
    const [mine] = await shops.listShops(campaignId);
    expect(mine).toMatchObject({
      placeId: docks,
      keeper: { id: durnan, title: 'Durnan' },
    });
    // The keeper is known to the party; the Dock Ward is not, yet.
    signedIn = rurik;
    const [theirs] = await shops.listShops(campaignId);
    expect(theirs).toMatchObject({
      placeId: null,
      keeper: { id: durnan, title: 'Durnan' },
    });
  });
});

describe('plucking names', () => {
  let tableId = '';

  it('fills a place with people, striking each name through', async () => {
    signedIn = dm;
    tableId = await tables.createRandomTable(campaignId, {
      title: 'Dock names',
      die: 4,
      entries: [
        { text: 'Mira', from: 1, to: 1 },
        { text: 'Osk', from: 2, to: 2 },
        { text: 'Pell', from: 3, to: 4 },
      ],
    });
    const ids = await tables.pluckIntoPlace(tableId, docks, 2);
    expect(ids).toHaveLength(2);
    const made = (await entriesAs(dm)).filter(e => ids.includes(e.id));
    expect(made.every(e => e.kind === 'npc' && e.placeId === docks)).toBe(true);
    expect(made.every(e => e.visibility === 'dm')).toBe(true);

    signedIn = dm;
    const [table] = (await tables.listRandomTables(campaignId)).filter(
      t => t.id === tableId
    );
    const struck = table.entries.filter(e => e.struck);
    expect(struck.map(e => e.struck!.entryId).sort()).toEqual([...ids].sort());
    expect(made.map(e => e.title).sort()).toEqual(
      struck.map(e => e.text).sort()
    );
  });

  it('never rolls or draws a struck name', async () => {
    signedIn = dm;
    const [table] = (await tables.listRandomTables(campaignId)).filter(
      t => t.id === tableId
    );
    const live = table.entries.find(e => !e.struck)!.text;
    for (let i = 0; i < 12; i++) {
      expect((await tables.rollRandomTable(tableId)).entry).toBe(live);
    }
    expect((await tables.drawFromTable(tableId, 5)).map(d => d.text)).toEqual([
      live,
    ]);
  });

  it('keeps strikes through an edit, and can bring a name back', async () => {
    signedIn = dm;
    let [table] = (await tables.listRandomTables(campaignId)).filter(
      t => t.id === tableId
    );
    await tables.updateRandomTable(tableId, {
      entries: table.entries.map(({ text, from, to }) => ({ text, from, to })),
    });
    [table] = (await tables.listRandomTables(campaignId)).filter(
      t => t.id === tableId
    );
    expect(table.entries.filter(e => e.struck)).toHaveLength(2);

    const index = table.entries.findIndex(e => e.struck);
    await tables.restoreEntry(tableId, index);
    await expect(
      tables.strikeEntry(tableId, index, 'Not the name', null)
    ).rejects.toThrow('TABLE_CHANGED');
    await tables.strikeEntry(tableId, index, table.entries[index].text, null);
    await tables.restoreEntry(tableId, index);
    [table] = (await tables.listRandomTables(campaignId)).filter(
      t => t.id === tableId
    );
    expect(table.entries.filter(e => e.struck)).toHaveLength(1);
  });

  it('says so when every name is spent', async () => {
    signedIn = dm;
    const id = await tables.createRandomTable(campaignId, {
      title: 'One name',
      die: 4,
      entries: [{ text: 'Solo', from: 1, to: 4 }],
    });
    await tables.pluckIntoPlace(id, docks, 1);
    await expect(tables.rollRandomTable(id)).rejects.toThrow('ALL_STRUCK');
    await expect(tables.pluckIntoPlace(id, docks, 1)).rejects.toThrow(
      'ALL_STRUCK'
    );
  });
});

describe('quests and clocks in places', () => {
  it('places a quest only in a place, and its giver only as an NPC', async () => {
    signedIn = dm;
    await expect(
      quests.createQuest(campaignId, { title: 'Bad', placeId: durnan })
    ).rejects.toThrow('NOT_A_PLACE');
    await expect(
      quests.createQuest(campaignId, { title: 'Bad', giverId: docks })
    ).rejects.toThrow('NOT_AN_NPC');
    await expect(
      clocks.createClock(campaignId, { title: 'Bad', placeId: durnan })
    ).rejects.toThrow('NOT_A_PLACE');
    const q = await quests.createQuest(campaignId, {
      title: 'Ledger',
      placeId: docks,
      giverId: durnan,
    });
    await expect(
      quests.addObjective(q, 'Find it', 'shared', durnan)
    ).rejects.toThrow('NOT_A_PLACE');
    const step = await quests.addObjective(q, 'Find it', 'shared', waterdeep);
    await quests.setObjectivePlace(step, docks);
    const row = (await quests.listQuests(campaignId)).find(x => x.id === q)!;
    expect(row).toMatchObject({ placeId: docks, giverId: durnan });
    expect(row.objectives[0].placeId).toBe(docks);
    await quests.deleteQuest(q);
  });

  it('leaves the place alone on an unrelated edit, and clears it on null', async () => {
    signedIn = dm;
    const q = await quests.createQuest(campaignId, {
      title: 'Edit me',
      placeId: waterdeep,
    });
    await quests.updateQuest(q, { title: 'Edited' });
    const read = async () =>
      (await quests.listQuests(campaignId)).find(x => x.id === q)!;
    expect((await read()).placeId).toBe(waterdeep);
    await quests.updateQuest(q, { placeId: null });
    expect((await read()).placeId).toBeNull();
    await quests.deleteQuest(q);
  });

  it('keeps the quest and the clock, unplaced, when the place goes', async () => {
    signedIn = dm;
    const shed = await canon.createCanonEntry(campaignId, {
      kind: 'location',
      title: 'Shed',
      dmBody: '',
      partyBody: '',
    });
    const q = await quests.createQuest(campaignId, {
      title: 'In the shed',
      placeId: shed,
    });
    await quests.addObjective(q, 'Open it', 'shared', shed);
    const c = await clocks.createClock(campaignId, {
      title: 'Rot',
      placeId: shed,
    });
    await canon.deleteCanonEntry(shed);
    const quest = (await quests.listQuests(campaignId)).find(x => x.id === q)!;
    expect(quest.placeId).toBeNull();
    expect(quest.objectives[0].placeId).toBeNull();
    const clock = (await clocks.listClocks(campaignId)).find(x => x.id === c)!;
    expect(clock.placeId).toBeNull();
    await quests.deleteQuest(q);
    await clocks.deleteClock(c);
  });

  it('never hands a player the DM’s notes, steps or clocks — nor a hidden place', async () => {
    signedIn = dm;
    const q = await quests.createQuest(campaignId, {
      title: 'Shown',
      dmNotes: 'The ledger is a forgery.',
      visibility: 'shared',
      placeId: docks,
    });
    await quests.addObjective(q, 'Ask Durnan', 'shared', waterdeep);
    await quests.addObjective(q, 'It is forged', 'dm', docks);
    const hidden = await quests.createQuest(campaignId, { title: 'Hook' });
    const shown = await clocks.createClock(campaignId, {
      title: 'Tide',
      dmNote: 'The crypt floods.',
      visibility: 'shared',
      placeId: waterdeep,
    });
    const secret = await clocks.createClock(campaignId, {
      title: 'Cult',
      placeId: docks,
    });

    signedIn = kessa;
    const seen = await quests.listQuests(campaignId);
    expect(seen.some(x => x.id === hidden)).toBe(false);
    const mine = seen.find(x => x.id === q)!;
    expect(mine.dmNotes).toBeNull();
    // The Dock Ward is the DM's: the quest is in no place Kessa knows.
    expect(mine.placeId).toBeNull();
    expect(mine.objectives).toHaveLength(1);
    expect(mine.objectives[0]).toMatchObject({
      body: 'Ask Durnan',
      placeId: waterdeep,
    });
    const ticking = await clocks.listClocks(campaignId);
    expect(ticking.some(x => x.id === secret)).toBe(false);
    expect(ticking.find(x => x.id === shown)).toMatchObject({
      dmNote: null,
      placeId: waterdeep,
    });
    expect(JSON.stringify([seen, ticking])).not.toMatch(/forg|floods/);

    signedIn = dm;
    await quests.deleteQuest(q);
    await quests.deleteQuest(hidden);
    await clocks.deleteClock(shown);
    await clocks.deleteClock(secret);
  });
});

describe('make it real', () => {
  it('turns a player’s guess into a place, and keeps whose guess it was', async () => {
    signedIn = dm;
    await maps.setMarksOpen(mapId, true);
    signedIn = kessa;
    const guess = await maps.addPin(mapId, {
      x: 0.4,
      y: 0.4,
      label: 'Old shrine?',
      note: 'The miller said past the wood.',
      kind: 'rumour',
    });
    await expect(maps.promoteRumour(guess)).rejects.toThrow();

    signedIn = dm;
    const place = await maps.promoteRumour(guess);
    const entry = (await entriesAs(dm)).find(e => e.id === place)!;
    expect(entry).toMatchObject({
      kind: 'location',
      title: 'Old shrine?',
      partyBody: 'The miller said past the wood.',
      placeId: coast,
      visibility: 'shared',
    });
    const pin = (await mapAs(rurik)).pins.find(p => p.id === guess)!;
    expect(pin).toMatchObject({
      kind: 'place',
      canonEntryId: place,
      byName: 'Kessa',
    });
    // Only a rumour is made real.
    signedIn = dm;
    await expect(maps.promoteRumour(guess)).rejects.toThrow('NOT_A_RUMOUR');
    await maps.setMarksOpen(mapId, false);
  });
});

describe('a stop at a place with no map', () => {
  it('puts the party somewhere on day one, and keeps a hidden place hidden', async () => {
    signedIn = kessa;
    await expect(maps.addPlaceStop(campaignId, waterdeep)).rejects.toThrow();
    signedIn = dm;
    await expect(maps.addPlaceStop(campaignId, durnan)).rejects.toThrow(
      'NOT_A_PLACE'
    );
    const first = await maps.addPlaceStop(campaignId, docks);
    const ahead = await maps.addPlaceStop(campaignId, waterdeep, {
      planned: true,
    });

    const mine = await maps.listPlaceStops(campaignId);
    expect(mine.map(s => [s.id, s.seq, s.planned, s.placeId])).toEqual([
      [first, 1, false, docks],
      [ahead, 0, true, waterdeep],
    ]);

    signedIn = kessa;
    const theirs = await maps.listPlaceStops(campaignId);
    // The Dock Ward is the DM's, and where the party is headed is too.
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ id: first, placeId: null, seq: 1 });

    signedIn = dm;
    await maps.arriveAtStop(ahead);
    const after = await maps.listPlaceStops(campaignId);
    expect(after.find(s => s.id === ahead)).toMatchObject({
      planned: false,
      seq: 2,
      visibility: 'shared',
    });
    await maps.removeJourneyStop(first);
    expect((await maps.listPlaceStops(campaignId))[0]).toMatchObject({
      id: ahead,
      seq: 1,
    });
    // Deleting the place leaves the stop, under its name.
    const hut = await canon.createCanonEntry(campaignId, {
      kind: 'location',
      title: 'Hut',
      dmBody: '',
      partyBody: '',
    });
    const there = await maps.addPlaceStop(campaignId, hut);
    await canon.deleteCanonEntry(hut);
    expect(
      (await maps.listPlaceStops(campaignId)).find(s => s.id === there)
    ).toMatchObject({ placeId: null, label: 'Hut' });
    await maps.removeJourneyStop(there);
    await maps.removeJourneyStop(ahead);
  });
});

describe('the package', () => {
  it('carries where things are, the shops and the fights — not the notes', async () => {
    signedIn = kessa;
    await canon.addPartyNote(durnan, 'Never trust the Ditch.');
    signedIn = dm;
    const { payload } = await pkg.buildCampaignPackage(campaignId);
    expect(payload.entries.find(e => e.key === docks)!.placeKey).toBe(
      waterdeep
    );
    expect(payload.maps.find(m => m.key === mapId)!.placeKey).toBe(coast);
    expect(payload.shops![0]).toMatchObject({
      placeKey: docks,
      keeperKey: durnan,
    });
    expect(payload.plans![0]).toMatchObject({
      name: 'Alley ambush',
      placeKey: docks,
    });
    const alley = payload.maps[0].pins.find(p => p.label === 'The alley')!;
    expect(alley.encounterPlanKey).toBe(payload.plans![0].key);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('Never trust the Ditch');
    expect(json).not.toContain('ran_at');
    expect(json).not.toContain('2026-10-01');
  });

  it('re-points every link at the adopter’s own rows', async () => {
    // A second table with no pictures: a package copies its maps' files,
    // which this test has none of.
    const other = 'camp-w2';
    const db = rawDb();
    db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
      other,
      dm,
      'Elsewhere'
    );
    db.close();
    signedIn = dm;
    const town = await canon.createCanonEntry(other, {
      kind: 'location',
      title: 'Town',
      dmBody: '',
      partyBody: '',
    });
    const inn = await canon.createCanonEntry(other, {
      kind: 'location',
      title: 'Inn',
      dmBody: '',
      partyBody: '',
      placeId: town,
    });
    const keeper = await canon.createCanonEntry(other, {
      kind: 'npc',
      title: 'Keeper',
      dmBody: '',
      partyBody: '',
      placeId: inn,
    });
    await shops.createShop(other, {
      name: 'Bar',
      placeId: inn,
      keeperId: keeper,
    });
    await plans.createPlan(other, { name: 'Brawl', placeId: inn });
    const errand = await quests.createQuest(other, {
      title: 'Errand',
      placeId: town,
      giverId: keeper,
    });
    await quests.addObjective(errand, 'Go to the inn', 'shared', inn);
    const names = await tables.createRandomTable(other, {
      title: 'Names',
      die: 4,
      entries: [{ text: 'Ash', from: 1, to: 4 }],
    });
    const [ash] = await tables.pluckIntoPlace(names, inn, 1);

    const publicationId = await pkg.publishCampaign(other, {
      title: 'Elsewhere',
    });
    signedIn = adopter;
    const adopted = await pkg.adoptCampaign(publicationId);

    const rows = await canon.listCanon(adopted);
    const byTitle = (t: string) => rows.find(r => r.title === t)!;
    expect(byTitle('Inn').placeId).toBe(byTitle('Town').id);
    expect(byTitle('Keeper').placeId).toBe(byTitle('Inn').id);
    expect(byTitle('Ash').placeId).toBe(byTitle('Inn').id);
    expect(byTitle('Ash').id).not.toBe(ash);

    const [shop] = await shops.listShops(adopted);
    expect(shop).toMatchObject({
      placeId: byTitle('Inn').id,
      keeper: { id: byTitle('Keeper').id },
    });
    const [plan] = await plans.listPlans(adopted);
    expect(plan).toMatchObject({ name: 'Brawl', placeId: byTitle('Inn').id });
    const [quest] = await quests.listQuests(adopted);
    expect(quest).toMatchObject({
      title: 'Errand',
      placeId: byTitle('Town').id,
      giverId: byTitle('Keeper').id,
    });
    expect(quest.objectives[0].placeId).toBe(byTitle('Inn').id);
    const [table] = await tables.listRandomTables(adopted);
    expect(table.entries[0].struck).toEqual({ entryId: byTitle('Ash').id });
  });
});
