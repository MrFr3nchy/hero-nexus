-- A note passed under the table.
--
-- Not a reveal: a reveal is canon, goes on the timeline of what the party
-- knows, and can be widened to everybody. Not chat: the-same-room left chat
-- out and said why, and nothing here is a stream. A whisper is one line, from
-- one person at the table to one or more others, that the rest are not shown.
-- "I pocket the key." "Cover me." It lives in the evening and nowhere else.
--
-- A row rather than an event: a player who was not looking when it was said
-- still needs to find it.

CREATE TABLE IF NOT EXISTS "campaign_whispers" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "campaign_id"   TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "from_user_id"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "body"          TEXT NOT NULL,
  -- The sitting it was passed in, when one was live. The same nullable link
  -- campaign_checks carries: the record of which evening, not a gate.
  "session_id"    TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "created_at"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "campaign_whispers_campaign_idx"
  ON "campaign_whispers" ("campaign_id", "created_at");

-- Who it was said to.
--
-- Keyed on user_id, the same choice campaign_reveal_targets and
-- campaign_check_targets made and for the reason recorded there: the GM has
-- no member row, and a player who later leaves the table was still told.
-- Staff are never listed here and always read everything — a DM who cannot
-- see what the rogue told the wizard cannot run the table.
CREATE TABLE IF NOT EXISTS "campaign_whisper_targets" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "whisper_id"  TEXT NOT NULL REFERENCES "campaign_whispers"("id") ON DELETE CASCADE,
  "user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_whisper_targets_pair_idx"
  ON "campaign_whisper_targets" ("whisper_id", "user_id");
CREATE INDEX IF NOT EXISTS "campaign_whisper_targets_user_idx"
  ON "campaign_whisper_targets" ("user_id");
