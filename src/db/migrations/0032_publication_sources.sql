-- 0032: which of the author's rows a listing came out of.
--
-- `publications.homebrew_id` already did this for the live-linked kind, and it
-- carries a unique index so publishing the same spell twice edits the listing
-- that exists rather than opening a second stall selling the same thing. Heroes
-- and campaigns had no such column, so nothing stopped one hero appearing on the
-- shelf four times.
--
-- These two are **not** live links, unlike `homebrew_id`. A hero and a campaign
-- are published as snapshots; the column exists so a listing can be found from
-- the row it came out of, and so the same row cannot be listed twice. Publishing
-- again re-freezes the payload and bumps `version`.
--
-- SET NULL rather than CASCADE, for the same reason as `homebrew_id`: deleting
-- the character leaves the listing rendering the sheet it froze, which is what
-- anybody who already took it has anyway.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "publications"
  ADD COLUMN "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL;
ALTER TABLE "publications"
  ADD COLUMN "campaign_id" TEXT REFERENCES "campaigns"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "publications_character_idx"
  ON "publications" ("character_id") WHERE "character_id" IS NOT NULL;
CREATE UNIQUE INDEX "publications_campaign_idx"
  ON "publications" ("campaign_id") WHERE "campaign_id" IS NOT NULL;
