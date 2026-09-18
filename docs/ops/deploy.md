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

The Next server listens on **127.0.0.1:3000 only** (`deploy/hero-nexus.service`
passes `--hostname 127.0.0.1`; `next start` ignores a `HOSTNAME=` env var and
defaults to `0.0.0.0`). Caddy is the only thing that reaches it. This is not
cosmetic: the app trusts `X-Forwarded-For` for rate-limit keys because Caddy
overwrites it, and a client that could reach :3000 directly could spoof it.

## Before you start

- **A domain**, with its A record pointed at the droplet. Caddy needs it to
  resolve before it can issue a certificate.
- **Resend**, with the sending domain added and its SPF + DKIM records
  published and verified. Email is load-bearing: an account cannot sign in
  until its verification link is clicked, and production refuses every other
  transport (`src/server/mail.ts`). No verified sending domain means nobody —
  including you — can log in. Do this before the bootstrap, not after.
- **Droplet size**: `next build` needs about 2 GB of memory. The bootstrap
  adds a 2 GB swapfile if there is no swap, which gets a 1 GB droplet through
  a build, slowly. 2 GB is the comfortable minimum.
- **A volume** attached and mounted at `/mnt/hero-nexus-data`, so the database
  and uploads outlive the droplet. The bootstrap warns and continues on the
  root disk if it is missing.

## One-time setup

`deploy/bootstrap.sh` does all of this on a fresh Ubuntu 24.04 droplet:

```
ssh root@<droplet-ip>
curl -fsSLo bootstrap.sh https://raw.githubusercontent.com/<you>/hero-nexus/main/deploy/bootstrap.sh
DOMAIN=play.example.com \
REPO_URL=https://github.com/<you>/hero-nexus.git \
RESEND_API_KEY=re_... \
MAIL_FROM='Hero Nexus <no-reply@example.com>' \
bash bootstrap.sh
```

It refuses to run without the mail settings, for the reason above. What it
does, step by step, so you can do or redo any part by hand:

1. **Packages.** `git curl build-essential python3 sqlite3 ufw`. The build
   tools are only a fallback — `better-sqlite3` and `@node-rs/argon2` ship
   prebuilt binaries for Node 20/22/24 on x64 glibc.

2. **Node 22** from NodeSource (`package.json` `engines` says `>=20`; Ubuntu's
   own `nodejs` package is too old). **Caddy** from its apt repo.

3. **User.** `adduser --system --group hero`. **Data.**
   `mkdir -p /mnt/hero-nexus-data/uploads && chown -R hero:hero /mnt/hero-nexus-data`.

4. **Checkout** to `/opt/hero-nexus`, owned by `hero`.

5. **Env.** Writes `/opt/hero-nexus/.env.local` (chmod 600) with a generated
   `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `APP_URL=https://<domain>`, the mail
   settings, `HERO_NEXUS_DB_PATH` and `HERO_NEXUS_UPLOADS_DIR` on the volume.
   Left alone if it already exists. `.env.example` explains each line.

6. **Build and seed.** `npm ci`, `npm run build`, then `npm run db:migrate`
   and `npm run db:seed`. The seed fetches the SRD from api.open5e.com into
   `reference_data` — it is the only outbound call the app ever makes, takes a
   few minutes, and without it the compendium, the character creator's class
   and species lists and the bestiary are empty. Migrations also run at every
   boot; the seed does not.

7. **systemd.** Installs `deploy/hero-nexus.service`, enables and starts it.

8. **Caddy.** Installs `deploy/Caddyfile` with the domain substituted,
   validates it, reloads. The certificate is fetched on the first request.

9. **ufw** allowing 22, 80 and 443 only, and a 500 MB cap on journald so logs
   cannot fill the disk the database is on.

10. Confirms the app answers on `127.0.0.1:3000` and prints what is left.

Then, by hand:

- **Backups.** Follow `restore.md` § Setup for Litestream and the uploads
  mirror. **Then do the restore drill in that doc before launch.**
- **DigitalOcean.** A cloud firewall allowing only 22/80/443 inbound (the app
  binds loopback and ufw blocks 3000; this is the third layer). Disk-usage
  alerts at 80% on the droplet and the volume — SQLite, uploads and logs
  share a disk, and uploads include ambient-sound tracks (`campaign_audio`, up
  to 20 MB each), which grow faster than pictures.
- **Prove mail works.** Register an account on the live site and click the
  link in the message. If it never arrives, check the Resend dashboard for the
  domain's verification status before anything else.

## Deploying a new version

```
sudo /opt/hero-nexus/deploy/release.sh            # origin/main
sudo /opt/hero-nexus/deploy/release.sh v0.4.0     # a tag
```

Which is: fetch, check out, `npm ci`, `npm run build`, restart the service,
wait for `127.0.0.1:3000` to answer, print the last 20 log lines. It names any
migration files the release adds before building, because that changes what a
rollback means (below).

Migrations run automatically on restart (`src/instrumentation.ts`) and **throw
on failure**, which stops the process. `hero-nexus.service` caps restarts at 3
in 5 minutes, so a bad migration ends in `failed` state (visible in
`systemctl status`) rather than a silent crash-loop — and `release.sh` exits
non-zero with the last 100 log lines.

To re-sync the SRD after an upstream change:

```
cd /opt/hero-nexus
sudo -u hero -H bash -c 'set -a; . ./.env.local; set +a; npm run db:sync'
```

## Rollback

There are **no down migrations** (by design — see `src/db/README.md`). Rolling
back the code is safe only if the newer version added no migration, or its
migration is backward-compatible with the old code.

1. **Code only** (no new migration since the last good version):

   ```
   sudo /opt/hero-nexus/deploy/release.sh <previous-tag>
   ```

2. **A migration was applied and the old code can't run against the new
   schema:** code rollback alone won't work. Restore the database from the
   Litestream replica to a point just before the deploy (`restore.md`), then
   release the previous tag. This loses writes made after that point —
   acceptable only immediately after a bad deploy.

Always rehearse a migration against a copy of the production DB before deploying
it (`restore.md` § Migration rehearsal).
