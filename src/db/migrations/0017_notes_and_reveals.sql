-- 0017: the DM's notebook, and a reveal as a thing that happened.
--
--   campaign_notes         — loose prep. Until now every note in this app was
--                            attached to something: a session, a quest, a canon
--                            entry. A DM's actual prep is not shaped like that
--                            ("the guild wants the bridge closed; if they go
--                            north instead, the reeve is already dead"), and it
--                            had exactly one home — campaigns.settings
--                            .session_notes, a single textarea. This is a real
--                            page with a title, tags and its own visibility.
--
--   campaign_reveals       — one thing the party was told, when, and by whom.
--   campaign_reveal_targets— and, when it went to named people, which ones.
--
-- The reveal row stores the excerpt **as text**, copied at the moment it was
-- revealed. Not offsets into the note it came from: the DM edits that note the
-- following week and the offsets then point at different words, which would
-- quietly rewrite what the party was told. A reveal is a record of a past
-- event, so it holds its own copy and stops changing. `source_id` survives as
-- a back-reference for "where did this come from", and is allowed to dangle —
-- the note may be deleted and the reveal still happened.
--
-- This is the one place in the schema where copying text is correct, and it is
-- the opposite case to the content model's rule 1: there, a copy forks a live
-- thing that should stay in sync; here, a copy freezes a dead one that must
-- not.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_notes" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL DEFAULT '',
  "body"        TEXT NOT NULL DEFAULT '',
  -- Comma-separated, lower-cased. A tag list is read whole every time and
  -- never joined against, so a table for it would buy nothing.
  "tags"        TEXT NOT NULL DEFAULT '',
  "pinned"      INTEGER NOT NULL DEFAULT 0,
  -- The sitting this page is prep for. Null is a standing note.
  "session_id"  TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  -- 'dm' never leaves staff; 'shared' is a page the whole table can read.
  "visibility"  TEXT NOT NULL DEFAULT 'dm'
                CHECK ("visibility" IN ('dm', 'shared')),
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_notes_campaign_idx" ON "campaign_notes" ("campaign_id");

CREATE TABLE "campaign_reveals" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  -- Where the words came from, for the DM's own back-reference. No foreign
  -- key: the source may be deleted and the reveal still happened.
  "source_kind" TEXT NOT NULL DEFAULT 'note'
                CHECK ("source_kind" IN ('note', 'session', 'quest', 'canon', 'free')),
  "source_id"   TEXT,
  -- The excerpt, frozen. See the note above.
  "body"        TEXT NOT NULL DEFAULT '',
  "revealed_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "session_id"  TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  -- 'party' reaches everyone at the table; 'selected' reaches only the users
  -- in campaign_reveal_targets, which is how a DM tells one player something.
  "visibility"  TEXT NOT NULL DEFAULT 'party'
                CHECK ("visibility" IN ('party', 'selected')),
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Read path: the party's knowledge in the order they learned it.
CREATE INDEX "campaign_reveals_campaign_idx"
  ON "campaign_reveals" ("campaign_id", "created_at");

CREATE TABLE "campaign_reveal_targets" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "reveal_id"  TEXT NOT NULL REFERENCES "campaign_reveals"("id") ON DELETE CASCADE,
  "user_id"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "campaign_reveal_targets_pair_idx"
  ON "campaign_reveal_targets" ("reveal_id", "user_id");
CREATE INDEX "campaign_reveal_targets_user_idx"
  ON "campaign_reveal_targets" ("user_id");
