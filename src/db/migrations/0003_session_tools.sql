-- 0003: live session tools — handouts + initiative tracker.
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "campaign_handouts" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "kind"        TEXT NOT NULL,                       -- 'image' | 'note'
  "title"       TEXT NOT NULL DEFAULT '',
  "body"        TEXT,                                -- note text
  "file_path"   TEXT,                                -- relative path under data/uploads
  "mime"        TEXT,
  "visibility"  TEXT NOT NULL DEFAULT 'dm',          -- 'dm' | 'shared'
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_handouts_campaign_idx"
  ON "campaign_handouts" ("campaign_id");

CREATE TABLE "initiative_encounters" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL DEFAULT 'Encounter',
  "is_active"   INTEGER NOT NULL DEFAULT 0,
  "round"       INTEGER NOT NULL DEFAULT 1,
  "turn_index"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "initiative_encounters_campaign_idx"
  ON "initiative_encounters" ("campaign_id");

CREATE TABLE "initiative_entries" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "encounter_id" TEXT NOT NULL REFERENCES "initiative_encounters"("id") ON DELETE CASCADE,
  "label"        TEXT NOT NULL,
  "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "initiative"   INTEGER NOT NULL DEFAULT 0,
  "hp_current"   INTEGER,
  "hp_max"       INTEGER,
  "conditions"   TEXT NOT NULL DEFAULT '',
  "sort"         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "initiative_entries_encounter_idx"
  ON "initiative_entries" ("encounter_id");
