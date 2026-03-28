#!/usr/bin/env bash
# bump-version.sh — Bump all devory-public package versions consistently.
#
# Usage:
#   ./scripts/bump-version.sh <new-version>
#
# Example:
#   ./scripts/bump-version.sh 0.2.0
#
# This script updates the version field in every workspace package.json.
# After running it, review changes with `git diff`, then commit and tag.

set -euo pipefail

NEW_VERSION="${1:-}"
if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: $0 <new-version>" >&2
  echo "  e.g. $0 0.2.0" >&2
  exit 1
fi

# Validate semver format (loose: X.Y.Z or X.Y.Z-prerelease)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?$'; then
  echo "Error: version must be semver (e.g. 1.2.3 or 1.2.3-rc.1)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACKAGES=(
  "$REPO_ROOT/packages/core"
  "$REPO_ROOT/packages/cli"
  "$REPO_ROOT/packages/github"
  "$REPO_ROOT/packages/vscode"
)

echo "Bumping all packages to $NEW_VERSION"

for PKG_DIR in "${PACKAGES[@]}"; do
  PKG_JSON="$PKG_DIR/package.json"
  if [[ ! -f "$PKG_JSON" ]]; then
    echo "  WARNING: $PKG_JSON not found, skipping" >&2
    continue
  fi

  OLD_VERSION=$(node -p "require('$PKG_JSON').version")
  # Use node to do an in-place json update (avoids jq dependency)
  node - "$PKG_JSON" "$NEW_VERSION" <<'EOF'
const fs = require('fs');
const [,, file, ver] = process.argv;
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = ver;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
EOF

  PKG_NAME=$(node -p "require('$PKG_JSON').name")
  echo "  $PKG_NAME: $OLD_VERSION -> $NEW_VERSION"
done

echo ""
echo "Done. Next steps:"
echo "  1. Review: git diff"
echo "  2. Commit:  git commit -am \"chore: bump to v$NEW_VERSION\""
echo "  3. Tag npm packages:    git tag v$NEW_VERSION"
echo "  4. Tag VS Code (optional, same tag or separate vscode-v$NEW_VERSION):"
echo "     git tag vscode-v$NEW_VERSION"
echo "  5. Push:    git push && git push --tags"
