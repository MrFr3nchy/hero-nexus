#!/usr/bin/env bash
#
# Mirror handout uploads to the backup bucket. These files live on the data
# volume, not in the database, so Litestream never sees them. A DB-only restore
# leaves campaign_handouts rows pointing at files that aren't there.
#
# Runs from deploy/backup-uploads.timer (every 15 min). Needs `rclone`
# configured with a remote named `backup` pointing at the same bucket:
#   rclone config   # create remote "backup" (type s3, your provider creds)
#
# `sync` deletes remote files whose local copy is gone. That's intended: a
# handout deleted in the app should not linger in the backup forever. The
# database is the source of truth for what *should* exist.

set -euo pipefail

SRC="${HERO_NEXUS_UPLOADS_DIR:-/mnt/hero-nexus-data/uploads}"
DEST="backup:hero-nexus-backups/uploads"

exec rclone sync "$SRC" "$DEST" \
	--fast-list \
	--transfers 8 \
	--log-level INFO
