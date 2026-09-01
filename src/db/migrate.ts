/**
 * Custom migration runner.
 *
 * Not drizzle-kit. Migrations are hand-written SQL files in
 * `src/db/migrations/NNNN_name.sql`, applied in lexical order exactly once each.
 * Applied migrations are tracked in the `_migrations` table.
 *
 * Runs on server boot (`src/instrumentation.ts`) and via `npm run db:migrate`.
 * Deliberately standalone — no `server-only` import — so it works under `tsx`.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'db', 'migrations');

export interface MigrateResult {
  applied: string[];
  alreadyApplied: number;
}

export function runMigrations(
  dbPath: string = process.env.HERO_NEXUS_DB_PATH ??
    join(process.cwd(), 'data', 'hero-nexus.db')
): MigrateResult {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(
      `CREATE TABLE IF NOT EXISTS "_migrations" (
         "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
         "name"       TEXT NOT NULL UNIQUE,
         "applied_at" TEXT NOT NULL
       );`
    );

    const done = new Set<string>(
      db
        .prepare('SELECT name FROM "_migrations"')
        .all()
        .map(r => (r as { name: string }).name)
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const applied: string[] = [];
    const insert = db.prepare(
      'INSERT INTO "_migrations" ("name", "applied_at") VALUES (?, ?)'
    );

    for (const file of files) {
      if (done.has(file)) continue;
      const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const tx = db.transaction(() => {
        db.exec(sqlText);
        insert.run(file, new Date().toISOString());
      });
      tx();
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    }

    if (applied.length === 0) {
      console.log(
        `[migrate] up to date (${done.size} migration(s) already applied)`
      );
    }
    return { applied, alreadyApplied: done.size };
  } finally {
    db.close();
  }
}

// `npm run db:migrate` / `tsx src/db/migrate.ts`
if (
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') ||
    process.argv[1].endsWith('migrate.js'))
) {
  try {
    runMigrations();
  } catch (err) {
    console.error('[migrate] failed:', err);
    process.exit(1);
  }
}
