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

`0016_campaign_content.sql` is the most recent example — it adds
`campaign_homebrew`, the table that says what homebrew is in play at a campaign
(see [docs/content-model.md](../../docs/content-model.md), rule 6), and its
Drizzle definition landed in `schema.ts` in the same commit. Nothing generated
it; nothing checks that the two agree except the person writing them.

## Real-time

Live views stream. `GET /api/campaigns/[id]/live` is a Server-Sent Events route
backed by `src/server/live-hub.ts`, a process-local broadcast hub pinned to
`globalThis` — the same pattern and the same licence as `rate-limit.ts` and the
SQLite connection above.

**What travels is deliberately not the state.** A `state` frame carries a
version number and nothing else; the browser answers by re-reading
`getLiveState(campaignId)`, which is role-filtered. That keeps exactly one place
in the codebase deciding what a player may see. Event frames (announcements) do
carry content, so each one carries an audience applied in the hub — see
`src/@shared/table/events.ts`.

**Every server function that writes something a live view reads must call
`bumpVersion(campaignId)` after the write commits.** In the server module, not
in the action wrapper — a bump in the wrapper is one every future writer
forgets. Bumps inside 40ms coalesce into one nudge, so a loop that writes six
rows may bump six times without thinking about it.

`useCampaignLive` still re-reads on a timer as a **floor** — 30s while the
stream is up, 3s when it is down. That is not a leftover: it is what stops one
forgotten `bumpVersion` from freezing a table mid-fight. Do not remove it.

The full model is `docs/handoff/the-same-room/README.md`.
