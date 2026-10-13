/**
 * The library's two personal lenses, Yours and Taken, keep a listing after it
 * leaves the library — that is what lets an author relist and a reader find
 * what they took (sharing-model rule 4). And only the author edits a card.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const library = await import('./library');
const { adopt } = await import('./adoptions');

let author = '';
let reader = '';
let listingId = '';

beforeAll(async () => {
  migrateTestDb();
  author = seedUser('Author');
  reader = seedUser('Reader');
  const db = rawDb();
  db.prepare(
    'INSERT INTO homebrew (id, owner_id, type, name) VALUES (?, ?, ?, ?)'
  ).run('hb-1', author, 'spell', 'Grave Bolt');
  db.close();

  signedIn = author;
  listingId = await library.publishHomebrew('hb-1', { title: 'Grave Bolt' });
  signedIn = reader;
  await adopt(listingId);
  signedIn = author;
  await library.setPublicationStatus(listingId, 'withdrawn');
});

describe('a withdrawn listing', () => {
  it('leaves the library', async () => {
    signedIn = reader;
    expect((await library.listShelf()).map(c => c.id)).not.toContain(listingId);
  });

  it('stays in the author’s Yours, so they can put it back', async () => {
    signedIn = author;
    const mine = await library.listMyPublications();
    expect(mine.map(c => [c.id, c.status])).toEqual([[listingId, 'withdrawn']]);
  });

  it('stays in the reader’s Taken, so they can still find it', async () => {
    signedIn = reader;
    const taken = await library.listTakenPublications();
    expect(taken.map(c => [c.id, c.status, c.adopted])).toEqual([
      [listingId, 'withdrawn', 'linked'],
    ]);
    signedIn = author;
    expect(await library.listTakenPublications()).toEqual([]);
  });
});

describe('editing a listing', () => {
  it('is the author’s alone', async () => {
    signedIn = reader;
    await expect(
      library.updatePublication(listingId, { title: 'Mine now' })
    ).rejects.toThrow('NOT_YOUR_PUBLICATION');

    signedIn = author;
    await library.updatePublication(listingId, {
      title: 'Grave Bolt, revised',
      visibility: 'unlisted',
    });
    const [card] = await library.listMyPublications();
    expect([card.title, card.visibility]).toEqual([
      'Grave Bolt, revised',
      'unlisted',
    ]);
  });
});
