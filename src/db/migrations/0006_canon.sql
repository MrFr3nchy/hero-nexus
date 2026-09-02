-- 0006: party canon — a campaign wiki with a DM view and a party view.
--   canon_entries  — one NPC / location / item / faction / lore entry. Two
--                    bodies: dm_body (private notes) and party_body (what the
--                    party has been told). Never one body with hidden regions.
--   canon_links    — directed entry-to-entry references.
--   canon_reveals  — per-member reveal, keyed on user_id (NOT campaign_members:
--                    the GM has no member row).
--
-- Server-side visibility filtering mirrors getLiveState: a player only ever
-- receives party_body, and only for entries that are 'shared' or revealed to
-- them. dm_body never leaves the server for a non-staff viewer.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "canon_entries" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "kind"        TEXT NOT NULL,                       -- npc | location | item | faction | lore
  "title"       TEXT NOT NULL DEFAULT '',
  "dm_body"     TEXT NOT NULL DEFAULT '',
  "party_body"  TEXT NOT NULL DEFAULT '',
  "visibility"  TEXT NOT NULL DEFAULT 'dm',          -- dm | shared
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "canon_entries_campaign_idx" ON "canon_entries" ("campaign_id");

CREATE TABLE "canon_links" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "campaign_id"   TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "from_entry_id" TEXT NOT NULL REFERENCES "canon_entries"("id") ON DELETE CASCADE,
  "to_entry_id"   TEXT NOT NULL REFERENCES "canon_entries"("id") ON DELETE CASCADE,
  "created_at"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "canon_links_pair_idx"
  ON "canon_links" ("from_entry_id", "to_entry_id");
CREATE INDEX "canon_links_to_idx"       ON "canon_links" ("to_entry_id");
CREATE INDEX "canon_links_campaign_idx" ON "canon_links" ("campaign_id");

CREATE TABLE "canon_reveals" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "entry_id"   TEXT NOT NULL REFERENCES "canon_entries"("id") ON DELETE CASCADE,
  "user_id"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "canon_reveals_entry_user_idx"
  ON "canon_reveals" ("entry_id", "user_id");
CREATE INDEX "canon_reveals_user_idx" ON "canon_reveals" ("user_id");
