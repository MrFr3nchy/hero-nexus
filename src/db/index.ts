/**
 * SQLite connection + Drizzle instance (server-only).
 *
 * The database file ships with the project under `data/hero-nexus.db`. It is
 * created by the migration runner (`src/db/migrate.ts`), which also runs
 * automatically on server boot via `src/instrumentation.ts`.
 */
import 'server-only';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import * as schema from './schema';

export const DB_PATH =
  process.env.HERO_NEXUS_DB_PATH ??
  join(process.cwd(), 'data', 'hero-nexus.db');

function createConnection() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // Wait up to 5s for a competing writer instead of throwing SQLITE_BUSY
  // immediately. A DM plus several players active in one campaign is the normal
  // case here, and better-sqlite3 is synchronous, so contention is real.
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

// Reuse the connection across HMR reloads in dev.
const globalForDb = globalThis as unknown as {
  __heroNexusSqlite?: Database.Database;
};

export const sqlite = globalForDb.__heroNexusSqlite ?? createConnection();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__heroNexusSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
