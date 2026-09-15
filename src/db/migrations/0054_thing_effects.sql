-- Things that do something (improvements 08).
--
-- A thing on the board — a lever, a plate, a dam — can carry what it does:
-- one JSON `ThingEffect` (`@shared/battlemap/types.ts`) naming a trigger
-- (operate, enter, damage, destroy), whether it fires once, toggles or
-- always, who sets it off, a Perception DC that hides it, and the changes
-- it makes — floor, height, a wall, another thing, a reveal, damage or a
-- condition on whoever stands there, a line in the feed. NULL for a thing
-- that only opens and closes. `fireThing` in `server/battlemap.ts` is the
-- one place it is applied.

ALTER TABLE "battle_map_tokens" ADD COLUMN "effect" TEXT;
