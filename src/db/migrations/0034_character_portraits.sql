-- 0034: a face for a hero.
--
-- A character had no picture anywhere: not on the sheet, not in `characters`,
-- not in `CharacterRow`. `HeroCard` has taken a `portrait` node since it was
-- written and every caller passed initials.
--
-- Its own table, for one reason worth writing down. The obvious home was
-- `campaign_images`, which already stores uploads on disk and serves them
-- through a route that asks "are you at this table". But a character precedes
-- a campaign, outlives it, and may never have one — so that access rule is
-- wrong at both ends, and inheriting it would make a portrait unreachable for
-- exactly the heroes who have not sat down yet. Access here is judged from the
-- character instead: the owner always, plus the members of whatever table it
-- currently sits at.
--
-- One row per character, so a portrait is not a gallery. Replacing one deletes
-- the row and its file rather than piling up versions nothing can reach.
--
-- `remote_url` is the other half of the same field. A portrait may be a link
-- rather than an upload, in which case no file exists and `file_path` is
-- empty. Hero Nexus makes no outbound calls at runtime, so a linked portrait
-- is fetched by the reader's browser and never by the server — which is a real
-- difference in behaviour and is said out loud in the UI rather than hidden.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "character_portraits" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "character_id" TEXT NOT NULL
    REFERENCES "characters" ("id") ON DELETE CASCADE,
  "file_path" TEXT NOT NULL DEFAULT '',
  "remote_url" TEXT NOT NULL DEFAULT '',
  "mime" TEXT NOT NULL DEFAULT '',
  "bytes" INTEGER NOT NULL DEFAULT 0,
  "alt" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX "character_portraits_character_idx"
  ON "character_portraits" ("character_id");
