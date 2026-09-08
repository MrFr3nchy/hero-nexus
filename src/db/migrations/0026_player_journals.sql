-- 0026: the players' own notebook.
--
--   player_journals — a page a player writes about this campaign.
--
-- Every note surface in this app so far belongs to the DM. `sheet_notes` are
-- the DM's comments on a player's sheet; `character_secrets` are written by
-- either side but hang off one character; the canon and the chronicle are
-- staff-authored. A player who wants to write down what they think the reeve
-- is up to has had nowhere in the app to do it, and has done it in a text file.
--
-- Three audiences rather than the usual two, because a player has one the DM
-- does not:
--
--   'private' — the author alone. **The DM cannot read these.** That is the
--               point of the feature and the one rule in this file that must
--               never be softened for convenience: a notebook a DM can read is
--               not a notebook, and a player who suspects it is will keep
--               using the text file.
--   'dm'      — the author and staff. For a question, or a plan you want the
--               DM to have seen before the night.
--   'party'   — everyone at the table.
--
-- Deliberately campaign-scoped rather than character-scoped: a player's
-- thinking outlives the character who died in session six, and "which of my
-- three characters was I playing when I wrote this" is not a question anyone
-- wants to answer to read their own notes.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "player_journals" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  -- The author. Not nullable and not SET NULL: an orphan journal page is
  -- nobody's, and there is no correct reader for it.
  "user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL DEFAULT '',
  "body"        TEXT NOT NULL DEFAULT '',
  "visibility"  TEXT NOT NULL DEFAULT 'private'
                CHECK ("visibility" IN ('private', 'dm', 'party')),
  -- The sitting it is about. Null is a standing page.
  "session_id"  TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "player_journals_campaign_idx"
  ON "player_journals" ("campaign_id");
-- Read path: "my pages at this table", every time the tab opens.
CREATE INDEX "player_journals_author_idx"
  ON "player_journals" ("campaign_id", "user_id");
