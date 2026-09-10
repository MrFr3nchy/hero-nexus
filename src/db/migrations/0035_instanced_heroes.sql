-- 0035: a hero at a table is a copy of the hero on the shelf.
--
-- Before this, `campaign_members.character_id` pointed straight at the
-- player's own character row, and nothing stopped the same row being pointed
-- at from two campaigns — the only unique index there is
-- `(campaign_id, user_id)`, which constrains one player at one table and says
-- nothing about a second. One row means one sheet, so levelling at one table
-- levelled the hero at the other, loot picked up at one was in their pack at
-- the other, and every "which table is this hero at" lookup took the first row
-- it found and never mentioned the rest.
--
-- The fix is not a constraint forbidding it: players really do run one concept
-- at two tables, and a constraint would only make the app disagree with them.
-- Instead a seat gets its own sheet. Taking a hero to a campaign copies them;
-- the copy plays, levels, collects loot and can die, and the original stays a
-- blueprint that does none of those things.
--
-- This is the line `docs/sharing-model.md` already draws — rule 1 puts a sheet
-- on the snapshot side of live-vs-snapshot, and `homebrew.forked_from` already
-- carries exactly these semantics.
--
-- An instance is a `characters` row, not a new entity, which is what keeps
-- this to two columns: every surface that reads a character keeps working,
-- because an instance is one.
--
-- `campaign_id` is `ON DELETE SET NULL`, not cascade: a table folding must not
-- delete the hero somebody played there for a year.
--
-- `forked_from` carries no foreign key, matching `homebrew.forked_from` — the
-- blueprint may be deleted and the instance has to survive it.
--
-- Backfill: every existing `campaign_members.character_id` points at a hero
-- who is already being played, so those rows become instances in place.
-- `forked_from` is left null for them deliberately. They were never forked
-- from anything, and minting a blueprint for them would be a claim about
-- history that is not true.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "characters" ADD COLUMN "campaign_id" TEXT
  REFERENCES "campaigns" ("id") ON DELETE SET NULL;

ALTER TABLE "characters" ADD COLUMN "forked_from" TEXT;

CREATE INDEX "characters_campaign_idx" ON "characters" ("campaign_id");
CREATE INDEX "characters_forked_from_idx" ON "characters" ("forked_from");

-- Heroes already seated become instances of themselves.
UPDATE "characters"
SET "campaign_id" = (
  SELECT "m"."campaign_id"
  FROM "campaign_members" AS "m"
  WHERE "m"."character_id" = "characters"."id"
  LIMIT 1
)
WHERE "id" IN (SELECT "character_id" FROM "campaign_members"
               WHERE "character_id" IS NOT NULL);
