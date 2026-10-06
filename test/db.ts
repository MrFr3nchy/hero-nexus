/**
 * The server-module test pattern: a real SQLite file, migrated, per test file.
 *
 * `test/setup-db.ts` has already pointed `HERO_NEXUS_DB_PATH` at an empty
 * temp file; this applies every migration to it. Call it in `beforeAll`,
 * then import server modules as usual and mock `@/auth` with `vi.mock`.
 */
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import { runMigrations } from '@/db/migrate';

export function migrateTestDb(): void {
  const path = process.env.HERO_NEXUS_DB_PATH;
  if (!path) throw new Error('test/setup-db.ts did not run');
  // Sixty-odd "[migrate] applied" lines per file is noise in a test run.
  const log = console.log;
  console.log = () => {};
  try {
    runMigrations(path);
  } finally {
    console.log = log;
  }
}

/** A raw handle for seeding rows the code under test only reads. */
export function rawDb(): Database.Database {
  return new Database(process.env.HERO_NEXUS_DB_PATH!);
}

/** Insert a user with no password, and return its id. */
export function seedUser(name: string): string {
  const id = randomUUID();
  const db = rawDb();
  db.prepare('INSERT INTO "user" (id, name, email) VALUES (?, ?, ?)').run(
    id,
    name,
    `${name.toLowerCase().replace(/\W+/g, '-')}-${id.slice(0, 6)}@test.local`
  );
  db.close();
  return id;
}
