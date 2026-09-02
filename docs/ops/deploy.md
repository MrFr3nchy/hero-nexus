# Deploy runbook — single DigitalOcean droplet

Target: one droplet, SQLite on a mounted volume, Caddy for TLS, systemd for
process supervision. See `security-decisions.md` for why it's shaped this way.

## Layout

| Thing                 | Path                                                      |
| --------------------- | --------------------------------------------------------- |
| App bundle            | `/opt/hero-nexus` (this repo)                             |
| Data volume (mounted) | `/mnt/hero-nexus-data`                                    |
| Database              | `/mnt/hero-nexus-data/hero-nexus.db`                      |
| Uploads               | `/mnt/hero-nexus-data/uploads`                            |
| Env file              | `/opt/hero-nexus/.env.local` (chmod 600, owned by `hero`) |

## One-time setup

1. **Volume.** Create and mount a volume at `/mnt/hero-nexus-data`. Create
   `uploads/` inside it. `chown -R hero:hero /mnt/hero-nexus-data`.

2. **User.** `adduser --system --group hero`.

3. **Node.** Install Node 20+ (matches `package.json` engines / CI).

4. **Env.** Copy `.env.example` to `/opt/hero-nexus/.env.local` and fill in:
   - `AUTH_SECRET` — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `AUTH_TRUST_HOST=true`
   - `APP_URL=https://your-domain` — no trailing slash, this is what email links use
   - `RESEND_API_KEY`, `MAIL_FROM` — see below
   - `REGISTRATION_INVITE_CODES=code1,code2` — launch is invite-only
   - `HERO_NEXUS_DB_PATH=/mnt/hero-nexus-data/hero-nexus.db`
   - `HERO_NEXUS_UPLOADS_DIR=/mnt/hero-nexus-data/uploads` (read by the app's
     handout routes and by `deploy/backup-uploads.sh`)

5. **Mail domain.** In the Resend dashboard, add the sending domain and publish
   the SPF and DKIM DNS records it gives you. Do not send before those verify —
   a fresh droplet IP has no reputation and unauthenticated mail is dropped.
   Confirm `MAIL_FROM` is on the verified domain.

6. **DNS.** Point the app domain's A record at the droplet. Wait for it to
   resolve before starting Caddy (it needs the domain reachable to issue a
   certificate).

7. **systemd — app.**

   ```
   sudo cp deploy/hero-nexus.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now hero-nexus
   journalctl -u hero-nexus -f      # watch migrations run on first boot
   ```

8. **Caddy.** Install Caddy, then:

   ```
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domain first
   sudo mkdir -p /var/log/caddy
   sudo systemctl reload caddy
   ```

9. **Backups.** Follow `restore.md` § Setup for Litestream and the uploads
   mirror. **Then do the restore drill in that doc before launch.**

10. **Disk alerting.** SQLite + uploads + logs share one volume; a full disk is
    a total outage. Enable the DigitalOcean disk-usage alert on the droplet and
    the volume at 80%. Send Caddy and journald logs somewhere with rotation
    (`journalctl` is capped by `SystemMaxUse`; set it in
    `/etc/systemd/journald.conf`).

## Deploying a new version

```
cd /opt/hero-nexus
sudo -u hero git fetch origin
sudo -u hero git checkout <tag-or-main>
sudo -u hero npm ci
sudo -u hero npm run build
sudo systemctl restart hero-nexus
journalctl -u hero-nexus -n 50    # confirm migrations applied, server listening
```

Migrations run automatically on restart (`src/instrumentation.ts`) and **throw
on failure**, which stops the process. `hero-nexus.service` caps restarts at 3
in 5 minutes, so a bad migration ends in `failed` state (visible in
`systemctl status`) rather than a silent crash-loop.

## Rollback

There are **no down migrations** (by design — see `src/db/README.md`). Rolling
back the code is safe only if the newer version added no migration, or its
migration is backward-compatible with the old code.

1. **Code only** (no new migration since the last good version):

   ```
   sudo -u hero git checkout <previous-tag>
   sudo -u hero npm ci && sudo -u hero npm run build
   sudo systemctl restart hero-nexus
   ```

2. **A migration was applied and the old code can't run against the new
   schema:** code rollback alone won't work. Restore the database from the
   Litestream replica to a point just before the deploy (`restore.md`), then
   check out the previous code. This loses writes made after that point —
   acceptable only immediately after a bad deploy.

Always rehearse a migration against a copy of the production DB before deploying
it (`restore.md` § Migration rehearsal).
