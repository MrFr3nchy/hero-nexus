#!/usr/bin/env bash
#
# Kept so the path in older runbooks, notes and shell history still works.
# Everything it used to do now lives in `./cli deploy`, which does it in a
# safer order: it snapshots the database first, builds beside the running app
# instead of on top of it, and puts the previous build back when the health
# check fails.
#
#   sudo /opt/hero-nexus/deploy/release.sh            # the current branch
#   sudo /opt/hero-nexus/deploy/release.sh v0.4.0     # a tag
#   sudo /opt/hero-nexus/deploy/release.sh feature-x  # a branch
#
# Which is the same as:
#
#   sudo hero-nexus deploy --branch v0.4.0
#
# `hero-nexus` is a symlink to `cli` that deploy/bootstrap.sh puts on the PATH.

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
REF="${1:-}"

echo "note: deploy/release.sh now calls ./cli deploy. See ./cli help." >&2

if [[ -n "$REF" ]]; then
	exec "$APP_DIR/cli" deploy --branch "$REF" --yes
else
	exec "$APP_DIR/cli" deploy --yes
fi
