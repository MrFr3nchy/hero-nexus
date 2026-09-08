-- 0022: what the party got for the night.
--
--   session_awards       — one handout of experience or one milestone level,
--                          usually filed under the sitting it was earned at.
--   session_award_grants — who actually received it, and how much each.
--
-- The grants exist because the award is not evenly divisible into "everyone
-- present": a player who missed the night sometimes still gets it, a guest
-- sometimes does not, and a year later "did Pip get the XP for session 9?" is
-- a question the record should answer. The award says what was given; the
-- grants say who took it.
--
-- `character_name` is denormalised beside `character_id` for the same reason
-- the content model allows it on `inventory[].name` (rule 1): a deleted
-- character still has to render as a word in the record of what it was given.
-- Nothing reads stats from it.
--
-- The sheets themselves are the source of truth for a character's experience
-- and level. These rows are the receipt, not the balance: the actual change
-- goes through the character write path and lands in `character_history`, so
-- the player's own log shows it in the DM's wording (rule 7).
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "session_awards" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  -- Null for an award between sittings: downtime, or a session nobody logged.
  "session_id"  TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "kind"        TEXT NOT NULL DEFAULT 'xp'
                CHECK ("kind" IN ('xp', 'milestone')),
  -- Experience each recipient received. Zero for a milestone.
  "xp"          INTEGER NOT NULL DEFAULT 0,
  -- Levels each recipient gained. Zero for an experience award.
  "levels"      INTEGER NOT NULL DEFAULT 0,
  -- What it was for. Party-visible: nobody is levelled up in secret.
  "note"        TEXT NOT NULL DEFAULT '',
  "awarded_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "session_awards_campaign_idx"
  ON "session_awards" ("campaign_id", "created_at");

CREATE TABLE "session_award_grants" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "award_id"       TEXT NOT NULL REFERENCES "session_awards"("id") ON DELETE CASCADE,
  "character_id"   TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  -- For the deleted-character case only. Never a source of stats.
  "character_name" TEXT NOT NULL DEFAULT '',
  "xp"             INTEGER NOT NULL DEFAULT 0,
  "levels"         INTEGER NOT NULL DEFAULT 0,
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "session_award_grants_award_idx"
  ON "session_award_grants" ("award_id");
CREATE INDEX "session_award_grants_character_idx"
  ON "session_award_grants" ("character_id");
