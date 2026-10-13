-- Dice games of the house's own rules: a third tavern-game kind.
--
-- `kind` on tavern_house_games and tavern_games carries a CHECK that names
-- the two kinds 0075 knew. SQLite cannot change a CHECK in place, so the
-- tables are rebuilt with 'custom-dice' added.
--
-- The runner keeps foreign keys ON (src/db/migrate.ts), and a DROP TABLE
-- runs an implicit DELETE that fires ON DELETE CASCADE — dropping
-- tavern_games first would take every seat and move with it. So all four
-- tavern tables are rebuilt together: the new ones made and filled, the old
-- ones dropped children first (moves, seats, games, house games), then the
-- new ones renamed into place. SQLite (3.26+) rewrites each foreign key that
-- names a renamed table, so the references land on the final names.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "tavern_house_games_next" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('liars-dice','crowns','custom-dice')),
  "name" TEXT NOT NULL DEFAULT '',
  "blurb" TEXT NOT NULL DEFAULT '',
  "rules" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE "tavern_games_next" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "house_game_id" TEXT REFERENCES "tavern_house_games_next"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('liars-dice','crowns','custom-dice')),
  "name" TEXT NOT NULL DEFAULT '',
  "blurb" TEXT NOT NULL DEFAULT '',
  "rules" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'seating'
    CHECK ("status" IN ('seating','playing','ended')),
  "round" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT '{}',
  "session_id" TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "created_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "ended_at" TEXT
);

CREATE TABLE "tavern_game_seats_next" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "game_id" TEXT NOT NULL REFERENCES "tavern_games_next"("id") ON DELETE CASCADE,
  "seat_order" INTEGER NOT NULL DEFAULT 0,
  "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "canon_entry_id" TEXT REFERENCES "canon_entries"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'invited'
    CHECK ("status" IN ('invited','seated','declined','out')),
  "net_cp" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE "tavern_game_moves_next" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "game_id" TEXT NOT NULL REFERENCES "tavern_games_next"("id") ON DELETE CASCADE,
  "round" INTEGER NOT NULL DEFAULT 0,
  "seat_id" TEXT REFERENCES "tavern_game_seats_next"("id") ON DELETE SET NULL,
  "actor_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL DEFAULT '',
  "line" TEXT NOT NULL DEFAULT '',
  "hidden" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO "tavern_house_games_next" SELECT * FROM "tavern_house_games";
INSERT INTO "tavern_games_next" SELECT * FROM "tavern_games";
INSERT INTO "tavern_game_seats_next" SELECT * FROM "tavern_game_seats";
INSERT INTO "tavern_game_moves_next" SELECT * FROM "tavern_game_moves";

DROP TABLE "tavern_game_moves";
DROP TABLE "tavern_game_seats";
DROP TABLE "tavern_games";
DROP TABLE "tavern_house_games";

ALTER TABLE "tavern_house_games_next" RENAME TO "tavern_house_games";
ALTER TABLE "tavern_games_next" RENAME TO "tavern_games";
ALTER TABLE "tavern_game_seats_next" RENAME TO "tavern_game_seats";
ALTER TABLE "tavern_game_moves_next" RENAME TO "tavern_game_moves";

CREATE INDEX "tavern_house_games_campaign_idx" ON "tavern_house_games" ("campaign_id");
CREATE INDEX "tavern_games_campaign_idx" ON "tavern_games" ("campaign_id", "created_at");
CREATE UNIQUE INDEX "tavern_games_running_idx" ON "tavern_games" ("campaign_id")
  WHERE "status" != 'ended';
CREATE INDEX "tavern_game_seats_game_idx" ON "tavern_game_seats" ("game_id", "seat_order");
CREATE INDEX "tavern_game_moves_game_idx" ON "tavern_game_moves" ("game_id", "created_at");
