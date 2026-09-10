-- A handout the DM pushes to particular people.
--
-- `campaign_reveals` has been able to address selected players since 0017, and
-- handouts never could: `visibility` was 'dm' | 'shared' with no target table,
-- so a clue meant for the one character who reads Infernal had to be shown to
-- everybody or to nobody.
--
-- That is the whole of what the brief's "puzzles" needed. A puzzle is a
-- handout, a check and a timer; the app has had two of the three, and this is
-- the missing shape rather than a new feature.
--
-- No ALTER on `campaign_handouts.visibility`: 0013 created it as a plain TEXT
-- column with no CHECK constraint, so widening the vocabulary to add
-- 'selected' is a change to the Drizzle enum in `schema.ts` and nothing else.
-- Rebuilding the table to add a constraint SQLite never had would be a lot of
-- risk for no enforcement that `schema.ts` is not already providing.
--
-- Deliberately the same shape as campaign_reveal_targets, down to keying on
-- user_id: the GM has no member row, and a player who later leaves the table
-- was still shown the thing.

CREATE TABLE IF NOT EXISTS "campaign_handout_targets" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "handout_id" TEXT NOT NULL REFERENCES "campaign_handouts"("id") ON DELETE CASCADE,
  "user_id"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_handout_targets_pair_idx"
  ON "campaign_handout_targets" ("handout_id", "user_id");
CREATE INDEX IF NOT EXISTS "campaign_handout_targets_user_idx"
  ON "campaign_handout_targets" ("user_id");
