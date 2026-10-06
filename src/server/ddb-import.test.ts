import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { parseDdbCharacter } from '@/@creator/character/lib/ddb-import';
import { migrateTestDb, rawDb, seedUser } from '../../test/db';

let signedIn: string | null = null;
vi.mock('@/auth', () => ({
  auth: async () => (signedIn ? { user: { id: signedIn } } : null),
}));

const ddb = await import('./ddb-import');

const facts = parseDdbCharacter(
  JSON.parse(readFileSync('test/fixtures/ddb/hand-made-wizard.json', 'utf8'))
)!;

beforeAll(() => {
  migrateTestDb();
  signedIn = seedUser('Importer');
  const db = rawDb();
  const rows = JSON.parse(
    readFileSync('test/fixtures/srd-dagger-and-missile.json', 'utf8')
  ) as { category: string; slug: string; name: string; data: string }[];
  for (const r of rows) {
    db.prepare(
      'INSERT OR IGNORE INTO reference_data (category, slug, name, data) VALUES (?, ?, ?, ?)'
    ).run(r.category, r.slug, r.name, r.data);
  }
  db.close();
});

describe('D&D Beyond import', () => {
  it('previews what matched before anything is created', async () => {
    const preview = await ddb.previewDdbImport(facts);
    expect(preview.items.map(i => i.match?.key ?? null)).toEqual([
      'srd-2024_dagger',
      null,
      null,
    ]);
    expect(preview.spells[0].match?.key).toBe('srd-2024_magic-missile');
    const db = rawDb();
    expect(db.prepare('SELECT count(*) AS n FROM characters').get()).toEqual({
      n: 0,
    });
    db.close();
  });

  it('creates a draft, never homebrew', async () => {
    const id = await ddb.importDdbCharacter(facts);
    const db = rawDb();
    const row = db
      .prepare('SELECT status, name, sheet FROM characters WHERE id = ?')
      .get(id) as { status: string; name: string; sheet: string };
    const homebrew = db.prepare('SELECT count(*) AS n FROM homebrew').get();
    db.close();
    expect(row.status).toBe('draft');
    expect(row.name).toBe('Ilsa Thorn');
    expect(homebrew).toEqual({ n: 0 });
    const sheet = JSON.parse(row.sheet);
    expect(sheet.inventory[0].ref.key).toBe('srd-2024_dagger');
    expect(sheet.abilities.intelligence.score).toBe(17);
  });

  it('needs somebody signed in', async () => {
    signedIn = null;
    await expect(ddb.previewDdbImport(facts)).rejects.toThrow(
      'NOT_AUTHENTICATED'
    );
  });
});
