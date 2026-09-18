#!/usr/bin/env bash
#
# Deploy a new version to a droplet that deploy/bootstrap.sh already set up.
# Run as root on the droplet:
#
#   sudo /opt/hero-nexus/deploy/release.sh            # origin/main
#   sudo /opt/hero-nexus/deploy/release.sh v0.4.0     # a tag
#   sudo /opt/hero-nexus/deploy/release.sh feature-x  # a branch
#
# Fetch, check out, install, build, restart, then confirm the server answers.
# Migrations run when the service starts (src/instrumentation.ts) and throw on
# failure, so a bad migration shows up here as the health check failing —
# read `journalctl -u hero-nexus -n 100` and see docs/ops/deploy.md § Rollback.
#
# `next build` writes into .next while the old server is still serving from
# it, so a request that lands mid-build can 500. On one droplet with one
# process that window is the accepted cost; a restart follows immediately.

set -euo pipefail

REF="${1:-main}"
APP_DIR="${APP_DIR:-/opt/hero-nexus}"

if [[ $EUID -ne 0 ]]; then
	echo "run as root (it restarts the service)" >&2
	exit 1
fi

as_hero() { sudo -u hero -H bash -c "cd '$APP_DIR' && $*"; }

before="$(as_hero git rev-parse --short HEAD)"

as_hero "git fetch --tags origin"
as_hero "git checkout -q '$REF'"
if as_hero "git show-ref -q --verify 'refs/remotes/origin/$REF'"; then
	as_hero "git reset -q --hard 'origin/$REF'"
fi
after="$(as_hero git rev-parse --short HEAD)"
echo "== $before -> $after ($REF)"

# Say up front whether this release carries a migration: it changes what a
# rollback means (docs/ops/deploy.md § Rollback).
if [[ "$before" != "$after" ]]; then
	migrations="$(as_hero "git diff --name-only '$before' '$after' -- src/db/migrations" || true)"
	if [[ -n "$migrations" ]]; then
		echo "== this release applies migrations (no down migrations exist — see docs/ops/deploy.md § Rollback):"
		echo "$migrations" | sed 's/^/     /'
	fi
fi

echo "== npm ci"
as_hero "npm ci"
echo "== next build"
as_hero "npm run build"

echo "== restart"
systemctl restart hero-nexus

for _ in $(seq 1 20); do
	if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
		echo "== up: $after is serving on 127.0.0.1:3000"
		journalctl -u hero-nexus --no-pager -n 20 -o cat
		exit 0
	fi
	if ! systemctl is-active -q hero-nexus; then break; fi
	sleep 1
done

echo "== hero-nexus is not answering after restart" >&2
systemctl --no-pager status hero-nexus || true
journalctl -u hero-nexus --no-pager -n 100 -o cat >&2
exit 1
