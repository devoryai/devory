#!/usr/bin/env node
// check-versions.js — Verify all workspace packages share the same version.
// Run directly or via `node scripts/check-versions.js`.
// Used by the publish-npm workflow to catch version skew before publishing.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PACKAGES = ["packages/core", "packages/cli", "packages/github", "packages/vscode"];

const versions = PACKAGES.map((rel) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel, "package.json"), "utf8"));
  return { name: pkg.name, version: pkg.version, path: rel };
});

const unique = [...new Set(versions.map((p) => p.version))];

console.log("Package versions:");
for (const { name, version } of versions) {
  console.log(`  ${name}: ${version}`);
}

if (unique.length > 1) {
  console.error("\nError: packages have inconsistent versions:", unique.join(", "));
  console.error("Run scripts/bump-version.sh <version> to align them.");
  process.exit(1);
}

console.log(`\nAll packages are at v${unique[0]} — OK`);
