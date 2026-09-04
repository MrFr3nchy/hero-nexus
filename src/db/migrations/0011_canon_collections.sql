-- 0011: a richer archive — shelves, pictures, and per-kind facts.
--   canon_collections  — a named shelf (Bestiary, spellbook, notebook). Purely
--                        organisational: reveals stay per entry, so a
--                        half-known bestiary shows a player only what they met.
--   canon_entries      — gains collection_id, image_id (campaign_images) and a
--                        small JSON `fields` blob for kind-specific facts.
--
-- The kind vocabulary widens to npc | creature | location | faction | item |
-- spell | lore | note. Existing rows keep their kind; SQLite stores it as
-- plain TEXT, so nothing needs rewriting.
--
-- image_id / collection_id are added without REFERENCES: SQLite cannot add a
-- foreign key to an existing table with ALTER, and rebuilding canon_entries
-- would drop the reveal and link rows that point at it. A dangling image id
-- renders as no picture; a dangling collection id shows the entry as loose.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "canon_collections" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL DEFAULT '',
  "blurb"       TEXT NOT NULL DEFAULT '',
  "icon"        TEXT NOT NULL DEFAULT '📚',
  "image_id"    TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "canon_collections_campaign_idx"
  ON "canon_collections" ("campaign_id");

ALTER TABLE "canon_entries" ADD COLUMN "collection_id" TEXT;
ALTER TABLE "canon_entries" ADD COLUMN "image_id"      TEXT;
ALTER TABLE "canon_entries" ADD COLUMN "fields"        TEXT NOT NULL DEFAULT '{}';

CREATE INDEX "canon_entries_collection_idx"
  ON "canon_entries" ("collection_id");
