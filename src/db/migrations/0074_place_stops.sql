-- A stop at a place, with no picture.
--
-- A journey stop was always a point on a map: `map_id`, `x` and `y` were
-- required. So a party could only be "here" once somebody had pinned up a
-- map, and day one of a campaign — "where does session one open?" — had no
-- way to say it. A stop may now stand at a place instead:
--
--   map_journey.map_id    — nullable: a stop with no map is at its place.
--   map_journey.x / y     — nullable, for the same reason.
--   map_journey.place_id  — the place a stop with no map stands in. A
--                           `location` canon entry; set null on delete, which
--                           leaves the stop where it was, under its label.
--
-- A map stop keeps working exactly as before; the place of a map stop is
-- still read from its mark or its map, never from this column.
--
-- SQLite cannot drop NOT NULL in place, so the table is rebuilt: new table,
-- every row copied, old table dropped, new one renamed. Nothing references
-- map_journey, so the drop is safe with foreign keys on.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "map_journey_next" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "map_id" TEXT REFERENCES "campaign_maps"("id") ON DELETE CASCADE,
  "seq" INTEGER NOT NULL,
  "x" REAL,
  "y" REAL,
  "label" TEXT NOT NULL DEFAULT '',
  "pin_id" TEXT REFERENCES "campaign_map_pins"("id") ON DELETE SET NULL,
  "session_id" TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "world_date" TEXT,
  "created_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "planned" INTEGER NOT NULL DEFAULT 0,
  "visibility" TEXT NOT NULL DEFAULT 'shared'
    CHECK ("visibility" IN ('dm','shared')),
  "place_id" TEXT REFERENCES "canon_entries"("id") ON DELETE SET NULL
);

INSERT INTO "map_journey_next" (
  "id", "campaign_id", "map_id", "seq", "x", "y", "label", "pin_id",
  "session_id", "world_date", "created_by", "created_at", "planned",
  "visibility"
)
SELECT
  "id", "campaign_id", "map_id", "seq", "x", "y", "label", "pin_id",
  "session_id", "world_date", "created_by", "created_at", "planned",
  "visibility"
FROM "map_journey";

DROP TABLE "map_journey";
ALTER TABLE "map_journey_next" RENAME TO "map_journey";

CREATE INDEX "map_journey_map_idx" ON "map_journey" ("map_id", "seq");
CREATE INDEX "map_journey_campaign_idx" ON "map_journey" ("campaign_id");
