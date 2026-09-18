#!/usr/bin/env bash
#
# One-time provisioning of a fresh Ubuntu 24.04 DigitalOcean droplet. Run as
# root, once. It is idempotent enough to re-run after a failure partway through.
#
#   ssh root@<droplet-ip>
#   curl -fsSLo bootstrap.sh https://raw.githubusercontent.com/<you>/hero-nexus/main/deploy/bootstrap.sh
#   DOMAIN=play.example.com \
#   REPO_URL=https://github.com/<you>/hero-nexus.git \
#   RESEND_API_KEY=re_... \
#   MAIL_FROM='Hero Nexus <no-reply@example.com>' \
#   bash bootstrap.sh
#
# What it does, in order (docs/ops/deploy.md is the prose version):
#   1. apt packages, a swapfile if there is none, Node 22, Caddy
#   2. the `hero` system user and the data directory
#   3. clone to /opt/hero-nexus, write .env.local (AUTH_SECRET generated)
#   4. npm ci, next build, migrate, seed the SRD from Open5e
#   5. systemd unit + Caddyfile, ufw (22/80/443), journald cap
#
# It does NOT set up backups. Litestream and the uploads mirror need bucket
# credentials — follow docs/ops/restore.md § Setup, then do the restore drill.
#
# Required:  DOMAIN, REPO_URL, RESEND_API_KEY, MAIL_FROM
# Optional:  REF (default main), DATA_DIR (default /mnt/hero-nexus-data),
#            APP_DIR (default /opt/hero-nexus), NODE_MAJOR (default 22)

set -euo pipefail

DOMAIN="${DOMAIN:?set DOMAIN to the hostname the site is served at, e.g. play.example.com}"
REPO_URL="${REPO_URL:?set REPO_URL to the git remote to clone}"
REF="${REF:-main}"
APP_DIR="${APP_DIR:-/opt/hero-nexus}"
DATA_DIR="${DATA_DIR:-/mnt/hero-nexus-data}"
NODE_MAJOR="${NODE_MAJOR:-22}"

# Email is load-bearing: an account cannot sign in until its verification link
# is clicked, and production refuses to send without Resend. A droplet without
# these is a site nobody — including you — can log in to.
RESEND_API_KEY="${RESEND_API_KEY:?set RESEND_API_KEY — without mail, no account can ever sign in}"
MAIL_FROM="${MAIL_FROM:?set MAIL_FROM to an address on your Resend-verified domain}"

if [[ $EUID -ne 0 ]]; then
	echo "run as root" >&2
	exit 1
fi

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 1. system
log "apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git curl ca-certificates gnupg build-essential python3 sqlite3 ufw

# `next build` needs ~2 GB. On a 1 GB droplet it is OOM-killed with no
# message but "Killed". A swapfile is cheaper than the next droplet size up.
if [[ -z "$(swapon --show --noheadings)" ]]; then
	log "no swap — creating a 2 GB swapfile"
	fallocate -l 2G /swapfile
	chmod 600 /swapfile
	mkswap /swapfile
	swapon /swapfile
	grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
	log "Node ${NODE_MAJOR} (NodeSource)"
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
	apt-get install -y -q nodejs
fi
node --version
npm --version

if ! command -v caddy >/dev/null; then
	log "Caddy"
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
		tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
	apt-get update -q
	apt-get install -y -q caddy
fi

# ---------------------------------------------------------------- 2. user + data
log "user and data directory"
id hero >/dev/null 2>&1 || adduser --system --group --home /home/hero hero

if ! mountpoint -q "$DATA_DIR"; then
	echo "WARNING: $DATA_DIR is not a mounted volume — the database and uploads" >&2
	echo "         will live on the droplet's root disk. Attach a DO volume at" >&2
	echo "         that path if you want them to survive a rebuild." >&2
fi
mkdir -p "$DATA_DIR/uploads"
chown -R hero:hero "$DATA_DIR"

# ---------------------------------------------------------------- 3. checkout + env
log "checkout $REF into $APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
	mkdir -p "$APP_DIR"
	chown hero:hero "$APP_DIR"
	sudo -u hero git clone "$REPO_URL" "$APP_DIR"
