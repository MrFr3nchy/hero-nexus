-- 0019: a fight, built before anyone is at the table.
--
--   encounter_plans       — a named fight the DM is planning. Lives beside the
--                           session it is prep for, or standing on its own.
--   encounter_plan_lines  — "3 goblin warriors", one row per kind of monster.
--
-- Deliberately not `initiative_encounters` with a draft flag. A plan and a
-- fight are different things with different lifetimes: a plan is reusable —
-- the same ambush runs at two tables, or twice at one — while an encounter is
-- a single evening with hit points on it. Folding them together would mean a
-- fight that ended still being a plan, and re-running one meaning resetting
-- every hit point rather than dealing a fresh copy.
--
-- A line stores `content_source` + `content_key` — the two halves of a
-- ContentRef, with `type` implied as 'creature' since nothing else can be in a
-- fight. `name` beside them is the same denormalisation the content model
-- allows on `inventory[].name` (rule 1): stats are never copied and are always
-- resolved at read time, but a homebrew monster its author deleted still needs
-- to render as a word rather than a blank row.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "encounter_plans" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL DEFAULT '',
  -- The DM's line about how it starts. Never party-visible: a plan is prep.
  "notes"       TEXT NOT NULL DEFAULT '',
  "session_id"  TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "encounter_plans_campaign_idx"
  ON "encounter_plans" ("campaign_id");

CREATE TABLE "encounter_plan_lines" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "plan_id"        TEXT NOT NULL REFERENCES "encounter_plans"("id") ON DELETE CASCADE,
  "content_source" TEXT NOT NULL DEFAULT 'srd'
                   CHECK ("content_source" IN ('srd', 'homebrew')),
  "content_key"    TEXT NOT NULL,
  -- Denormalised for the deleted-homebrew case only. Never a source of stats.
  "name"           TEXT NOT NULL DEFAULT '',
  "count"          INTEGER NOT NULL DEFAULT 1,
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "encounter_plan_lines_plan_idx"
  ON "encounter_plan_lines" ("plan_id");
