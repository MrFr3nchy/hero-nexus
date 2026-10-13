/**
 * `resolveReadableContentRefs` is what the character form calls with refs the
 * browser sent, so it must not hand back homebrew the caller cannot read.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ContentRef } from '@/@shared/content';
import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const { resolveReadableContentRefs } = await import('./content');

const ref = (key: string): ContentRef => ({
  source: 'homebrew',
  type: 'spell',
  key,
});
const names = async (keys: string[]) =>
  [...(await resolveReadableContentRefs(keys.map(ref))).values()]
    .map(e => e.name)
    .sort();

let author = '';
let dm = '';
let player = '';
let adopter = '';
let stranger = '';

beforeAll(() => {
  migrateTestDb();
  author = seedUser('Author');
  dm = seedUser('Dm');
  player = seedUser('Player');
  adopter = seedUser('Adopter');
  stranger = seedUser('Stranger');

  const db = rawDb();
  const brew = db.prepare(
    'INSERT INTO homebrew (id, owner_id, type, name, visibility) VALUES (?, ?, ?, ?, ?)'
  );
  brew.run('hb-private', author, 'spell', 'Private Bolt', 'private');
  brew.run('hb-public', author, 'spell', 'Public Bolt', 'public');
  brew.run('hb-table', dm, 'spell', 'Table Bolt', 'private');
  brew.run('hb-adopted', author, 'spell', 'Adopted Bolt', 'private');
  brew.run('hb-sheet', author, 'spell', 'Sheet Bolt', 'private');

  db.prepare('INSERT INTO campaigns (id, gm_id, name) VALUES (?, ?, ?)').run(
    'camp-1',
    dm,
    'Saltmere'
  );
  db.prepare(
    'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run('m-1', 'camp-1', player, 'player');
  db.prepare(
    'INSERT INTO campaign_homebrew (id, campaign_id, homebrew_id) VALUES (?, ?, ?)'
  ).run('ch-1', 'camp-1', 'hb-table');

  db.prepare(
    'INSERT INTO publications (id, owner_id, kind, title, homebrew_id) VALUES (?, ?, ?, ?, ?)'
  ).run('pub-1', author, 'homebrew', 'Adopted Bolt', 'hb-adopted');
  db.prepare(
    'INSERT INTO adoptions (id, user_id, publication_id, mode, homebrew_id) VALUES (?, ?, ?, ?, ?)'
  ).run('ad-1', adopter, 'pub-1', 'linked', 'hb-adopted');

  db.prepare(
    'INSERT INTO characters (id, owner_id, name, sheet) VALUES (?, ?, ?, ?)'
  ).run('char-1', player, 'Kessa', '{}');
  db.prepare(
    'INSERT INTO character_homebrew (id, character_id, homebrew_id, entry_id) VALUES (?, ?, ?, ?)'
  ).run('chb-1', 'char-1', 'hb-sheet', 'entry-1');
  db.close();
});

const ALL = ['hb-private', 'hb-public', 'hb-table', 'hb-adopted', 'hb-sheet'];

describe('resolveReadableContentRefs', () => {
  it('refuses a signed-out caller', async () => {
    signedIn = null;
    await expect(
      resolveReadableContentRefs([ref('hb-public')])
    ).rejects.toThrow('NOT_AUTHENTICATED');
  });

  it('gives a stranger only what is public', async () => {
    signedIn = stranger;
    expect(await names(ALL)).toEqual(['Public Bolt']);
  });

  it('gives the author everything they wrote', async () => {
    signedIn = author;
    expect(await names(ALL)).toEqual([
      'Adopted Bolt',
      'Private Bolt',
      'Public Bolt',
      'Sheet Bolt',
    ]);
  });

  it('gives a table member what is in play there and what their sheet uses', async () => {
    signedIn = player;
    expect(await names(ALL)).toEqual([
      'Public Bolt',
      'Sheet Bolt',
      'Table Bolt',
    ]);
  });

  it('gives a linked adopter the live row', async () => {
    signedIn = adopter;
    expect(await names(ALL)).toEqual(['Adopted Bolt', 'Public Bolt']);
  });
});
