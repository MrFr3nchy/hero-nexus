-- Ambient sound (improvements 12).
--
-- A DM uploads tracks the way they upload images and plays one for the
-- table; players hear it only if they opt in, on their own device. The file
-- is the campaign's — served behind `requireCampaignRole`, never fetched
-- from anywhere else. `campaigns.ambience` is what is playing now: JSON
-- `{ audioId, startedAt, loop, volume }` or NULL, so a late joiner can seek
-- to where everybody else is. A board may name a track to start when it is
-- lit. A soundtrack is never carried in a campaign package.

CREATE TABLE "campaign_audio" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL DEFAULT '',
  "file_path" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "duration_seconds" INTEGER,
  "uploaded_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX "campaign_audio_campaign_idx" ON "campaign_audio" ("campaign_id");

ALTER TABLE "campaigns" ADD COLUMN "ambience" TEXT;
ALTER TABLE "battle_maps" ADD COLUMN "audio_id" TEXT REFERENCES "campaign_audio"("id") ON DELETE SET NULL;
