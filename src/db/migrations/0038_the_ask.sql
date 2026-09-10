-- The DM asking somebody for a roll.
--
-- Not a reveal and not a handout: those are statements, and nothing in this
-- schema has ever asked a question or held an answer. It is a row rather than
-- an event because of the line `the-long-campaign` phase 9 drew when it
-- refused a notices table — something becomes a row when a player who was
-- offline still needs to find it, and "the DM wants a Stealth check from you"
-- is exactly that. "Kessa rolled an 18" is not, and stays a moment on the wire.

CREATE TABLE IF NOT EXISTS "campaign_checks" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "campaign_id"    TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  -- check | save | free.  No 'attack': an attack bonus depends on the weapon in
  -- hand, and a kind the server cannot compute the modifier for would be a
  -- prompt pretending to be a roll.
  "kind"           TEXT NOT NULL DEFAULT 'check',
  -- One of these, or neither for a free ask. SkillKey / AbilityKey from
  -- character/schema.ts — the vocabulary already exists and is already typed.
  "skill"          TEXT,
  "ability"        TEXT,
  -- What the DM typed. Always shown; it is how "roll me a Stealth check"
  -- becomes "roll me a Stealth check, quietly, past the dogs".
  "prompt"         TEXT NOT NULL DEFAULT '',
  "dc"             INTEGER,
  -- hidden | shown. A hidden DC never travels to the target, in any field, on
  -- any surface: they see their total and the DM sees the verdict, which is
  -- the entire point of hiding one.
  "dc_visibility"  TEXT NOT NULL DEFAULT 'shown',
  -- open | answered | cancelled
  "status"         TEXT NOT NULL DEFAULT 'open',
  "asked_by"       TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "session_id"     TEXT REFERENCES "campaign_sessions"("id") ON DELETE SET NULL,
  "created_at"     TEXT NOT NULL DEFAULT (datetime('now')),
  "resolved_at"    TEXT
);

CREATE INDEX IF NOT EXISTS "campaign_checks_campaign_idx"
  ON "campaign_checks" ("campaign_id", "created_at");

-- Who was asked.
--
-- Keyed on user_id rather than on a member row, the same choice
-- campaign_reveal_targets and campaign_session_attendance made and for the
-- reason recorded there: the GM has no member row, and a player who later
-- leaves the table was still asked.
CREATE TABLE IF NOT EXISTS "campaign_check_targets" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "check_id"     TEXT NOT NULL REFERENCES "campaign_checks"("id") ON DELETE CASCADE,
  "user_id"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  -- The character they rolled as, resolved when the ask was made so the sheet
  -- the modifier came from is the one they were sitting behind at the time.
  "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  -- waiting | rolled | dismissed
  "status"       TEXT NOT NULL DEFAULT 'waiting',
  "roll_id"      TEXT REFERENCES "campaign_rolls"("id") ON DELETE SET NULL,
  -- Denormalised on purpose, and the one field here that is a copy.
  -- `clearRolls` deletes the whole log for a campaign, and an answered check
  -- that forgets what was rolled because the DM tidied up is worse than a
  -- duplicated integer. Same reasoning as `publications.payload` being the
  -- fallback for a withdrawn listing.
  "total"        INTEGER,
  "modifier"     INTEGER,
  "answered_at"  TEXT,
  "created_at"   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_check_targets_pair_idx"
  ON "campaign_check_targets" ("check_id", "user_id");
CREATE INDEX IF NOT EXISTS "campaign_check_targets_user_idx"
  ON "campaign_check_targets" ("user_id", "status");
