/**
 * Playing a tavern game against a migrated temp database: who may do what,
 * what each viewer is shown, where the coin goes, and that a cheat stays
 * between the cheater and the DM.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { makeEmptySheet } from '@/@creator/character/schema';
import { migrateTestDb, rawDb, seedUser } from '../../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const games = await import('./games');
const view = await import('./view');
const hub = await import('../live-hub');
const { getLiveState } = await import('../session');

const campaignId = 'camp-tavern';
let dm = '';
let kessaPlayer = '';
let tobinPlayer = '';
let watcher = '';

function seedHero(id: string, owner: string, gp: number, tools = ''): void {
  const sheet = makeEmptySheet();
  sheet.identity.level = 5;
  sheet.currency.gp = gp;
  sheet.proficiencies.tools = tools;
  sheet.abilities.dexterity = { score: 16, proficientSave: false };
  sheet.skills.sleightOfHand = true;
  const db = rawDb();
  db.prepare(
    'INSERT INTO characters (id, owner_id, name, campaign_id, sheet) VALUES (?, ?, ?, ?, ?)'
  ).run(
    id,
    owner,
    id === 'kessa' ? 'Kessa' : 'Tobin',
    campaignId,
    JSON.stringify(sheet)
  );
  db.close();
}

function gold(id: string): number {
  const db = rawDb();
  const row = db
    .prepare('SELECT sheet FROM characters WHERE id = ?')
    .get(id) as {
    sheet: string;
  };
  db.close();
  const c = JSON.parse(row.sheet).currency;
  return c.gp * 100 + c.sp * 10 + c.cp + c.pp * 1000 + c.ep * 50;
}

function setCups(gameId: string, cups: Record<string, number[]>): void {
  const db = rawDb();
  const row = db
    .prepare('SELECT state FROM tavern_games WHERE id = ?')
    .get(gameId) as { state: string };
  const state = JSON.parse(row.state);
  state.current.cups = cups;
  db.prepare('UPDATE tavern_games SET state = ? WHERE id = ?').run(
    JSON.stringify(state),
    gameId
  );
  db.close();
}

const as = (userId: string, role: 'gm' | 'player') => ({ userId, role });

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  kessaPlayer = seedUser('Kessa player');
  tobinPlayer = seedUser('Tobin player');
  watcher = seedUser('Watcher');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'The Gilded Eel'
  );
  for (const [i, u] of [kessaPlayer, tobinPlayer, watcher].entries()) {
    db.prepare(
      'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).run(`m-t${i}`, campaignId, u, 'player');
  }
  db.prepare(
    "INSERT INTO canon_entries (id, campaign_id, kind, title, attitude) VALUES ('brannoc', ?, 'npc', 'Old Brannoc', 'indifferent')"
  ).run(campaignId);
  db.close();
  seedHero('kessa', kessaPlayer, 20, 'Dice set');
  seedHero('tobin', tobinPlayer, 3);
});

describe('liar’s dice at the table', () => {
  let gameId = '';
  const seat: Record<string, string> = {};

  it('is opened by the DM alone, one at a time', async () => {
    signedIn = kessaPlayer;
    await expect(
      games.openTavernGame(campaignId, {
        kind: 'liars-dice',
        npcIds: ['brannoc'],
        characterIds: ['kessa'],
      })
    ).rejects.toThrow('FORBIDDEN');
    signedIn = dm;
    gameId = await games.openTavernGame(campaignId, {
      kind: 'liars-dice',
      name: 'Dice at the Eel',
      rules: { anteCp: 100, raiseCapCp: 200 },
      npcIds: ['brannoc'],
      characterIds: ['kessa', 'tobin'],
    });
    await expect(
      games.openTavernGame(campaignId, {
        kind: 'crowns',
        npcIds: ['brannoc'],
        characterIds: ['kessa'],
      })
    ).rejects.toThrow('RUNNING');
    const v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    for (const s of v!.seats) seat[s.name] = s.id;
    expect(v!.seats.map(s => [s.name, s.status])).toEqual([
      ['Kessa', 'invited'],
      ['Old Brannoc', 'seated'],
      ['Tobin', 'invited'],
    ]);
    expect(v!.seats[1].attitude).toBe('indifferent');
    const p = await view.tavernViewFor(campaignId, as(watcher, 'player'));
    expect(p!.seats[1].attitude).toBeNull();
    expect(p!.seats[0].passives).toBeNull();
  });

  it('seats a hero only when their player says so', async () => {
    signedIn = watcher;
    await expect(games.answerSeat(gameId, true)).rejects.toThrow(
      'NOT_YOUR_SEAT'
    );
    signedIn = kessaPlayer;
    await games.answerSeat(gameId, true);
    signedIn = tobinPlayer;
    await games.answerSeat(gameId, true);
    await expect(games.answerSeat(gameId, true)).rejects.toThrow('NOT_INVITED');
  });

  it('takes the ante from each purse when the DM shakes the cups', async () => {
    signedIn = tobinPlayer;
    await expect(games.startRound(gameId)).rejects.toThrow('FORBIDDEN');
    signedIn = dm;
    const { started } = await games.startRound(gameId);
    expect(started).toBe(true);
    expect(gold('kessa')).toBe(1900);
    expect(gold('tobin')).toBe(200);
    const db = rawDb();
    const history = db
      .prepare(
        "SELECT detail FROM character_history WHERE character_id = 'kessa' AND kind = 'currency'"
      )
      .all() as { detail: string }[];
    db.close();
    expect(history.map(h => h.detail)).toEqual([
      'Ante at Dice at the Eel, round 1',
    ]);
  });

  it('shows each player their own cup and nobody else’s', async () => {
    setCups(gameId, {
      [seat.Kessa]: [5, 1, 5, 2, 6],
      [seat['Old Brannoc']]: [2, 3, 6, 4, 6],
      [seat.Tobin]: [3, 4, 4, 1, 2],
    });
    const k = await view.tavernViewFor(campaignId, as(kessaPlayer, 'player'));
    expect(k!.liars!.cups[seat.Kessa]).toEqual([5, 1, 5, 2, 6]);
    expect(k!.liars!.cups[seat.Tobin]).toBeNull();
    expect(k!.liars!.cups[seat['Old Brannoc']]).toBeNull();
    expect(k!.you).toMatchObject({ seatId: seat.Kessa, proficient: true });
    const w = await view.tavernViewFor(campaignId, as(watcher, 'player'));
    expect(Object.values(w!.liars!.cups).every(c => c === null)).toBe(true);
    expect(w!.you).toBeNull();
    const d = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    expect(d!.liars!.cups[seat.Tobin]).toEqual([3, 4, 4, 1, 2]);
    // And through the live state, the one door a browser has.
    signedIn = tobinPlayer;
    const live = await getLiveState(campaignId);
    expect(live.tavern!.liars!.cups[seat.Kessa]).toBeNull();
    expect(live.tavern!.liars!.cups[seat.Tobin]).toEqual([3, 4, 4, 1, 2]);
  });

  it('goes round the seats in turn, and the DM plays the NPC', async () => {
    signedIn = tobinPlayer;
    await expect(
      games.tavernMove(gameId, { kind: 'bid', count: 2, face: 4 })
    ).rejects.toThrow('NOT_YOUR_TURN');
    signedIn = kessaPlayer;
    await games.tavernMove(gameId, { kind: 'bid', count: 3, face: 5 });
    await expect(
      games.tavernMove(gameId, { kind: 'bid', count: 4, face: 5 }, seat.Tobin)
    ).rejects.toThrow('FORBIDDEN');
    signedIn = dm;
    await expect(
      games.tavernMove(gameId, { kind: 'bid', count: 4, face: 5 }, seat.Kessa)
    ).rejects.toThrow('NOT_YOUR_SEAT');
    await games.tavernMove(
      gameId,
      { kind: 'bid', count: 5, face: 5, raiseCp: 200 },
      seat['Old Brannoc']
    );
  });

  it('refuses a hold the purse cannot cover, and changes nothing', async () => {
    signedIn = tobinPlayer;
    // Tobin has 2 gp left and owes 2 gp to hold; a raise on top is too much.
    await expect(
      games.tavernMove(gameId, { kind: 'bid', count: 6, face: 5, raiseCp: 100 })
    ).rejects.toThrow('CANNOT_COVER');
    expect(gold('tobin')).toBe(200);
  });

  it('lifts the cups on Liar!, pays the pot, and writes each cup to Dice', async () => {
    signedIn = tobinPlayer;
    await games.tavernMove(gameId, { kind: 'call' });
    // Four 5s counting wild ones, against Brannoc's five: Tobin wins 1+1+3+2.
    expect(gold('tobin')).toBe(0 + 700);
    const d = await view.tavernViewFor(campaignId, as(watcher, 'player'));
    expect(d!.liars!.cups[seat.Kessa]).toEqual([5, 1, 5, 2, 6]);
    expect(d!.result!.line).toContain('Tobin takes 7 gp');
    expect(d!.seats.find(s => s.name === 'Old Brannoc')!.dice).toBe(4);
    const db = rawDb();
    const rows = db
      .prepare(
        "SELECT actor_name, dice, visibility FROM campaign_rolls WHERE label = 'Dice at the Eel · round 1' ORDER BY rowid"
      )
      .all() as { actor_name: string; dice: string; visibility: string }[];
    db.close();
    expect(rows.map(r => [r.actor_name, JSON.parse(r.dice)])).toEqual([
      ['Kessa', [5, 1, 5, 2, 6]],
      ['Old Brannoc', [2, 3, 6, 4, 6]],
      ['Tobin', [3, 4, 4, 1, 2]],
    ]);
    expect(rows.every(r => r.visibility === 'table')).toBe(true);
  });

  it('keeps a cheat between the cheater and the DM', async () => {
    signedIn = dm;
    await games.startRound(gameId);
    const before = hub.currentSeq(campaignId);
    signedIn = kessaPlayer;
    const { roll } = await games.cheat(gameId, { dieIndex: 0, face: 6 });
    await expect(games.cheat(gameId, { dieIndex: 1, face: 6 })).rejects.toThrow(
      'ALREADY_USED'
    );

    const db = rawDb();
    const row = db
      .prepare(
        "SELECT visibility FROM campaign_rolls WHERE label LIKE 'Sleight of Hand%' ORDER BY rowid DESC LIMIT 1"
      )
      .get() as { visibility: string };
    db.close();
    expect(row.visibility).toBe('dm');

    const rollsFor = async (user: string) => {
      signedIn = user;
      return (await getLiveState(campaignId)).rolls.filter(r =>
        r.label.startsWith('Sleight of Hand')
      );
    };
    expect(await rollsFor(kessaPlayer)).toHaveLength(1);
    expect((await rollsFor(dm))[0].total).toBe(roll.total);
    expect(await rollsFor(tobinPlayer)).toHaveLength(0);

    const tobinSees = hub.replaySince(
      campaignId,
      before,
      as(tobinPlayer, 'player')
    )!;
    expect(tobinSees.join('')).not.toMatch(/Sleight|palm|Caught/);
    const dmSees = hub.replaySince(campaignId, before, as(dm, 'gm'))!;
    expect(dmSees.join('')).toMatch(/palm a die/);

    const k = await view.tavernViewFor(campaignId, as(kessaPlayer, 'player'));
    const t = await view.tavernViewFor(campaignId, as(tobinPlayer, 'player'));
    const d = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    expect(k!.log.filter(l => l.hidden)).toHaveLength(1);
    expect(k!.log.some(l => /passive/.test(l.line))).toBe(false);
    expect(t!.log.some(l => l.hidden)).toBe(false);
    expect(
      d!.log
        .filter(l => l.hidden)
        .map(l => l.line)
        .join(' ')
    ).toMatch(/passive (Perception|Insight)/);
  });

  it('reads in the open and tells the truth in private', async () => {
    signedIn = dm;
    await games
      .tavernMove(
        gameId,
        { kind: 'bid', count: 2, face: 3 },
        seat['Old Brannoc']
      )
      .catch(() => undefined);
    const v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    // Whoever is to act bids, so there is a bid to read against.
    if (!v!.liars!.bid) {
      const turn = v!.turn!;
      const player =
        turn === seat.Kessa
          ? kessaPlayer
          : turn === seat.Tobin
            ? tobinPlayer
            : dm;
      signedIn = player;
      await games.tavernMove(
        gameId,
        { kind: 'bid', count: 1, face: 3 },
        player === dm ? turn : null
      );
    }
    signedIn = tobinPlayer;
    const { line } = await games.readSeat(gameId, seat.Kessa);
    expect(line).toMatch(/^Insight \d+ against \d+: /);
    const w = await view.tavernViewFor(campaignId, as(watcher, 'player'));
    expect(w!.log.some(l => l.line === 'Tobin studies Kessa.')).toBe(true);
    expect(w!.log.some(l => l.line.startsWith('Insight'))).toBe(false);
  });

  it('hands every stake back when the DM ends it mid-round', async () => {
    const before = gold('kessa');
    const v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    const kessaIn = v!.seats.find(s => s.name === 'Kessa')!.inCp;
    signedIn = dm;
    await games.endTavernGame(gameId);
    expect(gold('kessa')).toBe(before + kessaIn);
    const records = await view.listTavernGames(campaignId);
    expect(records[0]).toMatchObject({
      name: 'Dice at the Eel',
      status: 'ended',
    });
    expect(records[0].secrets.length).toBeGreaterThan(0);
    signedIn = watcher;
    expect((await view.listTavernGames(campaignId))[0].secrets).toEqual([]);
  });
});

describe('Crowns at the table', () => {
  it('keeps hands private, and the deck on the server', async () => {
    signedIn = dm;
    const gameId = await games.openTavernGame(campaignId, {
      kind: 'crowns',
      npcIds: ['brannoc'],
      characterIds: ['kessa'],
    });
    signedIn = kessaPlayer;
    await games.answerSeat(gameId, true);
    signedIn = dm;
    await games.startRound(gameId);
    const k = await view.tavernViewFor(campaignId, as(kessaPlayer, 'player'));
    const seats = k!.seats;
    const kessa = seats.find(s => s.name === 'Kessa')!.id;
    const brannoc = seats.find(s => s.name === 'Old Brannoc')!.id;
    expect(k!.crowns!.hands[kessa]).toHaveLength(2);
    expect(k!.crowns!.hands[brannoc]).toBeNull();
    expect(JSON.stringify(k)).not.toMatch(/"deck"/);
    const d = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    expect(d!.crowns!.hands[brannoc]).toHaveLength(2);
    expect(JSON.stringify(d)).not.toMatch(/"deck"/);

    // A pass of betting, both stand, a second pass: the show.
    const play = async (
      seatId: string,
      move: Parameters<typeof games.tavernMove>[1]
    ) => {
      signedIn = seatId === kessa ? kessaPlayer : dm;
      await games.tavernMove(gameId, move, seatId === kessa ? null : seatId);
    };
    for (let i = 0; i < 8; i++) {
      const v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
      if (!v!.inRound) break;
      const turn = v!.turn!;
      await play(
        turn,
        v!.crowns!.phase === 'draw' ? { kind: 'stand' } : { kind: 'bet' }
      );
    }
    const done = await view.tavernViewFor(
      campaignId,
      as(kessaPlayer, 'player')
    );
    expect(done!.inRound).toBe(false);
    expect(done!.result!.line).toMatch(/The show|bust|unshown/);
    expect(done!.crowns!.hands[brannoc]).toHaveLength(2);
  });
});

describe('a dice game of the house’s own', () => {
  /** Every die the server throws lands on this face while `fn` runs. */
  async function landing<T>(face: number, sides: number, fn: () => Promise<T>) {
    const spy = vi
      .spyOn(Math, 'random')
      .mockReturnValue((face - 1) / sides + 0.0001);
    try {
      return await fn();
    } finally {
      spy.mockRestore();
    }
  }

  it('plays the house: the DM keeps the bank as an NPC, and a win pays the odds', async () => {
    signedIn = dm;
    const running = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    if (running && running.status !== 'ended') {
      await games.endTavernGame(running.id);
    }
    const gameId = await games.openTavernGame(campaignId, {
      kind: 'custom-dice',
      name: 'Beat the banker',
      rules: {
        count: 2,
        sides: 6,
        opponent: 'house',
        odds: 2,
        anteCp: 100,
        raiseCapCp: 500,
      },
      npcIds: [],
      characterIds: ['kessa'],
      houseNpcId: 'brannoc',
    });
    let v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    const house = v!.seats.find(s => s.house)!;
    expect(house).toMatchObject({
      name: 'Old Brannoc',
      npc: true,
      status: 'seated',
    });
    expect(v!.npcs.map(n => n.seatId)).toContain(house.id);

    signedIn = kessaPlayer;
    await games.answerSeat(gameId, true);
    const before = gold('kessa');
    signedIn = dm;
    await games.startRound(gameId);
    signedIn = kessaPlayer;
    await games.tavernMove(gameId, { kind: 'bet', raiseCp: 100 });
    expect(gold('kessa')).toBe(before - 200);

    const { roll } = await landing(6, 6, () =>
      games.tavernMove(gameId, { kind: 'roll' })
    );
    expect(roll!.dice).toEqual([6, 6]);
    signedIn = dm;
    await landing(1, 6, () =>
      games.tavernMove(gameId, { kind: 'roll' }, house.id)
    );

    // A 2 gp bet won at 2 to 1: the stake back and 4 gp more.
    expect(gold('kessa')).toBe(before - 200 + 600);
    v = await view.tavernViewFor(campaignId, as(kessaPlayer, 'player'));
    expect(v!.result!.line).toMatch(
      /Against Old Brannoc’s 2: Kessa \(12\) wins 4 gp/
    );
    expect(v!.seats.find(s => s.house)!.netCp).toBe(200 - 600);

    const db = rawDb();
    const rows = db
      .prepare(
        "SELECT actor_name, dice, visibility FROM campaign_rolls WHERE label = 'Beat the banker · round 1' ORDER BY rowid"
      )
      .all() as { actor_name: string; dice: string; visibility: string }[];
    db.close();
    expect(
      rows.map(r => [r.actor_name, JSON.parse(r.dice), r.visibility])
    ).toEqual([
      ['Kessa', [6, 6], 'table'],
      ['Old Brannoc', [1, 1], 'table'],
    ]);
    signedIn = dm;
    await games.endTavernGame(gameId);
  });

  it('keeps dice under the cups from everyone but the roller and the DM', async () => {
    signedIn = dm;
    const gameId = await games.openTavernGame(campaignId, {
      kind: 'custom-dice',
      name: 'Under the cups',
      rules: { count: 3, sides: 6, hidden: true, anteCp: 0, raiseCapCp: 0 },
      npcIds: ['brannoc'],
      characterIds: ['kessa'],
    });
    signedIn = kessaPlayer;
    await games.answerSeat(gameId, true);
    signedIn = dm;
    await games.startRound(gameId);
    let v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    const kessa = v!.seats.find(s => s.name === 'Kessa')!.id;
    const brannoc = v!.seats.find(s => s.name === 'Old Brannoc')!.id;
    // Nobody can raise, so each just stays in.
    for (let i = 0; i < 2; i++) {
      v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
      const turn = v!.turn!;
      signedIn = turn === kessa ? kessaPlayer : dm;
      await games.tavernMove(
        gameId,
        { kind: 'bet' },
        turn === kessa ? null : turn
      );
    }
    v = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    expect(v!.custom!.phase).toBe('roll');
    const first = v!.turn!;
    signedIn = first === kessa ? kessaPlayer : dm;
    await landing(4, 6, () =>
      games.tavernMove(gameId, { kind: 'roll' }, first === kessa ? null : first)
    );

    const k = await view.tavernViewFor(campaignId, as(kessaPlayer, 'player'));
    const w = await view.tavernViewFor(campaignId, as(watcher, 'player'));
    const d = await view.tavernViewFor(campaignId, as(dm, 'gm'));
    expect(d!.custom!.dice[first]).toEqual([4, 4, 4]);
    expect(w!.custom!.dice[first]).toBeNull();
    expect(w!.custom!.scores[first]).toBeUndefined();
    expect(k!.custom!.dice[first]).toEqual(first === kessa ? [4, 4, 4] : null);
    expect(w!.log.some(l => /under the cup/.test(l.line))).toBe(true);

    // In the open nothing is read; under cups a read needs both to have rolled.
    const second = first === kessa ? brannoc : kessa;
    signedIn = first === kessa ? kessaPlayer : dm;
    await expect(
      games.readSeat(gameId, second, first === kessa ? null : first)
    ).rejects.toThrow('NOT_ROLLED');
    signedIn = second === kessa ? kessaPlayer : dm;
    await landing(2, 6, () =>
      games.tavernMove(
        gameId,
        { kind: 'roll' },
        second === kessa ? null : second
      )
    );
    v = await view.tavernViewFor(campaignId, as(watcher, 'player'));
    expect(v!.custom!.dice[first]).toEqual([4, 4, 4]);
    expect(v!.result!.line).toMatch(/takes|rolls over/);
    signedIn = dm;
    await games.endTavernGame(gameId);
  });

  it('refuses an NPC that is not here as the bank, and a house game needs one player', async () => {
    signedIn = dm;
    await expect(
      games.openTavernGame(campaignId, {
        kind: 'custom-dice',
        rules: { opponent: 'house' },
        npcIds: [],
        characterIds: [],
        houseNpcId: 'brannoc',
      })
    ).rejects.toThrow('TOO_FEW_SEATS');
    await expect(
      games.openTavernGame(campaignId, {
        kind: 'custom-dice',
        rules: { opponent: 'house' },
        npcIds: [],
        characterIds: ['kessa'],
        houseNpcId: 'nobody-here',
      })
    ).rejects.toThrow('BAD_SEAT');
  });
});
