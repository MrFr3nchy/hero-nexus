-- Where quests and clocks happen.
--
-- 0072 made a place the spine for people, shops, maps and fights. Quests and
-- clocks were left off it, so a quest was only "at" a place by accident —
-- through a mark on a map that happened to name it. They get the same pointer
-- now.
--
--   campaign_quests.place_id            — where the quest starts, or happens.
--   campaign_quests.giver_id            — the NPC who handed it out. The free-
--                                         text `giver` stays, and is what shows
--                                         when nobody in the canon gave it.
--   campaign_quest_objectives.place_id  — where this step happens: a quest
--                                         that starts in a tavern and ends in
--                                         a crypt.
--   campaign_clocks.place_id            — where the clock is ticking: the
--                                         city's deadline is felt in every
--                                         tavern inside the city.
--
-- Every pointer is ON DELETE SET NULL, as in 0072: deleting a city must not
-- delete the quest that ran through it.
--
-- Backfill: a quest that was only at a place through marks keeps that place,
-- when its marks agree on exactly one. A mark for a place counts as that
-- place; any other mark counts as the place its map shows. Quests whose marks
-- disagree, or name no place, are left unplaced — "Not placed yet" in the
-- World asks the DM, rather than this file guessing.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

ALTER TABLE "campaign_quests" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;
ALTER TABLE "campaign_quests" ADD COLUMN "giver_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;
CREATE INDEX "campaign_quests_place_idx" ON "campaign_quests" ("place_id");

ALTER TABLE "campaign_quest_objectives" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;

ALTER TABLE "campaign_clocks" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;
CREATE INDEX "campaign_clocks_place_idx" ON "campaign_clocks" ("place_id");

UPDATE "campaign_quests"
SET "place_id" = (
  SELECT MAX(COALESCE(
    CASE WHEN ce."kind" = 'location' THEN pin."canon_entry_id" END,
    m."place_id"
  ))
  FROM "campaign_map_pins" pin
  JOIN "campaign_maps" m ON m."id" = pin."map_id"
  LEFT JOIN "canon_entries" ce ON ce."id" = pin."canon_entry_id"
  WHERE pin."quest_id" = "campaign_quests"."id"
)
WHERE "place_id" IS NULL
  AND (
    SELECT COUNT(DISTINCT COALESCE(
      CASE WHEN ce."kind" = 'location' THEN pin."canon_entry_id" END,
      m."place_id"
    ))
    FROM "campaign_map_pins" pin
    JOIN "campaign_maps" m ON m."id" = pin."map_id"
    LEFT JOIN "canon_entries" ce ON ce."id" = pin."canon_entry_id"
    WHERE pin."quest_id" = "campaign_quests"."id"
  ) = 1;
