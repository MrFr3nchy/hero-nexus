-- Floors on the sand table.
--
-- A board's terrain document now stacks floors: `battle_maps.terrain` holds
-- a BoardDoc (version 2) — a list of LevelDocs, each a whole version-1
-- terrain with a name and a height, and the stairs between them. A stored
-- version-1 document still reads: `normalizeBoard` lifts it into a board
-- with one floor, the ground floor, whose id is 'ground'. Nothing here
-- rewrites the documents; they upgrade on read and are written back
-- as version 2 the next time the DM saves.
--
-- `battle_maps.revealed` likewise becomes an object of level id to tile
-- indices; a stored array reads as the ground floor's.
--
-- A token stands on one floor. The default is the floor a version-1 board
-- becomes, so every token placed before tonight is still where it was.

ALTER TABLE "battle_map_tokens" ADD COLUMN "level" TEXT NOT NULL DEFAULT 'ground';
