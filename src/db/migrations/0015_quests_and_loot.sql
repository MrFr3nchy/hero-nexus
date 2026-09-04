-- 0015: what the party is doing, and what it is carrying.
--
--   campaign_quests            — a thread the party is pulling on. Two bodies
--                                again: `summary` is what the party has been
--                                told, `dm_notes` is what is actually going on.
--   campaign_quest_objectives  — the ticked lines under a quest. Each carries
--                                its own visibility, because "find the ledger"
--                                and "the ledger is a forgery" belong to the
--                                same quest and different audiences.
--   party_loot                 — the shared haul. `holder_character_id` answers
--                                the question that actually starts arguments:
--                                who is carrying it.
--   party_treasury             — one row per campaign holding the party's
--                                common purse. Coins are a running total the
--                                whole table edits, not a list of finds, so
--                                they are columns rather than rows.
--
-- The 2024 coin set, matching characters' own `currency` block so the split
-- helper does not have to translate between two vocabularies.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_quests" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL DEFAULT '',
  "summary"     TEXT NOT NULL DEFAULT '',
  "dm_notes"    TEXT NOT NULL DEFAULT '',
  "giver"       TEXT NOT NULL DEFAULT '',
  "reward"      TEXT NOT NULL DEFAULT '',
  "status"      TEXT NOT NULL DEFAULT 'active',   -- rumour | active | done | failed
  "visibility"  TEXT NOT NULL DEFAULT 'dm',       -- dm | shared
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_quests_campaign_idx"
  ON "campaign_quests" ("campaign_id");

CREATE TABLE "campaign_quest_objectives" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "quest_id"   TEXT NOT NULL REFERENCES "campaign_quests"("id") ON DELETE CASCADE,
  "body"       TEXT NOT NULL DEFAULT '',
  "done"       INTEGER NOT NULL DEFAULT 0,
  "visibility" TEXT NOT NULL DEFAULT 'shared',    -- dm | shared
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_quest_objectives_quest_idx"
  ON "campaign_quest_objectives" ("quest_id");

CREATE TABLE "party_loot" (
  "id"                  TEXT PRIMARY KEY NOT NULL,
  "campaign_id"         TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name"                TEXT NOT NULL DEFAULT '',
  "quantity"            INTEGER NOT NULL DEFAULT 1,
  "notes"               TEXT NOT NULL DEFAULT '',
  "kind"                TEXT NOT NULL DEFAULT 'item', -- item | consumable | treasure | magic
  "holder_character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "identified"          INTEGER NOT NULL DEFAULT 1,
  "created_by"          TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "party_loot_campaign_idx" ON "party_loot" ("campaign_id");

CREATE TABLE "party_treasury" (
  "campaign_id" TEXT PRIMARY KEY NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "cp"          INTEGER NOT NULL DEFAULT 0,
  "sp"          INTEGER NOT NULL DEFAULT 0,
  "ep"          INTEGER NOT NULL DEFAULT 0,
  "gp"          INTEGER NOT NULL DEFAULT 0,
  "pp"          INTEGER NOT NULL DEFAULT 0,
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
