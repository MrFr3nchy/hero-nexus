-- 0014: what a fight actually needs, and a shared roll log.
--
-- initiative_entries gains the four things a DM was tracking on paper beside
-- the app:
--   armor_class    — the number every attack roll is compared against. A DM
--                    reading HP off the screen and AC off a notebook is the
--                    app doing half a job.
--   hp_temp        — temporary hit points are spent before real ones and do
--                    not heal back, so they cannot be folded into hp_current.
--   condition_keys — a comma-separated list of 2024 condition keys. The old
--                    free-text `conditions` column stays as the note beside
--                    them ("prone behind the cart"), because a fixed list
--                    cannot say everything a table means.
--   concentrating  — its own flag rather than a condition, because it is not
--                    one: it survives most conditions and ends on its own
--                    rules, and the DM needs to see it when damage lands.
--   side           — party / foe / other, so the tracker can group a fight and
--                    hide foe HP from players without guessing from
--                    character_id (a DM's allied NPC has none).
--
-- campaign_rolls is the table's shared roll log. Rolls are recorded server-
-- side, including the individual dice, so the log is a record of what was
-- rolled rather than a claim about it. `visibility` lets the DM roll in the
-- open or behind the screen.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "initiative_entries" ADD COLUMN "armor_class"    INTEGER;
ALTER TABLE "initiative_entries" ADD COLUMN "hp_temp"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "initiative_entries" ADD COLUMN "condition_keys" TEXT NOT NULL DEFAULT '';
ALTER TABLE "initiative_entries" ADD COLUMN "concentrating"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "initiative_entries" ADD COLUMN "side"           TEXT NOT NULL DEFAULT 'foe';

-- Everything already in the tracker that is a player character is on the
-- party's side; the default above covers the rest.
UPDATE "initiative_entries" SET "side" = 'party' WHERE "character_id" IS NOT NULL;

CREATE TABLE "campaign_rolls" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "campaign_id"   TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "actor_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "character_id"  TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "actor_name"    TEXT NOT NULL DEFAULT '',
  "label"         TEXT NOT NULL DEFAULT '',
  "notation"      TEXT NOT NULL DEFAULT '',
  "dice"          TEXT NOT NULL DEFAULT '[]',   -- JSON: every die face rolled
  "dropped"       TEXT NOT NULL DEFAULT '[]',   -- JSON: indexes not counted
  "modifier"      INTEGER NOT NULL DEFAULT 0,
  "total"         INTEGER NOT NULL DEFAULT 0,
  "visibility"    TEXT NOT NULL DEFAULT 'table', -- table | dm
  "created_at"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_rolls_campaign_idx"
  ON "campaign_rolls" ("campaign_id", "created_at");
