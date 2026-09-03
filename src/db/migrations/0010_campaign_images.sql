-- 0010: campaign images — portraits and sketches attached to campaign things.
--
-- The bytes live on disk under UPLOADS_DIR, beside the handouts; the row is a
-- reference plus its metadata. A portrait is read every time its entry is
-- listed, and base64 in the row would drag that weight through every query
-- and every backup — and the uploads directory already has a backup path
-- (deploy/backup-uploads.sh).
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_images" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "file_path"   TEXT NOT NULL,                       -- under UPLOADS_DIR
  "mime"        TEXT NOT NULL,
  "bytes"       INTEGER NOT NULL DEFAULT 0,
  "alt"         TEXT NOT NULL DEFAULT '',
  "uploaded_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_images_campaign_idx" ON "campaign_images" ("campaign_id");
