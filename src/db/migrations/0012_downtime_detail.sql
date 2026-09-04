-- 0012: downtime gains pictures and a reveal.
--   image_id   — a letter, a sketch, a shopping list (campaign_images).
--   visibility — 'party' (everyone at the table, the old behaviour and the
--                default for existing rows) or 'player' (the author and staff
--                only, until the DM widens it).
--
-- Added without REFERENCES for the same reason as 0011: SQLite cannot add a
-- foreign key with ALTER, and rebuilding the table would drop the history rows
-- that point at these actions. A dangling image id renders as no picture.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "downtime_actions" ADD COLUMN "image_id"   TEXT;
ALTER TABLE "downtime_actions" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'party';
