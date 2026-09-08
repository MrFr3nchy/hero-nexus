-- 0021: whether people are coming, asked before the night rather than after.
--
-- `campaign_session_attendance` already answers "who was at session 9?" — a
-- record written afterwards, by the DM. It could not answer "is anyone coming
-- on Thursday?", which is the question that actually decides whether a session
-- happens, and the one a table currently settles in a group chat the app knows
-- nothing about.
--
-- Two columns on the same row rather than a second table, because they are two
-- facts about the same person and the same sitting, and keeping them together
-- is what makes the useful comparison possible: who said yes and did not come.
-- A separate table would need the same key and the same joins to say it.
--
--   rsvp     — what they said. 'unknown' is the honest default: silence is not
--              a no, and a DM chasing four maybes needs to see which of them
--              never answered at all.
--   rsvp_at  — when they said it, so "they said yes a month ago" reads
--              differently from "they said yes this morning".
--
-- `status` keeps its own default of 'present'. It is written when the DM marks
-- the register, and an RSVP row created before the night must not quietly
-- assert that somebody turned up — so the read path only reports attendance
-- for sittings that have actually been played.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "campaign_session_attendance"
  ADD COLUMN "rsvp" TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE "campaign_session_attendance"
  ADD COLUMN "rsvp_at" TEXT;
