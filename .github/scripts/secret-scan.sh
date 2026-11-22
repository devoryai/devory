#!/usr/bin/env bash
# .github/scripts/secret-scan.sh — factory-505 secret scan (CI and local).
#
#   secret-scan.sh [<git log range>]
#
# 1. Scans every file tracked at HEAD (exported with `git archive`, so
#    untracked local files such as your .env.local are never read).
# 2. If a range is given (e.g. "origin/main..HEAD"), also scans the content
#    added by those commits.
# Findings are redacted. Exit 1 on any finding.
set -euo pipefail

GITLEAKS="${GITLEAKS:-gitleaks}"
ROOT="$(git rev-parse --show-toplevel)"
ARGS=(--redact --no-banner --exit-code 1)
[[ -f "$ROOT/.gitleaks.toml" ]] && ARGS+=(--config "$ROOT/.gitleaks.toml")

TREE="$(mktemp -d)"
trap 'rm -rf "$TREE"' EXIT
git -C "$ROOT" archive HEAD | tar -x -C "$TREE"

echo "== secret scan: files tracked at $(git -C "$ROOT" rev-parse --short HEAD)"
"$GITLEAKS" dir "$TREE" "${ARGS[@]}"

if [[ -n "${1:-}" ]]; then
  echo "== secret scan: commits $1"
  "$GITLEAKS" git "$ROOT" "${ARGS[@]}" --log-opts="$1"
fi
echo "== secret scan: no findings"
