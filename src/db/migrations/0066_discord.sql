-- Discord notifications.
--
-- A DM pastes a Discord channel webhook into the campaign, and the channel
-- gets a short post for table-level moments: a session scheduled or moved,
-- the session starting, a recap shared, a date poll opened or settled, a
-- level earned, and a reminder a day ahead.
--
--   campaign_discord              — the webhook, which triggers are on, and the
--                                   last failure. Its own table, never
--                                   `campaigns.settings`: settings reach every
--                                   member and travel in campaign packages, and
--                                   a webhook URL is a write credential for
--                                   somebody's Discord channel. Staff-only, and
--                                   never carried.
--   campaign_members.discord_user_id — a member's own Discord id, so a post
--                                   can mention them. Optional.
--   campaign_sessions.reminded_at — when the day-ahead reminder went out, so a
--                                   restart or a deploy never sends it twice.
--                                   Cleared when the date moves.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "campaign_discord" (
  "campaign_id" TEXT PRIMARY KEY NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "webhook_url" TEXT NOT NULL,
  "events" TEXT NOT NULL DEFAULT '{}',
  "last_error" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE "campaign_members" ADD COLUMN "discord_user_id" TEXT;
ALTER TABLE "campaign_sessions" ADD COLUMN "reminded_at" TEXT;
