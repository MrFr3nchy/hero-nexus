-- The world's clock (improvements 10).
--
-- The calendar itself lives in `campaigns.settings` (JSON, no column) the way
-- the table rules do; what this adds is *where the clock stands*. NULL is a
-- table that has not started counting — the screen says nothing rather than
-- inventing a date. A sitting, a canon entry, a journal page and a downtime
-- window each get an optional stamp on that clock beside their real-world
-- date, so the chronicle can say both "Fri, Sep 11" and "3rd of Mirtul".
-- `server/world-time.ts` is the only writer of `world_time`.

ALTER TABLE "campaigns" ADD COLUMN "world_time" TEXT;
ALTER TABLE "campaign_sessions" ADD COLUMN "world_date" TEXT;
ALTER TABLE "canon_entries" ADD COLUMN "world_date" TEXT;
ALTER TABLE "player_journals" ADD COLUMN "world_date" TEXT;
ALTER TABLE "downtime_periods" ADD COLUMN "world_from" TEXT;
ALTER TABLE "downtime_periods" ADD COLUMN "world_to" TEXT;
