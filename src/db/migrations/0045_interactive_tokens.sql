-- Things on the board a table can do something to.
--
-- The-sand-table's phase 7. A door, a chest, a window, a statue: a scenery
-- token that can be open, closed or locked, that can be picked, that can be
-- broken. The state lives on the token row rather than in the terrain
-- document because a player changes it — the terrain is the DM's to write,
-- and "I open the door" is not an edit to the map.
--
-- state:   NULL for a thing with no state (a boulder), else open | closed |
--          locked | broken. Open and broken things do not block a tile.
-- lock_dc: what picking the lock is rolled against. Staff only on the wire —
--          a player who could read it would know whether to bother.
-- hp:      NULL for an indestructible thing. A thing with hit points is
--          damaged the way a foe is, by the DM applying what was rolled, and
--          is broken at 0.
-- facing:  camera, or a compass side. A signpost stands still; an ogre turns
--          to face you.

ALTER TABLE "battle_map_tokens" ADD COLUMN "state" TEXT;
ALTER TABLE "battle_map_tokens" ADD COLUMN "lock_dc" INTEGER;
ALTER TABLE "battle_map_tokens" ADD COLUMN "hp_current" INTEGER;
ALTER TABLE "battle_map_tokens" ADD COLUMN "hp_max" INTEGER;
ALTER TABLE "battle_map_tokens" ADD COLUMN "facing" TEXT NOT NULL DEFAULT 'camera';
