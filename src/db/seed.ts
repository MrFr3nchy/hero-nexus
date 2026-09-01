/**
 * Seed static data (rpg_systems) and sync reference data from Open5e.
 * Idempotent (upsert). Run via `npm run db:seed`.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

import { syncReference } from './sync-reference';

const DB_PATH =
  process.env.HERO_NEXUS_DB_PATH ??
  join(process.cwd(), 'data', 'hero-nexus.db');

const RPG_SYSTEMS = [
  {
    id: 'dnd5e2024',
    name: 'Dungeons & Dragons',
    version: '5th Edition (2024)',
    description: "The latest version of the world's most popular tabletop RPG.",
  },
];

function seedRpgSystems() {
  const db = new Database(DB_PATH);
  try {
    const upsert = db.prepare(
      `INSERT INTO "rpg_systems" ("id", "name", "version", "description")
       VALUES (@id, @name, @version, @description)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = excluded."name",
         "version" = excluded."version",
         "description" = excluded."description"`
    );
    const runAll = db.transaction(() => {
      for (const sys of RPG_SYSTEMS) upsert.run(sys);
    });
    runAll();
  } finally {
    db.close();
  }
}

async function main() {
  seedRpgSystems();
  console.log('[seed] rpg_systems seeded');
  await syncReference();
}

main().catch(err => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
