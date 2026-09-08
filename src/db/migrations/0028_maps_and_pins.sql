-- 0028: a map with things marked on it.
--
--   campaign_maps      — one uploaded picture the table treats as a map.
--   campaign_map_pins  — something marked on it.
--
-- Deliberately not a battle grid. Tokens that move, fog of war and a square
-- lattice are a different feature with a different failure mode — one that has
-- to be right at sixty frames a second while five people drag things. This is
-- the other half of what a table actually uses a map for: knowing where places
-- are, and being told about them one at a time.
--
-- Pins are stored as **fractions of the image**, 0..1, not pixels. A pin
-- placed on a DM's 2560-wide monitor has to land in the same place on a
-- player's phone, and a pixel coordinate is a promise about a viewport that
-- nobody else has.
--
-- `canon_entry_id` is the point of the feature rather than a nicety: a pin
-- that opens the innkeeper's entry is a map of the world the campaign already
-- wrote down, instead of a second place to write the same names. No foreign
-- key, following 0011 — SQLite cannot add one by ALTER later and a dangling
-- link should read as a pin with nothing behind it, not break the map.
--
-- Two visibilities, as everywhere: a DM marks the cult's safehouse on the
-- party's own map and the party does not see it until they are told.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_maps" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  -- The picture. Cascade: a map with no image is not a map.
  "image_id"    TEXT NOT NULL REFERENCES "campaign_images"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL DEFAULT '',
  "visibility"  TEXT NOT NULL DEFAULT 'dm'
                CHECK ("visibility" IN ('dm', 'shared')),
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_maps_campaign_idx" ON "campaign_maps" ("campaign_id");

CREATE TABLE "campaign_map_pins" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "map_id"         TEXT NOT NULL REFERENCES "campaign_maps"("id") ON DELETE CASCADE,
  -- Fractions of the image, 0..1. See the note above.
  "x"              REAL NOT NULL DEFAULT 0.5,
  "y"              REAL NOT NULL DEFAULT 0.5,
  "label"          TEXT NOT NULL DEFAULT '',
  -- What the DM knows about it. Never travels to a player.
  "dm_note"        TEXT NOT NULL DEFAULT '',
  -- The canon entry this place already has, if it has one. No REFERENCES: see
  -- the note above.
  "canon_entry_id" TEXT,
  "visibility"     TEXT NOT NULL DEFAULT 'dm'
                   CHECK ("visibility" IN ('dm', 'shared')),
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_map_pins_map_idx" ON "campaign_map_pins" ("map_id");
