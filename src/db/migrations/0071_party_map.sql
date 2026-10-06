-- The party's map.
--
-- A canon map (0024's campaign_maps / campaign_map_pins) grows from the DM's
-- picture-with-pins into the table's shared record of where they have been.
--
--   campaign_maps.marks_open   — players may put marks on it. Theirs are seen
--                                by everyone at once; staff can hide or remove
--                                any mark.
--   campaign_maps.fogged       — fog of war over the picture: only revealed
--                                cells show, and marks in fog are not sent to
--                                players. `revealed` is the JSON list of
--                                revealed cell indices on a FOG_COLS × FOG_ROWS
--                                lattice over the image (lib/party-map.ts).
--   campaign_map_pins.kind     — place, danger, treasure, rumour, camp, note.
--   campaign_map_pins.note     — what the party wrote about it. `dm_note`
--                                stays the DM's alone.
--   campaign_map_pins.created_by — who put it there; a player edits only their
--                                own.
--   campaign_map_pins.quest_id / session_id / journal_id
--                              — what else in the record happened here.
--   map_journey                — the party's route: numbered stops, each with
--                                the session it was reached in and the world
--                                date. Staff place them. The record of a table
--                                that was played, so never carried.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

ALTER TABLE "campaign_maps" ADD COLUMN "marks_open" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "campaign_maps" ADD COLUMN "fogged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "campaign_maps" ADD COLUMN "revealed" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "campaign_map_pins" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'place'
  CHECK ("kind" IN ('place','danger','treasure','rumour','camp','note'));
ALTER TABLE "campaign_map_pins" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_map_pins" ADD COLUMN "created_by" TEXT
  REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "campaign_map_pins" ADD COLUMN "quest_id" TEXT
  REFERENCES "campaign_quests"("id") ON DELETE SET NULL;
ALTER TABLE "campaign_map_pins" ADD COLUMN "session_id" TEXT
  REFERENCES "campaign_sessions"("id") ON DELETE SET NULL;
ALTER TABLE "campaign_map_pins" ADD COLUMN "journal_id" TEXT
  REFERENCES "player_journals"("id") ON DELETE SET NULL;

CREATE TABLE "map_journey" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "map_id" TEXT NOT NULL REFERENCES "campaign_maps"("id") ON DELETE CASCADE,
  "seq" INTEGER NOT NULL,
  "x" REAL NOT NULL,
  "y" REAL NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "pin_id" TEXT REFERENCES "campaign_map_pins"("id") ON DELETE SET NULL,
  "session_id" TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "world_date" TEXT,
  "created_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "map_journey_map_idx" ON "map_journey" ("map_id", "seq");
