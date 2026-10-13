-- The world: places as the spine.
--
-- Canon already holds the people and places, maps already hold marks and the
-- journey, shops and encounter plans already exist. None of them knew where
-- the others were. One pointer — where a thing is — joins them.
--
--   canon_entries.place_id      — where it is: a place's parent place (Sword
--                                 Coast › Waterdeep › Dock Ward), an NPC's
--                                 home, a faction's seat, a creature's lair.
--                                 Always a `location` entry; asserted on write.
--   campaign_maps.place_id      — the place this map shows. A mark for that
--                                 place on another map opens it.
--   campaign_shops.place_id     — where the shop stands.
--   campaign_shops.keeper_id    — the NPC behind the counter.
--   encounter_plans.place_id    — where the fight is planned.
--   encounter_plans.ran_at / ran_session_id
--                               — when it was last fought, and in which
--                                 session: "fought here, session 6".
--   campaign_map_pins.encounter_plan_id
--                               — a battle mark: the exact spot on the map.
--   map_journey.planned         — a stop the party has not reached yet: where
--                                 they are headed. Unnumbered (seq 0) until
--                                 "The party is here" makes it real.
--   map_journey.visibility      — a planned stop is the DM's until shown; a
--                                 reached one is the party's.
--   canon_party_notes           — what the party has written about an NPC or a
--                                 place, signed. The record of a table that
--                                 was played, so never carried in a package.
--
-- Every new pointer is ON DELETE SET NULL: deleting a city must not delete the
-- innkeeper who lived in it, only make them homeless.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

ALTER TABLE "canon_entries" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;
CREATE INDEX "canon_entries_place_idx" ON "canon_entries" ("place_id");

ALTER TABLE "campaign_maps" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;

ALTER TABLE "campaign_shops" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;
ALTER TABLE "campaign_shops" ADD COLUMN "keeper_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;

ALTER TABLE "encounter_plans" ADD COLUMN "place_id" TEXT
  REFERENCES "canon_entries"("id") ON DELETE SET NULL;
ALTER TABLE "encounter_plans" ADD COLUMN "ran_at" TEXT;
ALTER TABLE "encounter_plans" ADD COLUMN "ran_session_id" TEXT
  REFERENCES "campaign_sessions"("id") ON DELETE SET NULL;

ALTER TABLE "campaign_map_pins" ADD COLUMN "encounter_plan_id" TEXT
  REFERENCES "encounter_plans"("id") ON DELETE SET NULL;

ALTER TABLE "map_journey" ADD COLUMN "planned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "map_journey" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'shared'
  CHECK ("visibility" IN ('dm','shared'));

CREATE TABLE "canon_party_notes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "entry_id" TEXT NOT NULL REFERENCES "canon_entries"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "canon_party_notes_entry_idx" ON "canon_party_notes" ("entry_id");
