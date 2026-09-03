# Restore runbook — database + uploads

A backup nobody has restored is not a backup. **Do the drill in the last
section before launch, and mark Branch 1 done only after it passes.**

Two things must be backed up, separately:

- **Database** — `hero-nexus.db`, streamed continuously by Litestream.
- **Uploads** — `uploads/` (handout images and campaign images — NPC
  portraits, item sketches, downtime letters), mirrored every 15 min by
  `deploy/backup-uploads.sh`. These are **not** in the database; Litestream does
  not see them. A DB-only restore leaves `campaign_handouts` rows pointing at
  missing files (the GET route returns 404 rather than crashing, but the image
  is gone).

## Setup

### Litestream (database)

```
# install litestream (see litestream.io/install)
sudo cp deploy/litestream.yml /etc/litestream.yml            # edit bucket/endpoint/region
sudo mkdir -p /etc/litestream
sudo tee /etc/litestream/litestream.env >/dev/null <<'EOF'
LITESTREAM_ACCESS_KEY_ID=...
LITESTREAM_SECRET_ACCESS_KEY=...
EOF
sudo chmod 600 /etc/litestream/litestream.env
sudo cp deploy/litestream.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now litestream
```

Confirm it is replicating:

```
litestream replicas -config /etc/litestream.yml
litestream snapshots /mnt/hero-nexus-data/hero-nexus.db   # should list a snapshot within a minute
```

### Uploads mirror

```
# install rclone, then configure a remote named "backup" (type s3, provider creds):
rclone config

sudo install -m 755 deploy/backup-uploads.sh /opt/hero-nexus/deploy/backup-uploads.sh
sudo cp deploy/backup-uploads.service deploy/backup-uploads.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup-uploads.timer

systemctl start backup-uploads.service        # run once now
rclone ls backup:hero-nexus-backups/uploads   # should list files
```

## Restore (rebuilding after losing the droplet)

1. **Provision** a new droplet and attach a volume at `/mnt/hero-nexus-data`.
   Do the one-time setup in `deploy.md` steps 1–6, but **do not start
   `hero-nexus` yet.**

2. **Stop the app** if it is somehow running: `sudo systemctl stop hero-nexus`.

3. **Restore the database** from the replica:

   ```
   sudo -u hero litestream restore -config /etc/litestream.yml \
     /mnt/hero-nexus-data/hero-nexus.db
   ```

   Restore a point in time instead with `-timestamp 2026-01-02T15:04:05Z`.

4. **Restore the uploads:**

   ```
   sudo -u hero rclone sync backup:hero-nexus-backups/uploads \
     /mnt/hero-nexus-data/uploads
   sudo chown -R hero:hero /mnt/hero-nexus-data
   ```

5. **Verify row counts** before exposing the app:

   ```
   sqlite3 /mnt/hero-nexus-data/hero-nexus.db \
     "SELECT
        (SELECT count(*) FROM user)            AS users,
        (SELECT count(*) FROM campaigns)       AS campaigns,
        (SELECT count(*) FROM characters)      AS characters,
        (SELECT count(*) FROM campaign_handouts) AS handouts,
        (SELECT name FROM _migrations ORDER BY id DESC LIMIT 1) AS last_migration;"
   ```

   Compare against what you expect. `last_migration` should match the deployed
   code's highest migration file.

6. **Check uploads line up with the database.** `campaign_handouts.file_path`
   already holds the `<campaignId>/<uuid>.<ext>` path, relative to the uploads
   dir:

   ```
   sqlite3 /mnt/hero-nexus-data/hero-nexus.db \
     "SELECT file_path FROM campaign_handouts WHERE kind = 'image' AND file_path IS NOT NULL;" \
   | while read -r rel; do
       test -f "/mnt/hero-nexus-data/uploads/$rel" || echo "MISSING: $rel"
     done
   ```

7. **Start** the app and restart replication:

   ```
   sudo systemctl start hero-nexus
   sudo systemctl restart litestream
   sudo systemctl start backup-uploads.service
   ```

8. **Smoke test:** sign in, open a campaign that has a handout image, confirm
   the image loads (not a 404).

## Restore drill (do this before launch)

Rehearse the whole thing against a throwaway droplet:

1. On the live droplet, note the row counts from step 5 above and pick a
   campaign that has at least one handout image.
2. Spin up a **scratch droplet**, install Litestream + rclone, point them at the
   **same bucket** with read-only credentials if possible.
3. Run the restore (steps 3–6) into `/tmp/restore-test/`.
4. Point a local `HERO_NEXUS_DB_PATH` / `HERO_NEXUS_UPLOADS_DIR` at the restored
   copies and run `npm run start`.
5. Confirm: row counts match, the chosen campaign loads, its handout image
   renders.
6. Destroy the scratch droplet.

Record the date of the last successful drill here:

- Last drill: _not yet run_

## Migration rehearsal

Before deploying any migration, run it against a copy of production — this is
the only rehearsal available, since there are no down migrations.

```
sudo systemctl stop hero-nexus          # or use a Litestream restore for a hot copy
cp /mnt/hero-nexus-data/hero-nexus.db /tmp/prod-copy.db
sudo systemctl start hero-nexus

HERO_NEXUS_DB_PATH=/tmp/prod-copy.db npm run db:migrate   # must exit 0, no errors
sqlite3 /tmp/prod-copy.db "SELECT name FROM _migrations ORDER BY id DESC LIMIT 3;"
```
