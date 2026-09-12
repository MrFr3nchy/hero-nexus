-- Placements on an encounter plan (improvements 02).
--
-- Where each copy of a planned monster stands when the plan is dealt onto a
-- board: a JSON array of `{ mapId, x, y }`, at most `count` long. Spots on a
-- board that no longer exists are skipped at deal time rather than failing
-- the fight; anything unplaced takes the line-walk `dealEncounterIn` uses.

ALTER TABLE "encounter_plan_lines" ADD COLUMN "spots" TEXT NOT NULL DEFAULT '[]';
