-- 0004: custom / homebrew character content.
--   * characters.has_homebrew — denormalized flag for lists & DM triage.
--   * character_homebrew       — links a character to the homebrew rows it spawned.
--   * character_audit_log      — every custom value, manual stat, and dice roll the
--                                player made; handed to the DM when the character
--                                joins a campaign.
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "characters" ADD COLUMN "has_homebrew" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "character_homebrew" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "character_id" TEXT NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "homebrew_id"  TEXT NOT NULL REFERENCES "homebrew"("id") ON DELETE CASCADE,
  "entry_id"     TEXT NOT NULL,                       -- client-stable id of the sheet homebrew entry
  "created_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "character_homebrew_char_entry_idx"
  ON "character_homebrew" ("character_id", "entry_id");
CREATE INDEX "character_homebrew_homebrew_idx"
  ON "character_homebrew" ("homebrew_id");

CREATE TABLE "character_audit_log" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "character_id" TEXT NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "entry_id"     TEXT NOT NULL,                       -- client-stable id, dedupes re-saves
  "kind"         TEXT NOT NULL,                       -- field | stat-manual | stat-roll | stat-pointbuy | stat-standard | method | homebrew
  "label"        TEXT NOT NULL DEFAULT '',
  "detail"       TEXT NOT NULL DEFAULT '',
  "rolls"        TEXT,                                -- JSON array of raw dice, when kind = stat-roll
  "occurred_at"  TEXT NOT NULL,
  "created_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "character_audit_log_char_entry_idx"
  ON "character_audit_log" ("character_id", "entry_id");
CREATE INDEX "character_audit_log_char_idx"
  ON "character_audit_log" ("character_id");
