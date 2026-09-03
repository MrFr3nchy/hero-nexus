-- 0009: DM annotations on a player's sheet, and the per-player secret log.
--   sheet_notes        — a DM comment pinned to one sheet section. Per-comment
--                        visibility: 'shared' reaches the player's own sheet,
--                        'dm' never leaves staff.
--   character_secrets  — what one player knows and the table does not. Written
--                        by either side; visibility widens dm → player → party
--                        so the DM can reveal a secret to everyone later.
--
-- A DM-authored secret is hidden, never deleted; author_role records who wrote
-- it so that rule holds even after the author's account is gone.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "sheet_notes" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "campaign_id"    TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "character_id"   TEXT NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "section"        TEXT NOT NULL,                    -- identity | combat | abilities | ...
  "body"           TEXT NOT NULL DEFAULT '',
  "author_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "visibility"     TEXT NOT NULL DEFAULT 'shared',   -- shared | dm
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "sheet_notes_character_idx" ON "sheet_notes" ("character_id");
CREATE INDEX "sheet_notes_campaign_idx"  ON "sheet_notes" ("campaign_id");

CREATE TABLE "character_secrets" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "campaign_id"    TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "character_id"   TEXT NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "author_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "author_role"    TEXT NOT NULL DEFAULT 'player',   -- gm | player
  "body"           TEXT NOT NULL DEFAULT '',
  "visibility"     TEXT NOT NULL DEFAULT 'player',   -- dm | player | party
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "character_secrets_character_idx" ON "character_secrets" ("character_id");
CREATE INDEX "character_secrets_campaign_idx"  ON "character_secrets" ("campaign_id");
