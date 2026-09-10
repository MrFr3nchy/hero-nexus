-- 0036: an hourglass on the table.
--
-- A DM needs to be able to say "you have one minute" and have everybody see
-- the same minute. The case that raised it was death — revivify has to be cast
-- within a minute of dying — but a timer that only knows about death would be
-- the wrong shape. The ritual completes, the bridge collapses, the guard comes
-- back round: the countdown is general and merely *defaults* to a minute when
-- it is opened from a death.
--
-- Not an extension of `campaign_clocks`. A progress clock fills because the
-- fiction says so and this fills because time passed. One table would mean one
-- of them lying about what its segments mean.
--
-- `ends_at` is an instant rather than a remaining-seconds count, so the
-- browser can count down from it and a slow response cannot make the clock
-- wrong.
--
-- `stopped_at` marks a countdown the DM called off. The row stays, because a
-- timer that was called off is a thing that happened.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_timers" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL
    REFERENCES "campaigns" ("id") ON DELETE CASCADE,
  "label"       TEXT NOT NULL DEFAULT '',
  "ends_at"     TEXT NOT NULL,
  "started_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "visibility"  TEXT NOT NULL DEFAULT 'shared',
  "stopped_at"  TEXT,
  "created_by"  TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX "campaign_timers_campaign_idx"
  ON "campaign_timers" ("campaign_id");
