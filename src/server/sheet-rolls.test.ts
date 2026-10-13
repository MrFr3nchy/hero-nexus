/**
 * Rolling off your own sheet, against a migrated temp database: the bonus is
 * the server's, never the browser's, and a hero is rolled only by its owner
 * or the DM.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { makeEmptySheet } from '@/@creator/character/schema';
import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const { rollFromSheet } = await import('./sheet-rolls');

let dm = '';
let player = '';
let other = '';
const campaignId = 'camp-rolls';
const kestrel = 'char-kestrel';
const odo = 'char-odo';
const elsewhere = 'char-elsewhere';

function seedHero(
  id: string,
  ownerId: string,
  at: string | null,
  exhaustion = 0
): void {
  const sheet = makeEmptySheet();
  sheet.identity.level = 5;
  sheet.abilities.dexterity = { score: 18, proficientSave: true };
  sheet.skills.stealth = true;
  sheet.combat.exhaustion = exhaustion;
  const db = rawDb();
  db.prepare(
    'INSERT INTO characters (id, owner_id, name, campaign_id, sheet) VALUES (?, ?, ?, ?, ?)'
  ).run(id, ownerId, id, at, JSON.stringify(sheet));
  db.close();
}

function lastRoll() {
  const db = rawDb();
  const row = db
    .prepare(
      'SELECT label, notation, modifier, total, dice, dropped, character_id FROM campaign_rolls ORDER BY rowid DESC LIMIT 1'
    )
    .get() as {
    label: string;
    notation: string;
    modifier: number;
    total: number;
    dice: string;
    dropped: string;
    character_id: string;
  };
  db.close();
  return row;
}

beforeAll(() => {
  migrateTestDb();
  dm = seedUser('Dm');
  player = seedUser('Player');
  other = seedUser('Other');
  const db = rawDb();
  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    campaignId,
    dm,
    'The Salt Road'
  );
  for (const [i, u] of [player, other].entries()) {
    db.prepare(
      'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).run(`m-${i}`, campaignId, u, 'player');
  }
  db.close();
  seedHero(kestrel, player, campaignId);
  seedHero(odo, other, campaignId, 2);
  seedHero(elsewhere, player, null);
});

describe('rollFromSheet', () => {
  it('adds what the sheet says, and logs it under the skill', async () => {
    signedIn = player;
    const roll = await rollFromSheet(campaignId, kestrel, {
      kind: 'skill',
      key: 'stealth',
    });
    expect(roll.notation).toBe('1d20+7');
    expect(roll.total).toBe(roll.dice[0] + 7);
    const row = lastRoll();
    expect(row).toMatchObject({
      label: 'Stealth',
      notation: '1d20+7',
      modifier: 7,
      character_id: kestrel,
    });
  });

  it('rolls two and keeps one with advantage', async () => {
    signedIn = player;
    const roll = await rollFromSheet(
      campaignId,
      kestrel,
      { kind: 'save', key: 'dexterity' },
      'advantage'
    );
    expect(roll.notation).toBe('2d20kh1+7');
    expect(roll.dice).toHaveLength(2);
    expect(roll.dropped).toHaveLength(1);
    expect(lastRoll().label).toBe('Dexterity save');
  });

  it('takes exhaustion off, as every d20 test does', async () => {
    signedIn = other;
    const roll = await rollFromSheet(campaignId, odo, {
      kind: 'skill',
      key: 'stealth',
    });
    // 7 off the sheet, −4 for two levels of exhaustion.
    expect(roll.notation).toBe('1d20+3');
  });

  it('lets the DM roll a hero at their table', async () => {
    signedIn = dm;
    const roll = await rollFromSheet(campaignId, kestrel, {
      kind: 'initiative',
    });
    expect(roll.notation).toBe('1d20+4');
  });

  it('refuses somebody else’s hero, and one at no table', async () => {
    signedIn = other;
    await expect(
      rollFromSheet(campaignId, kestrel, { kind: 'skill', key: 'stealth' })
    ).rejects.toThrow('NOT_YOUR_CHARACTER');
    signedIn = player;
    await expect(
      rollFromSheet(campaignId, elsewhere, { kind: 'skill', key: 'stealth' })
    ).rejects.toThrow('NOT_AT_TABLE');
  });

  it('refuses a roll it does not know, whatever the browser sent', async () => {
    signedIn = player;
    await expect(
      rollFromSheet(campaignId, kestrel, {
        kind: 'skill',
        key: 'luck',
      } as never)
    ).rejects.toThrow('BAD_ROLL');
    await expect(
      rollFromSheet(
        campaignId,
        kestrel,
        { kind: 'skill', key: 'stealth' },
        'twice' as never
      )
    ).rejects.toThrow('BAD_ROLL');
  });
});
