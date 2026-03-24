/**
 * packages/vscode/src/test/cli-bridge.test.ts
 *
 * Tests for src/lib/cli-bridge.ts.
 * Tests the pure invocation-building delegates (no process spawning).
 *
 * Run: tsx --test packages/vscode/src/test/cli-bridge.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskNewInvocation,
  buildTaskMoveInvocation,
  buildRunInvocation,
} from "../lib/cli-bridge.js";

// ── buildTaskNewInvocation ─────────────────────────────────────────────────

describe("buildTaskNewInvocation (cli-bridge)", () => {
  test("invocation delegates via node + tsx", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "t", project: "p", dryRun: false });
    assert.equal(inv[0], process.execPath);
    assert.ok(inv[1].includes("tsx"), `expected inv[1] to include tsx, got: ${inv[1]}`);
  });

  test("includes --id flag and value", () => {
    const inv = buildTaskNewInvocation({ id: "factory-099", title: "T", project: "P", dryRun: false });
    const i = inv.indexOf("--id");
    assert.ok(i >= 0 && inv[i + 1] === "factory-099");
  });

  test("includes --title flag and value", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "My Task", project: "P", dryRun: false });
    const i = inv.indexOf("--title");
    assert.ok(i >= 0 && inv[i + 1] === "My Task");
  });

  test("includes --project flag and value", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "T", project: "my-project", dryRun: false });
    const i = inv.indexOf("--project");
    assert.ok(i >= 0 && inv[i + 1] === "my-project");
  });

  test("includes --dry-run when dryRun is true", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "T", project: "P", dryRun: true });
    assert.ok(inv.includes("--dry-run"));
  });

  test("omits --dry-run when dryRun is false", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "T", project: "P", dryRun: false });
    assert.ok(!inv.includes("--dry-run"));
  });

  test("includes optional --type when set", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "T", project: "P", type: "bugfix", dryRun: false });
    const i = inv.indexOf("--type");
    assert.ok(i >= 0 && inv[i + 1] === "bugfix");
  });

  test("includes optional --agent when set", () => {
    const inv = buildTaskNewInvocation({ id: "x", title: "T", project: "P", agent: "backend-specialist", dryRun: false });
    const i = inv.indexOf("--agent");
    assert.ok(i >= 0 && inv[i + 1] === "backend-specialist");
  });
});

// ── buildTaskMoveInvocation ────────────────────────────────────────────────

describe("buildTaskMoveInvocation (cli-bridge)", () => {
  test("invocation delegates via node + tsx", () => {
    const inv = buildTaskMoveInvocation({ task: "tasks/backlog/foo.md", to: "ready" });
    assert.equal(inv[0], process.execPath);
    assert.ok(inv[1].includes("tsx"), `expected inv[1] to include tsx, got: ${inv[1]}`);
  });

  test("includes --task and --to", () => {
    const inv = buildTaskMoveInvocation({ task: "tasks/backlog/foo.md", to: "doing" });
    const ti = inv.indexOf("--task");
    const toi = inv.indexOf("--to");
    assert.ok(ti >= 0 && inv[ti + 1] === "tasks/backlog/foo.md");
    assert.ok(toi >= 0 && inv[toi + 1] === "doing");
  });
});

// ── buildRunInvocation ─────────────────────────────────────────────────────

describe("buildRunInvocation (cli-bridge)", () => {
  test("invocation delegates via node + tsx", () => {
    const inv = buildRunInvocation({ dryRun: false, validate: false });
    assert.equal(inv[0], process.execPath);
    assert.ok(inv[1].includes("tsx"), `expected inv[1] to include tsx, got: ${inv[1]}`);
  });

  test("bare invocation has no extra flags", () => {
    const inv = buildRunInvocation({ dryRun: false, validate: false });
    assert.equal(inv.length, 3); // [node, tsxCli, scriptPath]
  });

  test("includes --limit when provided", () => {
    const inv = buildRunInvocation({ limit: 5, dryRun: false, validate: false });
    const i = inv.indexOf("--limit");
    assert.ok(i >= 0 && inv[i + 1] === "5");
  });

  test("includes --resume <id> when resumeId provided", () => {
    const inv = buildRunInvocation({ resumeId: "run-abc", dryRun: false, validate: false });
    const i = inv.indexOf("--resume");
    assert.ok(i >= 0 && inv[i + 1] === "run-abc");
  });

  test("includes --dry-run when true", () => {
    const inv = buildRunInvocation({ dryRun: true, validate: false });
    assert.ok(inv.includes("--dry-run"));
  });

  test("includes --validate when true", () => {
    const inv = buildRunInvocation({ dryRun: false, validate: true });
    assert.ok(inv.includes("--validate"));
  });

  test("omits all optional flags when not set", () => {
    const inv = buildRunInvocation({ dryRun: false, validate: false });
    assert.ok(!inv.includes("--limit"));
    assert.ok(!inv.includes("--resume"));
    assert.ok(!inv.includes("--dry-run"));
    assert.ok(!inv.includes("--validate"));
  });
});
