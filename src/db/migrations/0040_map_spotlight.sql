-- A map the DM puts in front of everybody at once.
--
-- `MapPanel` records the standing decision in its own header: "Deliberately
-- not a battle grid: no tokens, no fog, no lattice." That decision stands. A
-- spotlight is the other half of what a table uses a map for — the DM saying
-- "look at this" and it appearing on five screens — and it needs no
-- coordinate system, no tokens and no line of sight, because pins are already
-- fractions of the image and already land in the same place on a phone and a
-- monitor.
--
-- A flag on the map rather than a column on the campaign, following
-- `initiative_encounters.is_active`: at most one is lit, the same way at most
-- one fight is running, and it is set by clearing the rest first.

ALTER TABLE "campaign_maps" ADD COLUMN "spotlighted" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "campaign_maps_spotlight_idx"
  ON "campaign_maps" ("campaign_id", "spotlighted");
