-- The sand table: a battlefield authored in 2D and rendered in 3D.
--
-- NOT campaign_maps. That table (0028) is a region map - an uploaded picture
-- with pins on it, lore furniture with a campaign's lifetime. This is a room
-- with a fight in it, and it lives and dies with an encounter.
--
-- Terrain is a document, not rows. `terrain` holds a TerrainDoc as JSON, the
-- way characters.sheet holds a CharacterSheet: read whole, written whole,
-- never queried by its interior. A 40x40 map is 1,600 tiles, and as rows that
-- is 1,600 inserts on every "fill this region with grass".
--
-- A token is a POSITION for an initiative_entries row, not a second combatant
-- model. The entry already carries label, HP, AC, conditions, side and turn
-- order, and getLiveState already filters it by role. entry_id is nullable
-- because a barrel is on the board and not in the turn order.

CREATE TABLE IF NOT EXISTS "battle_maps" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "campaign_id"  TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  -- The fight this board is for. SET NULL: a board outlives a deleted fight
  -- as an authored room the DM may run again.
  "encounter_id" TEXT REFERENCES "initiative_encounters"("id") ON DELETE SET NULL,
  "name"         TEXT NOT NULL DEFAULT '',
  -- TerrainDoc, JSON. See src/@shared/battlemap/types.ts.
  "terrain"      TEXT NOT NULL,
  -- JSON array of revealed tile indices. Empty = the party has seen nothing.
  -- The fog of war is a server-side filter over this; see lib/battlemap.ts
  -- `fogged` and decision 6 in the handoff.
  "revealed"     TEXT NOT NULL DEFAULT '[]',
  -- 'dm' | 'shared'. A dm board does not appear in a player's read at all.
  "visibility"   TEXT NOT NULL DEFAULT 'dm',
  -- At most one board per campaign is on the table at once, following
  -- initiative_encounters.is_active and campaign_maps.spotlighted.
  "is_active"    INTEGER NOT NULL DEFAULT 0,
  "created_by"   TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "battle_maps_campaign_idx"
  ON "battle_maps" ("campaign_id");
CREATE UNIQUE INDEX IF NOT EXISTS "battle_maps_one_active_idx"
  ON "battle_maps" ("campaign_id")
  WHERE "is_active" = 1;

CREATE TABLE IF NOT EXISTS "battle_map_tokens" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "map_id"     TEXT NOT NULL REFERENCES "battle_maps"("id") ON DELETE CASCADE,
  -- CASCADE: a combatant removed from the fight leaves the board with them.
  "entry_id"   TEXT REFERENCES "initiative_entries"("id") ON DELETE CASCADE,
  -- Only read when entry_id is null. A token for a combatant reads its label
  -- off the entry live, because numberDuplicates renames "Goblin" to
  -- "Goblin 1" when a second one walks in.
  "label"      TEXT NOT NULL DEFAULT '',
  "x"          INTEGER NOT NULL,
  "y"          INTEGER NOT NULL,
  -- Feet above the tile's own elevation. A flying creature, a token on a table.
  "altitude"   INTEGER NOT NULL DEFAULT 0,
  -- 1 = medium, 2 = large, 3 = huge. Tiles occupied, per side.
  "footprint"  INTEGER NOT NULL DEFAULT 1,
  "tint"       TEXT NOT NULL DEFAULT '',
  -- 'dm' | 'shared'. A dm token is the ambush the party has not seen.
  "visibility" TEXT NOT NULL DEFAULT 'shared',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "battle_map_tokens_map_idx"
  ON "battle_map_tokens" ("map_id");
-- One combatant, one place. The partial index is what stops a fighter being
-- dealt onto the same board twice.
CREATE UNIQUE INDEX IF NOT EXISTS "battle_map_tokens_entry_idx"
  ON "battle_map_tokens" ("map_id", "entry_id")
  WHERE "entry_id" IS NOT NULL;
