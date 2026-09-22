# Deploy runbook — single DigitalOcean droplet

Target: one droplet, SQLite on a mounted volume, Caddy for TLS, systemd for
process supervision. See `security-decisions.md` for why it's shaped this way.

## The one command

```
hero-nexus deploy --branch main
```

From anywhere on the droplet, including the DigitalOcean web console — which
drops you in `/root`, where a relative path would not work. `hero-nexus` is a
symlink to `cli` in the checkout, put on the `PATH` by the bootstrap.

|                                     |                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `hero-nexus deploy [--branch main]` | fetch, snapshot, build beside the running app, swap, restart, health-check |
| `hero-nexus status`                 | commit, service, health, database, disk                                    |
| `hero-nexus doctor`                 | everything that ought to be true before anybody plays                      |
| `hero-nexus logs [-n 100] [-f]`     | the service journal                                                        |
| `hero-nexus restart`                | restart and wait for the health check                                      |
| `hero-nexus backup`                 | snapshot the database now                                                  |
| `hero-nexus migrate`                | run pending migrations by hand                                             |
| `hero-nexus seed` / `sync`          | reference data from api.open5e.com                                         |
| `hero-nexus releases`               | recent commits on origin, and tags                                         |
| `hero-nexus rollback <tag>`         | deploy an older ref (read § Rollback first)                                |

`./cli help` lists the flags. `deploy/release.sh` still works and now calls
`./cli deploy`.

## Layout

| Thing                 | Path                                                          |
| --------------------- | ------------------------------------------------------------- |
| App bundle            | `/opt/hero-nexus` (this repo)                                 |
| Data volume (mounted) | `/mnt/hero-nexus-data`                                        |
| Database              | `/mnt/hero-nexus-data/hero-nexus.db`                          |
| Uploads               | `/mnt/hero-nexus-data/uploads`                                |
| Env file              | `/opt/hero-nexus/.env` (chmod 600, owned by `hero`)           |
| Operator command      | `hero-nexus` → `/opt/hero-nexus/cli`                          |
| Backups (local)       | `/mnt/hero-nexus-data/backups/` (last 10, before each deploy) |

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
ADMIN_EMAILS=you@example.com \
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

5. **Env.** Writes `/opt/hero-nexus/.env` (chmod 600) with a generated
   `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `APP_URL=https://<domain>`, the mail
   settings, `ADMIN_EMAILS`, `HERO_NEXUS_DB_PATH` and `HERO_NEXUS_UPLOADS_DIR`
   on the volume. Left alone if it already exists. `.env.example` explains
   each line.

   **`.env`, not `.env.local`.** Next reads both and `.env.local` wins, but
   that name is Next's convention for a _developer's_ machine-local
   overrides; a server whose only configuration lives in a file called
   "local" reads as a mistake. The systemd unit loads both, optionally, so a
   droplet bootstrapped before this split keeps working untouched — nothing
   needs renaming, and renaming it to `.env` is also fine.

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
sudo hero-nexus deploy --branch main
sudo hero-nexus deploy --branch v0.4.0     # a tag or a sha works too
```

In order:

1. **Refuses a dirty working tree** unless `--force`. Somebody edited a file
   on the droplet at 2am once; a pull would have silently discarded it.
2. **Fetches and checks out** the ref, hard-resetting to `origin/<branch>`
   when it is a branch. `--no-pull` deploys whatever is already checked out,
   for when you would rather `git pull` yourself.
3. **Names any migrations** the release adds, and asks before continuing. That
   changes what a rollback means (below); `--yes` answers for a script.
4. **Snapshots the database** to `/mnt/hero-nexus-data/backups/`, with
   `sqlite3 .backup` so a WAL-mode database copies consistently while the
   server is still writing. Keeps the last 10. `--no-backup` skips it.
5. **`npm ci`**, then **checks the two native modules actually load**
   (`deploy/check-native.js`) and rebuilds them if not. `require()` alone is
   not enough — better-sqlite3 loads its binding lazily, so a broken install
   only surfaces two minutes into the build as "Could not locate the bindings
   file", which reads as a Next problem and is not one. See § npm and install
   scripts.
6. **Builds into `.next.new`**, not into `.next`. The old build keeps serving
   for the whole of it; previously a request landing mid-build could 500 for
   as long as the build took.
7. **Swaps** — `.next` → `.next.old`, `.next.new` → `.next`. A rename, so the
   window is milliseconds rather than minutes.
8. **Restarts** and waits up to 60s for `127.0.0.1:3000` to answer.
9. **Puts the previous build and commit back** if it does not, restarts again,
   and says so. Migrations are _not_ undone — see § Rollback.

Migrations run on restart (`src/instrumentation.ts`) and **throw on failure**,
which stops the process. `hero-nexus.service` caps restarts at 3 in 5 minutes,
so a bad migration ends in `failed` state rather than a silent crash-loop, and
the deploy exits non-zero with the last 80 log lines.

To re-sync the SRD after an upstream change:

```
sudo hero-nexus sync
```

### npm and install scripts

npm 12 blocks package install scripts unless they are allow-listed, and
`better-sqlite3` needs its one (`prebuild-install || node-gyp rebuild`) to put
the native binding in place. `package.json` carries an `allowScripts` block
naming the four that genuinely need to run; `npm install-scripts approve <pkg>`
is how you add one, and it pins `name@version`, so a dependency bump re-blocks
until you approve the new version. That is the point of it.

`@heroui/shared-utils` stays denied on purpose — its script is wrapped in a
`try {} catch {}` and nothing needs it. The install prints one warning naming
it, which is information rather than noise: it is the package you decided not
to trust.

## Rollback

There are **no down migrations** (by design — see `src/db/README.md`). Rolling
back the code is safe only if the newer version added no migration, or its
migration is backward-compatible with the old code.

1. **Code only** (no new migration since the last good version):

   ```
   sudo hero-nexus rollback <previous-tag>
   ```

   A failed health check during a deploy already does this automatically, and
   also swaps `.next.old` back in, so the rollback does not wait for a build.

2. **A migration was applied and the old code can't run against the new
   schema:** code rollback alone won't work. Restore the database — from the
   snapshot the deploy took (`/mnt/hero-nexus-data/backups/`, named with the
   UTC instant), or from the Litestream replica for a finer point in time
   (`restore.md`) — then release the previous tag. This loses writes made
   after that point, which is acceptable only immediately after a bad deploy.

Always rehearse a migration against a copy of the production DB before deploying
it (`restore.md` § Migration rehearsal).

## Checking a droplet

```
hero-nexus doctor
```

Node version, `sqlite3` present, the env file and its mode, every key the app
needs, the database and uploads and whether they are on a mounted volume, disk
usage, the service being active _and enabled_ (an unenabled unit does not
survive a reboot — the kind of thing nobody notices for six weeks), the health
endpoint, local snapshots, and Litestream. Checks that only matter in
production are remarks rather than complaints on a developer's clone, which it
recognises by the absence of the systemd unit; `--prod` forces the strict
reading.
