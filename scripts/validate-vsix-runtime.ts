/**
 * scripts/validate-vsix-runtime.ts
 *
 * Smoke-validates that a packaged VS Code extension artifact includes the
 * packaged local runtime expected for standalone run execution.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const VSCODE_PACKAGE_JSON = path.join(REPO_ROOT, "packages", "vscode", "package.json");

function getDefaultVsixPath(): string {
  const packageJson = JSON.parse(fs.readFileSync(VSCODE_PACKAGE_JSON, "utf-8")) as {
    name: string;
    version: string;
  };
  return path.join(
    REPO_ROOT,
    "packages",
    "vscode",
    `${packageJson.name}-${packageJson.version}.vsix`
  );
}

function main(): void {
  const target = process.argv[2] ?? getDefaultVsixPath();
  const result = spawnSync("unzip", ["-l", target], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to inspect ${target}`);
  }

  const listing = result.stdout;
  const required = [
    "extension/out/extension.js",
    "extension/runtime/runtime-manifest.json",
    "extension/runtime/packages/runner/src/factory-run.js",
    "extension/runtime/scripts/run-orchestrator.js",
  ];

  for (const entry of required) {
    if (!listing.includes(entry)) {
      throw new Error(`VSIX is missing required runtime artifact: ${entry}`);
    }
  }

  console.log(`[validate-vsix-runtime] OK   ${target}`);
}

main();
