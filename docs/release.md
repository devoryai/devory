# Release Guide — devory-public

This document describes how to release `@devory/core`, `@devory/cli`, `@devory/github`, and `devory-vscode` to their respective registries.

---

## Overview

devory-public is the public distribution layer for the Devory AI Dev Factory. It contains:

| Package | Registry | Workflow trigger |
|---|---|---|
| `@devory/core` | npm | `v*.*.*` tag |
| `@devory/cli` | npm | `v*.*.*` tag |
| `@devory/github` | npm | `v*.*.*` tag |
| `devory-vscode` | VS Code Marketplace | `v*.*.*` or `vscode-v*.*.*` tag |

Publishing is fully automated via GitHub Actions once a version tag is pushed. The workflows can also be triggered manually with a dry-run option.

---

## Required Secrets

Configure these once in the GitHub repo settings under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `NPM_TOKEN` | Granular npm access token with publish rights to the `@devory` org |
| `VSCE_PAT` | VS Code Marketplace personal access token |

Neither secret is committed to the repo. The publish workflows will fail safely if these are absent.

---

## Knowing When to Release

Run the sync check from the internal `devory` repo to see if devory-public is behind:

```bash
npx tsx scripts/check-public-sync.ts
```

This reports:
- Uncommitted changes in devory-public
- Package version skew across workspace packages
- Commits since the last release tag
- Whether the package version matches the latest git tag

If any issues are found, follow the release steps below.

---

## Release Steps

### 1. Sync code changes

If changes from the internal `devory` repo need to be reflected in devory-public, apply them to the relevant packages in `packages/` before bumping the version.

### 2. Bump versions

All workspace packages must share the same version. Use the bump script to update them all at once:

```bash
cd /path/to/devory-public
./scripts/bump-version.sh <new-version>

# Example
./scripts/bump-version.sh 0.4.5
```

The script validates semver format and updates `version` in each `package.json`.

Verify with:
```bash
node scripts/check-versions.js
```

### 3. Commit and tag

```bash
git add -A
git commit -m "chore: bump to v0.4.5"

# Tag for npm packages + VS Code extension (same tag triggers both workflows)
git tag v0.4.5
```

To release VS Code only (e.g., a hotfix without an npm version bump):
```bash
git tag vscode-v0.1.5
```

### 4. Push

```bash
git push origin main
git push origin --tags
```

Pushing the tag triggers:
- `.github/workflows/publish-npm.yml` — builds and publishes npm packages
- `.github/workflows/publish-vscode.yml` — packages and publishes the VS Code extension

### 5. Verify

Monitor the Actions tab in GitHub. Both workflows produce artifacts and log output.

---

## Dry-Run Verification

Both publish workflows support a manual dry-run trigger under **Actions → Run workflow**:

- **Publish npm packages** — runs `npm publish --dry-run` for each package; no registry write
- **Publish VS Code extension** — packages the `.vsix` but skips the marketplace upload

Run a dry-run after any structural change to `package.json` or workflow files to confirm the pipeline is healthy before a real release.

---

## Versioning Strategy

- All npm packages (`@devory/core`, `@devory/cli`, `@devory/github`) are versioned together and released on the same `v*.*.*` tag.
- `devory-vscode` uses the same tag in most cases. Use a separate `vscode-v*.*.*` tag only when the extension needs an independent release (e.g., a UI fix that doesn't touch the npm packages).
- Follow [semver](https://semver.org/): bump patch for fixes, minor for new features, major for breaking changes.

---

## Troubleshooting

**Publish fails with 403 / ENEEDAUTH**
→ The `NPM_TOKEN` secret is missing, expired, or lacks publish rights to the `@devory` scope.

**vsce publish fails with "Personal Access Token verification failed"**
→ The `VSCE_PAT` secret is missing or expired. Generate a new PAT from the Azure DevOps marketplace portal.

**Version check fails in CI**
→ Packages have diverged versions. Run `./scripts/bump-version.sh <version>` and commit before tagging.

**I need to yank a bad release**
→ `npm unpublish @devory/package@x.y.z --force` (within 72 hours) or `npm deprecate @devory/package@x.y.z "message"`. For VS Code, use the Marketplace publisher portal.
