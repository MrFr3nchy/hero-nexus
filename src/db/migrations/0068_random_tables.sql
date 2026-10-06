-- Random tables.
--
-- A DM's own tables to roll on — tavern names, loot, weather, wandering
-- monsters. Each entry carries a weight, and the die is derived from the
-- total: `{ "text": "Rain", "weight": 3 }` is three faces of it. That covers
-- both "d20 with ranges" and "d6, one each".
--
-- Prep, so it travels in campaign packages (`CARRIED`). Rolls land in Dice
-- (`campaign_rolls`) like any other, behind the screen unless the DM shows
-- the party.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "random_tables" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL DEFAULT '',
  "entries" TEXT NOT NULL DEFAULT '[]',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "random_tables_campaign_idx" ON "random_tables" ("campaign_id");
