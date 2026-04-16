# Release Guide — devory-public

This document describes how to release `@devory/core`, `@devory/cli`, and `@devory/github` to npm, and how to build the matching `devory-vscode` VSIX for manual upload.

---

## Overview

devory-public is the public distribution layer for Devory. It contains:

| Package | Distribution | Trigger |
|---|---|---|
| `@devory/core` | npm | `v*.*.*` tag |
| `@devory/cli` | npm | `v*.*.*` tag |
| `@devory/github` | npm | `v*.*.*` tag |
| `devory-vscode` | manual VSIX upload | local package build or optional `vscode-v*.*.*` packaging tag |

npm publishing is automated through GitHub Actions once a `v*.*.*` tag is pushed. The VS Code extension is intentionally packaged separately so the resulting `.vsix` can be uploaded manually.

---

## Required Secrets

Configure these once in the GitHub repo settings under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `NPM_TOKEN` | Granular npm access token with publish rights to the `@devory` org |

The npm token is not committed to the repo. The publish workflow will fail safely if it is absent.

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

Apply the public-facing code and docs changes from the internal `devory` repo into the corresponding public packages and docs before bumping the release.

### 2. Bump versions

All public workspace packages should share the same version. Use the bump script to update them together:

```bash
cd /path/to/devory-public
./scripts/bump-version.sh <version>
```

The script updates the public package manifests in:
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/github/package.json`
- `packages/vscode/package.json`

Verify with:
```bash
node scripts/check-versions.js
```

### 3. Commit and tag npm packages

```bash
git add -A
git commit -m "chore: release v<version>"
git tag v<version>
```

Pushing `v<version>` triggers:
- `.github/workflows/publish-npm.yml` — builds, tests, and publishes `@devory/core`, `@devory/cli`, and `@devory/github`

It does **not** publish the VS Code extension.

### 4. Push

```bash
git push origin main
git push origin --tags
```

### 5. Build the VSIX for manual upload

Build the extension locally from `devory-public` so the shipped artifact matches the same release:

```bash
npm install
npm run package:vscode
```

Expected artifact:

```text
packages/vscode/devory-vscode-<version>.vsix
```

If you want GitHub to package a matching artifact without publishing it, push a dedicated packaging tag:

```bash
git tag vscode-v<version>
git push origin vscode-v<version>
```

That tag triggers `.github/workflows/publish-vscode.yml`, which packages the extension and uploads the `.vsix` as a workflow artifact for manual retrieval.

### 6. Verify

Monitor the Actions tab in GitHub for the npm publish run. Confirm the published package versions on npm and keep the locally built or artifact-built VSIX for manual upload.

---

## Dry-Run Verification

Both release paths can be verified without publishing:

- **Publish npm packages** — run the `publish-npm` workflow manually with `dry_run=true` to execute `npm publish --dry-run`
- **Package VS Code extension** — run the `publish-vscode` workflow manually or push a `vscode-v*.*.*` tag to produce a `.vsix` artifact without marketplace publication

Run a dry-run after structural changes to manifests, build steps, or workflow files.

---

## Versioning Strategy

- The three npm packages are versioned and released together.
- The VS Code extension should normally carry the same version, but its `.vsix` is uploaded manually.
- Follow [semver](https://semver.org/): patch for fixes, minor for new features, major for breaking changes.

---

## Troubleshooting

**Publish fails with 403 / ENEEDAUTH**
→ The `NPM_TOKEN` secret is missing, expired, or lacks publish rights to the `@devory` scope.

**Version check fails in CI**
→ Packages have diverged versions. Run `./scripts/bump-version.sh <version>` and commit before tagging.

**The VSIX is missing after packaging**
→ Re-run `npm run package:vscode` locally or inspect the uploaded artifact from the `publish-vscode` workflow.

**I need to yank a bad npm release**
→ `npm unpublish @devory/package@x.y.z --force` (within 72 hours) or `npm deprecate @devory/package@x.y.z "message"`.
