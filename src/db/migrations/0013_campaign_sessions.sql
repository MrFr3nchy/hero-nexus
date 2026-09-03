-- 0013: the session chronicle — the campaign's spine.
--   campaign_sessions            — one sitting at the table. Numbered, dated,
--                                  with the DM's private prep on one side and
--                                  the recap the party is given on the other.
--                                  Two bodies rather than one with hidden
--                                  regions, for the same reason as canon_entries.
--   campaign_session_attendance  — who was actually there. A DM hands out XP,
--                                  downtime and loot off this, and "was Pip at
--                                  session 9?" is a question a record should
--                                  answer a year later.
--
-- The three existing session-scoped tables gain a nullable session_id so an
-- encounter, a handout and a downtime window can be filed under the sitting
-- they belong to. Nullable because everything created before this migration
-- belongs to no session, and that is a true statement, not missing data.
--
-- Added without REFERENCES for the same reason as 0011 and 0012: SQLite cannot
-- add a foreign key with ALTER, and rebuilding those tables would drop rows
-- that other tables point at. A dangling session id reads as unfiled.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_sessions" (
  "id"               TEXT PRIMARY KEY NOT NULL,
  "campaign_id"      TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "number"           INTEGER NOT NULL DEFAULT 1,
  "title"            TEXT NOT NULL DEFAULT '',
  "scheduled_for"    TEXT,
  "played_on"        TEXT,
  "status"           TEXT NOT NULL DEFAULT 'planned',  -- planned | played | cancelled
  "prep_body"        TEXT NOT NULL DEFAULT '',
  "recap_body"       TEXT NOT NULL DEFAULT '',
  "recap_visibility" TEXT NOT NULL DEFAULT 'dm',       -- dm | shared
  "created_by"       TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_sessions_campaign_idx"
  ON "campaign_sessions" ("campaign_id");
CREATE UNIQUE INDEX "campaign_sessions_campaign_number_idx"
  ON "campaign_sessions" ("campaign_id", "number");

CREATE TABLE "campaign_session_attendance" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "session_id"   TEXT NOT NULL REFERENCES "campaign_sessions"("id") ON DELETE CASCADE,
  "user_id"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "status"       TEXT NOT NULL DEFAULT 'present',      -- present | absent | late
  "created_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "campaign_session_attendance_session_user_idx"
  ON "campaign_session_attendance" ("session_id", "user_id");

ALTER TABLE "initiative_encounters" ADD COLUMN "session_id" TEXT;
ALTER TABLE "campaign_handouts"     ADD COLUMN "session_id" TEXT;
ALTER TABLE "downtime_periods"      ADD COLUMN "session_id" TEXT;