fi
sudo -u hero git -C "$APP_DIR" fetch --tags origin
sudo -u hero git -C "$APP_DIR" checkout -q "$REF"
# A branch ref should track the remote; a tag or sha is left detached.
if sudo -u hero git -C "$APP_DIR" show-ref -q --verify "refs/remotes/origin/$REF"; then
	sudo -u hero git -C "$APP_DIR" reset -q --hard "origin/$REF"
fi

ENV_FILE="$APP_DIR/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
	log "writing $ENV_FILE"
	AUTH_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
	cat >"$ENV_FILE" <<ENV
# Written by deploy/bootstrap.sh. See .env.example for what each line means.
AUTH_SECRET=${AUTH_SECRET}
AUTH_TRUST_HOST=true
APP_URL=https://${DOMAIN}
RESEND_API_KEY=${RESEND_API_KEY}
MAIL_FROM=${MAIL_FROM}
HERO_NEXUS_DB_PATH=${DATA_DIR}/hero-nexus.db
HERO_NEXUS_UPLOADS_DIR=${DATA_DIR}/uploads
ENV
	chown hero:hero "$ENV_FILE"
	chmod 600 "$ENV_FILE"
else
	echo "$ENV_FILE exists — leaving it alone"
fi

# ---------------------------------------------------------------- 4. build + database
log "npm ci + build"
sudo -u hero -H npm --prefix "$APP_DIR" ci
sudo -u hero -H bash -c "cd '$APP_DIR' && npm run build"

log "migrate + seed"
# The seed pulls the SRD from api.open5e.com — the only outbound call the app
# ever makes, and it takes a few minutes (classes and spells render slowly
# upstream). It is idempotent; re-run `npm run db:seed` to pick up changes.
sudo -u hero -H bash -c "cd '$APP_DIR' && set -a && . ./.env.local && set +a && npm run db:migrate && npm run db:seed"

# ---------------------------------------------------------------- 5. services
log "systemd + Caddy"
install -m 644 "$APP_DIR/deploy/hero-nexus.service" /etc/systemd/system/hero-nexus.service
if [[ "$DATA_DIR" != "/mnt/hero-nexus-data" ]]; then
	sed -i "s#ReadWritePaths=.*#ReadWritePaths=${APP_DIR} ${DATA_DIR}#" /etc/systemd/system/hero-nexus.service
fi
if [[ "$APP_DIR" != "/opt/hero-nexus" ]]; then
	sed -i "s#/opt/hero-nexus#${APP_DIR}#g" /etc/systemd/system/hero-nexus.service
fi
systemctl daemon-reload
systemctl enable --now hero-nexus

sed "s/hero-nexus\.example\.com/${DOMAIN}/" "$APP_DIR/deploy/Caddyfile" >/etc/caddy/Caddyfile
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

# Belt and braces: the app already binds 127.0.0.1, but block 3000 at the
# host too. Mirror this in the DO cloud firewall (only 22, 80, 443 inbound).
log "ufw"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# journald otherwise grows until the disk it shares with the database fills.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' >/etc/systemd/journald.conf.d/hero-nexus.conf
systemctl restart systemd-journald

# ---------------------------------------------------------------- done
log "checking"
sleep 3
systemctl --no-pager --lines=0 status hero-nexus || true
if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
	echo "app answers on 127.0.0.1:3000"
else
	echo "app is NOT answering — journalctl -u hero-nexus -n 100" >&2
	exit 1
fi

cat <<NEXT

Done. https://${DOMAIN} should serve once DNS points here (Caddy fetches the
certificate on the first request; watch \`journalctl -u caddy -f\`).

Still to do — none of this is optional before real players arrive:

  1. Resend: add ${MAIL_FROM#*@} as a sending domain and publish the SPF and
     DKIM records it gives you. Until they verify, registration mails are
     dropped and nobody can sign in. Test: register an account and click the link.
  2. Backups: docs/ops/restore.md § Setup (Litestream + uploads mirror), then
     the restore drill in the same file.
  3. DigitalOcean: cloud firewall allowing only 22/80/443 inbound; disk-usage
     alert at 80% on the droplet and the volume.

Later releases: deploy/release.sh <tag-or-branch>
NEXT
