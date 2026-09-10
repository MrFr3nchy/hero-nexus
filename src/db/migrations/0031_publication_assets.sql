-- 0031: pictures on the shelf.
--
--   publication_assets      — the files a listing carries.
--   publications.cover_asset_id — the one drawn on its card.
--
-- Publishing a picture copies the bytes rather than pointing at the campaign
-- file it came from. Three reasons, and the first alone settles it:
--
--   1. `campaign_images` rows are read behind a `requireCampaignRole` check.
--      A listing that pointed at one would either be unreadable to everybody
--      who is not at that table, or would need the check bypassed — and a
--      bypass on the route that serves campaign files is the last place to put
--      one.
--   2. Deleting the campaign cascades its images away, and a listing must not
--      lose its picture because its author archived a table.
--   3. The bytes on a listing are a snapshot, like every other payload here.
--
-- Files live under UPLOADS_DIR/library/<publication_id>/, so the whole of a
-- listing's storage is one directory to remove when it is deleted. Adopting a
-- picture copies the bytes again, into a campaign the adopter runs — see
-- docs/handoff/wandering-library/README.md for why there is deliberately no
-- user-level image store.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "publication_assets" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "publication_id" TEXT NOT NULL REFERENCES "publications"("id") ON DELETE CASCADE,
  -- Path under UPLOADS_DIR, e.g. "library/<publicationId>/<uuid>.webp".
  "file_path"      TEXT NOT NULL,
  "mime"           TEXT NOT NULL,
  "bytes"          INTEGER NOT NULL DEFAULT 0,
  -- Shown when the image cannot load, and read out by screen readers.
  "alt"            TEXT NOT NULL DEFAULT '',
  -- Which piece of the package this picture belongs to, for a bundle whose
  -- canon entries and maps each have one. Not a reference: items are rewritten
  -- wholesale when a package is re-frozen, and an asset outliving that is
  -- better than a re-freeze failing on a constraint.
  "item_local_key" TEXT NOT NULL DEFAULT '',
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "publication_assets_publication_idx"
  ON "publication_assets" ("publication_id");

-- The picture drawn on the listing's card. No REFERENCES: SQLite cannot add a
-- foreign key by ALTER, and a cover that has been deleted should read as a card
-- with no picture rather than break the listing.
ALTER TABLE "publications" ADD COLUMN "cover_asset_id" TEXT;
