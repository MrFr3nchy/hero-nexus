# Database

Hero Nexus ships with a SQLite database. It lives at `data/hero-nexus.db` (gitignored)
and is created/updated by the migration runner.

## Layout

| File               | Purpose                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `index.ts`         | `better-sqlite3` connection + Drizzle instance (`server-only`). Import `db` from here in server code. |
| `schema.ts`        | Drizzle table definitions — the **query-time** source of truth.                                       |
| `migrations/*.sql` | Hand-written SQL, applied once each, in lexical order.                                                |
| `migrate.ts`       | Custom migration runner. Not drizzle-kit.                                                             |
| `seed.ts`          | Loads `data/srd/*.json` into `reference_data`; seeds `rpg_systems`.                                   |

## Migration system

We do **not** use drizzle-kit's migrate/journal. Migrations are plain SQL files:

- Name them `NNNN_short_description.sql` (`0002_...`, `0003_...`).
- Each file is applied exactly once, tracked in the `_migrations` table.
- Each file runs in a single transaction; a failure rolls back and stops the runner.
- There are no down migrations (single-instance self-host — intentional).

The runner executes automatically on server boot (`src/instrumentation.ts`) and via:

```bash
npm run db:migrate   # apply pending migrations
npm run db:seed      # (re)load SRD reference data
npm run db:reset     # delete the db file, migrate, seed
npm run db:studio    # drizzle-kit studio — inspection only
```

## The rule

**`schema.ts` and `migrations/*.sql` are edited together in the same change.**
Drizzle does not generate or verify the SQL for us. When you add a column:

1. Write an `ALTER TABLE` in a new `migrations/NNNN_*.sql`.
2. Add the matching column to `schema.ts`.

## Not yet implemented (Phase 2)

Real-time updates (initiative tracker, image/note push) have no SQLite equivalent of
Firestore's `onSnapshot`. Plan: an SSE endpoint per campaign, or short polling.
