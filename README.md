# Hero Nexus

A self-hosted campaign tool for D&D players and DMs — create characters, design
homebrew, and (Phase 2) run shared campaigns with an initiative tracker, handout
push, and a DM homebrew-approval workflow.

Built with **Next.js 15** (App Router, React 19), **HeroUI** + Tailwind v4,
**Auth.js** (credentials), and a **SQLite** database that ships with the project.

## Requirements

- Node.js 20+
- No external services — the database is a local file (`data/hero-nexus.db`).

## Setup

```bash
npm install
cp .env.example .env.local          # then set AUTH_SECRET (see the file)
npm run db:migrate                  # create the SQLite database
npm run db:seed                     # load D&D reference data from the Open5e API
npm run dev                         # http://localhost:3000
```

Migrations also run automatically on server boot (`src/instrumentation.ts`), so
after a `git pull` you usually only need `npm run dev`.

## Data & database

- **Schema + queries:** Drizzle ORM (`src/db/schema.ts`).
- **Migrations:** hand-written SQL in `src/db/migrations/`, applied by a custom
  runner (`src/db/migrate.ts`) that tracks applied files in a `_migrations`
  table — not drizzle-kit. See `src/db/README.md`.
- **Reference data** (classes, species, spells, …) is synced from the
  [Open5e v2 API](https://api.open5e.com/v2/) into the DB by `npm run db:seed` /
  `npm run db:sync`. See `data/reference/README.md`.

`data/hero-nexus.db` and `data/uploads/` are gitignored; everything else under
`data/` is committed.

### Scripts

| Script                            | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `npm run dev` / `build` / `start` | Next.js                                         |
| `npm run db:migrate`              | apply pending SQL migrations                    |
| `npm run db:seed`                 | seed `rpg_systems` + sync Open5e reference data |
| `npm run db:sync`                 | re-sync Open5e reference data only              |
| `npm run db:reset`                | delete the DB file, migrate, seed               |
| `npm run db:studio`               | drizzle-kit studio (inspection only)            |
| `npm run check`                   | eslint + prettier                               |

## Auth

Email/password via Auth.js credentials provider, JWT sessions, argon2 hashes.
Registration: `POST /api/register`. Password reset is not self-service on a
self-hosted instance — change your password from **Account → Settings** while
signed in.

## Status

**Phase 1 (done):** SQLite foundation, Auth.js, rebuilt character creator,
character CRUD, homebrew CRUD, campaign create/list.

**Phase 2:** homebrew submission → DM approve/deny with message; DM view of
player sheets; initiative tracker; image/note push to players; public homebrew
marketplace; real-time updates.
