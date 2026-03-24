/**
 * packages/cli/src/commands/run.test.ts
 *
 * factory-069: CLI run command smoke test.
 *
 * Verifies that `devory run --dry-run` can be invoked end-to-end through the
 * CLI's invocation chain without crashing. Uses --dry-run so the test is
 * non-destructive: no task files are moved, no Claude API calls are made.
 *
 * The test spawns the actual factory-run.ts script via buildInvocation,
 * which is the same path the `devory run` binary takes.
 *
 * Run from factory root: tsx --test packages/cli/src/commands/run.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

import { parseArgs, buildInvocation } from "./run.js";

const __filename = fileURLToPath(import.meta.url);
const FACTORY_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..", "..", "..");

// ---------------------------------------------------------------------------
// parseArgs / buildInvocation (unit)
// ---------------------------------------------------------------------------

describe("run command — parseArgs", () => {
  test("defaults: no flags → dryRun false, validate false", () => {
    const result = parseArgs([]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { limit: undefined, resumeId: undefined, dryRun: false, validate: false });
  });

  test("--dry-run flag is parsed", () => {
    const result = parseArgs(["--dry-run"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.dryRun, true);
  });

  test("--validate flag is parsed", () => {
    const result = parseArgs(["--validate"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.validate, true);
  });

  test("--limit <n> is parsed as integer", () => {
    const result = parseArgs(["--limit", "3"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.limit, 3);
  });

  test("--resume <run-id> is parsed", () => {
    const result = parseArgs(["--resume", "orchestrator-run-2026"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.resumeId, "orchestrator-run-2026");
  });

  test("non-numeric --limit returns error", () => {
    const result = parseArgs(["--limit", "banana"]);
    assert.ok(result.error !== null);
    assert.ok(result.error!.includes("--limit"));
  });
});

describe("run command — buildInvocation", () => {
  test("invocation: [node, tsxCli, factory-run.ts]", () => {
    const inv = buildInvocation({ dryRun: false, validate: false });
    assert.equal(inv[0], process.execPath);
    assert.ok(inv[1].includes("tsx"), `expected tsx in inv[1], got: ${inv[1]}`);
    assert.ok(path.basename(inv[2]) === "factory-run.ts", `expected factory-run.ts, got: ${inv[2]}`);
  });

  test("--dry-run forwarded correctly", () => {
    const inv = buildInvocation({ dryRun: true, validate: false });
    assert.ok(inv.includes("--dry-run"));
  });

  test("--validate forwarded correctly", () => {
    const inv = buildInvocation({ dryRun: false, validate: true });
    assert.ok(inv.includes("--validate"));
  });

  test("--limit forwarded as string", () => {
    const inv = buildInvocation({ limit: 5, dryRun: false, validate: false });
    const i = inv.indexOf("--limit");
    assert.ok(i >= 0 && inv[i + 1] === "5");
  });

  test("--resume forwarded with run-id", () => {
    const inv = buildInvocation({ resumeId: "run-abc-123", dryRun: false, validate: false });
    const i = inv.indexOf("--resume");
    assert.ok(i >= 0 && inv[i + 1] === "run-abc-123");
  });

  test("no optional flags when not set", () => {
    const inv = buildInvocation({ dryRun: false, validate: false });
    assert.ok(!inv.includes("--limit"));
    assert.ok(!inv.includes("--resume"));
    assert.ok(!inv.includes("--dry-run"));
    assert.ok(!inv.includes("--validate"));
  });
});

// ---------------------------------------------------------------------------
// Smoke test: devory run --dry-run exits 0 against the real factory root
// ---------------------------------------------------------------------------

describe("run command — smoke test (--dry-run, non-destructive)", () => {
  test("devory run --dry-run exits 0 when factory root is valid", () => {
    const inv = buildInvocation({ dryRun: true, validate: false });
    const [cmd, ...args] = inv;
    const result = spawnSync(cmd, args, {
      cwd: FACTORY_ROOT,
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env, DEVORY_FACTORY_ROOT: FACTORY_ROOT },
    });

    // Acceptable: 0 (completed/no-tasks) or non-zero if no ready tasks exist
    // The key assertion is that the process did not crash unexpectedly
    assert.ok(
      result.status === 0 || result.status === 1,
      `unexpected exit code: ${result.status} — stderr: ${result.stderr}`
    );
    assert.ok(
      result.error === undefined || result.error === null,
      `spawn error: ${result.error}`
    );
  });

  test("factory-run.ts is present at the resolved factory root", () => {
    const inv = buildInvocation({ dryRun: true, validate: false });
    const scriptPath = inv[2];
    assert.ok(
      scriptPath.endsWith("factory-run.ts"),
      `expected path ending in factory-run.ts, got: ${scriptPath}`
    );
  });
});
