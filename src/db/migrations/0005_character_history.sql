-- 0005: append-only character history.
--   character_history — the server's own record of how a character changed after
--                       creation. Written by diffing the incoming sheet against
--                       the stored one in updateCharacter; never accepted from
--                       the client.
--
-- This is NOT character_audit_log / sheet.provenance. Those stay as they are:
-- a client-supplied mirror of creation-time method & roll data that a diff
-- cannot reconstruct. This table is additive and deliberately has no unique
-- index — a field that changes four times is four rows.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "character_history" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "character_id"  TEXT NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "actor_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "kind"          TEXT NOT NULL,               -- identity | level | ability | method | homebrew | other
  "field"         TEXT NOT NULL DEFAULT '',    -- dot-path of the changed field
  "from_value"    TEXT,                        -- prior value, stringified; null when first seen
  "to_value"      TEXT,                        -- new value, stringified
  "detail"        TEXT NOT NULL DEFAULT '',    -- human-readable summary
  "rolls"         TEXT,                        -- reserved: JSON array of raw dice
  "occurred_at"   TEXT NOT NULL,               -- server clock at save time
  "created_at"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX "character_history_char_idx"
  ON "character_history" ("character_id");
CREATE INDEX "character_history_char_time_idx"
  ON "character_history" ("character_id", "occurred_at");
