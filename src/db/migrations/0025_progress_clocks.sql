-- 0025: the things happening whether or not the party turns up.
--
--   campaign_clocks — a countdown with segments. The ritual is five-eighths
--                     done; the town guard is three-quarters convinced.
--
-- A DM tracks these on paper beside the app today, which is why they stop
-- getting ticked by session four. The point of one is that it moves without
-- the party: a clock nobody advances is a note.
--
-- Two audiences, as everywhere else in this schema, but shaped differently
-- from `canon_entries`. A clock has one body and a *hidden* half — the party
-- can be shown that something is at 5/8 without being told what happens at
-- 8/8, and that is exactly the pressure a clock is for. So `title` and the
-- segments are what a shared clock reveals, and `dm_note` never leaves staff.
--
--   segments   — 4, 6, 8 or 12. Not free: a clock's whole readability is that
--                you can see the fraction at a glance.
--   filled     — how far along, always <= segments.
--   visibility — 'dm' is a plan; 'shared' is a threat the party can see.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_clocks" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL DEFAULT '',
  -- What it means when it fills. Staff only — the whole point of showing a
  -- clock without showing this.
  "dm_note"     TEXT NOT NULL DEFAULT '',
  "segments"    INTEGER NOT NULL DEFAULT 6
                CHECK ("segments" IN (4, 6, 8, 12)),
  "filled"      INTEGER NOT NULL DEFAULT 0,
  "visibility"  TEXT NOT NULL DEFAULT 'dm'
                CHECK ("visibility" IN ('dm', 'shared')),
  -- 'running' still moves; 'done' has gone off and is kept as a record.
  "status"      TEXT NOT NULL DEFAULT 'running'
                CHECK ("status" IN ('running', 'done')),
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_clocks_campaign_idx"
  ON "campaign_clocks" ("campaign_id");
