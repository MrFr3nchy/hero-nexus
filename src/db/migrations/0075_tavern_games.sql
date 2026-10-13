-- Tavern games: gambling at the table, round by round, for real coin.
--
--   tavern_house_games  — a DM's own named rules for liar's dice or Crowns.
--                         Prep, like a random table: carried in a package.
--   tavern_games        — one game, opened by the DM. Its rules are copied
--                         in when it opens, so editing the house game never
--                         changes a game in progress. `state` is the round
--                         as JSON (cups, hands, the deck, the bids), never
--                         sent to a player unfiltered. Play history: never
--                         carried.
--   tavern_game_seats   — who sits: a hero (character) or an NPC (a canon
--                         entry), with the name kept so a seat outlives
--                         either. `net_cp` is the running net, for the record.
--   tavern_game_moves   — what happened, line by line. `hidden` rows (reads,
--                         cheats, catches) are for staff and whoever did it.
--
-- At most one tavern game is running per campaign: the panel shows "the"
-- game, so the partial unique index makes that a fact, not a hope.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "tavern_house_games" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('liars-dice','crowns')),
  "name" TEXT NOT NULL DEFAULT '',
  "blurb" TEXT NOT NULL DEFAULT '',
  "rules" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "tavern_house_games_campaign_idx" ON "tavern_house_games" ("campaign_id");

CREATE TABLE "tavern_games" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "house_game_id" TEXT REFERENCES "tavern_house_games"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('liars-dice','crowns')),
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
CREATE INDEX "tavern_games_campaign_idx" ON "tavern_games" ("campaign_id", "created_at");
CREATE UNIQUE INDEX "tavern_games_running_idx" ON "tavern_games" ("campaign_id")
  WHERE "status" != 'ended';

CREATE TABLE "tavern_game_seats" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "game_id" TEXT NOT NULL REFERENCES "tavern_games"("id") ON DELETE CASCADE,
  "seat_order" INTEGER NOT NULL DEFAULT 0,
  "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "canon_entry_id" TEXT REFERENCES "canon_entries"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'invited'
    CHECK ("status" IN ('invited','seated','declined','out')),
  "net_cp" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "tavern_game_seats_game_idx" ON "tavern_game_seats" ("game_id", "seat_order");

CREATE TABLE "tavern_game_moves" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "game_id" TEXT NOT NULL REFERENCES "tavern_games"("id") ON DELETE CASCADE,
  "round" INTEGER NOT NULL DEFAULT 0,
  "seat_id" TEXT REFERENCES "tavern_game_seats"("id") ON DELETE SET NULL,
  "actor_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL DEFAULT '',
  "line" TEXT NOT NULL DEFAULT '',
  "hidden" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "tavern_game_moves_game_idx" ON "tavern_game_moves" ("game_id", "created_at");
