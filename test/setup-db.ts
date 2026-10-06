/**
 * Runs before every test file.
 *
 * `src/db/index.ts` reads `HERO_NEXUS_DB_PATH` the moment it is imported, so
 * the path has to be set here — before the test file's own imports — or the
 * first test to touch `@/db` opens the real `data/hero-nexus.db`. Each file
 * gets its own empty path; a file that wants tables calls `migrateTestDb()`
 * from `test/db.ts` in `beforeAll`. Pure tests never open it.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hero-nexus-test-'));
process.env.HERO_NEXUS_DB_PATH = join(dir, 'test.db');

// The connection is cached on globalThis for dev HMR; never inherit one.
delete (globalThis as { __heroNexusSqlite?: unknown }).__heroNexusSqlite;
