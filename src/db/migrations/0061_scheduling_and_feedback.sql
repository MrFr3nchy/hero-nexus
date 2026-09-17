-- Scheduling and session feedback.
--
-- Until now a sitting's date was one field the DM filled in. Three tables
-- make it a conversation instead, and none of them replaces that field:
--
-- `campaign_availability` is a player's standing answer, per calendar day,
-- to "could you play?" — free, maybe, or busy, with an optional note for the
-- hours ("after 7"). A day with no row is unknown, which is the honest
-- default. One row per person per day per campaign.
--
-- `session_polls` puts a handful of candidate dates in front of the table
-- for one planned sitting. Options carry a day and an optional time of day;
-- the time is deliberately not folded into `campaign_sessions.scheduled_for`,
-- which stays a bare calendar date the way every reader of it expects.
-- Settling the poll copies the winning day onto the sitting and remembers
-- which option won. At most one open poll per sitting.
--
-- `session_feedback_forms` is the DM's questionnaire for a played sitting,
-- one per session, with the questions as JSON so a form can be reshaped
-- without a migration. `session_feedback_responses` holds each player's
-- answers, one row per person, readable by staff and by its author only.

CREATE TABLE "campaign_availability" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  -- Bare calendar day, YYYY-MM-DD.
  "day" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('yes', 'maybe', 'no')),
  "note" TEXT NOT NULL DEFAULT '',
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX "campaign_availability_user_day_idx"
  ON "campaign_availability" ("campaign_id", "user_id", "day");
CREATE INDEX "campaign_availability_campaign_day_idx"
  ON "campaign_availability" ("campaign_id", "day");

CREATE TABLE "session_polls" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "session_id" TEXT NOT NULL REFERENCES "campaign_sessions"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'settled', 'withdrawn')),
  "chosen_option_id" TEXT,
  "created_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "closed_at" TEXT
);

CREATE INDEX "session_polls_session_idx" ON "session_polls" ("session_id");
CREATE UNIQUE INDEX "session_polls_one_open_idx"
  ON "session_polls" ("session_id")
  WHERE "status" = 'open';

CREATE TABLE "session_poll_options" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "poll_id" TEXT NOT NULL REFERENCES "session_polls"("id") ON DELETE CASCADE,
  -- Bare calendar day, YYYY-MM-DD.
  "day" TEXT NOT NULL,
  -- HH:MM, or empty for "sometime that day".
  "time" TEXT NOT NULL DEFAULT '',
  "sort" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "session_poll_options_poll_idx" ON "session_poll_options" ("poll_id");

CREATE TABLE "session_poll_votes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "option_id" TEXT NOT NULL REFERENCES "session_poll_options"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "vote" TEXT NOT NULL CHECK ("vote" IN ('yes', 'maybe', 'no')),
  "voted_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX "session_poll_votes_option_user_idx"
  ON "session_poll_votes" ("option_id", "user_id");

CREATE TABLE "session_feedback_forms" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "session_id" TEXT NOT NULL UNIQUE REFERENCES "campaign_sessions"("id") ON DELETE CASCADE,
  -- JSON [{ id, prompt, kind: 'text' | 'scale' | 'choice', options?: string[] }]
  "questions" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'closed')),
  "created_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX "session_feedback_forms_campaign_idx" ON "session_feedback_forms" ("campaign_id");

CREATE TABLE "session_feedback_responses" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "form_id" TEXT NOT NULL REFERENCES "session_feedback_forms"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  -- JSON { [questionId]: string | number }
  "answers" TEXT NOT NULL DEFAULT '{}',
  "submitted_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX "session_feedback_responses_form_user_idx"
  ON "session_feedback_responses" ("form_id", "user_id");
