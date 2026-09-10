-- A sitting you can be in.
--
-- `campaign_sessions.status` has been planned | played | cancelled since 0013:
-- a calendar, with no "now". Without one the app cannot tell an announcement
-- worth interrupting somebody for from one that is not, cannot offer a way
-- into the room, and leaves the DM stamping `played_on` by hand afterwards.
--
-- 'live' is a fourth status rather than a derived reading of `started_at`,
-- because two columns encoding one fact is the drift this schema keeps warning
-- about. `started_at` is kept alongside it as the record of when the evening
-- began, the same shape `campaign_timers` uses for `started_at`/`stopped_at`.
--
-- No CHECK constraint here: 0013 did not put one on `status` either, and
-- adding one now would mean rebuilding the table for a value the Drizzle enum
-- in `schema.ts` already guards at every write.

ALTER TABLE "campaign_sessions" ADD COLUMN "started_at" TEXT;

-- At most one sitting per campaign may be live. A partial unique index says so
-- in the place that can actually enforce it, rather than in a comment above a
-- read-then-write that two DMs pressing at once would race through.
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_sessions_one_live_idx"
  ON "campaign_sessions" ("campaign_id")
  WHERE "status" = 'live';
