/**
 * packages/vscode/src/test/run-reader.test.ts
 *
 * Tests for src/lib/run-reader.ts.
 * Uses a temporary directory with fake run JSON files.
 *
 * Run: tsx --test packages/vscode/src/test/run-reader.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  listRuns,
  getRunById,
  getResumableRuns,
  formatRunLabel,
  RESUMABLE_STATUSES,
  type RunRecord,
} from "../lib/run-reader.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function writeRun(dir: string, filename: string, run: RunRecord): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(run), "utf-8");
}

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    run_id: "run-001",
    status: "completed",
    task_queue: [],
    tasks_executed: [],
    failure: null,
    start_time: "2025-01-01T10:00:00Z",
    end_time: "2025-01-01T10:05:00Z",
    ...overrides,
  };
}

// ── Fixture setup ──────────────────────────────────────────────────────────

let tmpDir: string;
let runsDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-test-runs-"));
  runsDir = path.join(tmpDir, "runs");

  writeRun(runsDir, "2025-01-01T10-run-001.json", makeRun({ run_id: "run-001", status: "completed" }));
  writeRun(runsDir, "2025-01-02T10-run-002.json", makeRun({ run_id: "run-002", status: "failed" }));
  writeRun(runsDir, "2025-01-03T10-run-003.json", makeRun({
    run_id: "run-003",
    status: "paused_for_review",
    tasks_executed: [{ task_id: "factory-001", outcome: "success", engine: "sonnet", fallback_taken: false, start_time: "", end_time: "", notes: [] }],
  }));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── RESUMABLE_STATUSES ─────────────────────────────────────────────────────

describe("RESUMABLE_STATUSES", () => {
  test("includes failed and paused_for_review", () => {
    assert.ok((RESUMABLE_STATUSES as readonly string[]).includes("failed"));
    assert.ok((RESUMABLE_STATUSES as readonly string[]).includes("paused_for_review"));
  });
});

// ── listRuns ───────────────────────────────────────────────────────────────

describe("listRuns", () => {
  test("returns 3 runs", () => {
    const runs = listRuns(runsDir);
    assert.equal(runs.length, 3);
  });

  test("returns runs newest first (by filename sort + reverse)", () => {
    const runs = listRuns(runsDir);
    // run-003 filename starts with 2025-01-03 — most recent
    assert.equal(runs[0].run_id, "run-003");
  });

  test("returns empty array for non-existent directory", () => {
    assert.deepEqual(listRuns("/does/not/exist"), []);
  });

  test("skips -manifest.json files", () => {
    fs.writeFileSync(
      path.join(runsDir, "manifest-test.json"),
      JSON.stringify({ run_id: "should-skip" })
    );
    // Rename to -manifest.json pattern
    fs.renameSync(
      path.join(runsDir, "manifest-test.json"),
      path.join(runsDir, "run-000-manifest.json")
    );
    const runs = listRuns(runsDir);
    assert.ok(!runs.some((r) => r.run_id === "should-skip"));
    // Cleanup
    fs.unlinkSync(path.join(runsDir, "run-000-manifest.json"));
  });
});

// ── getRunById ─────────────────────────────────────────────────────────────

describe("getRunById", () => {
  test("finds run-001", () => {
    const run = getRunById(runsDir, "run-001");
    assert.ok(run !== null);
    assert.equal(run!.run_id, "run-001");
    assert.equal(run!.status, "completed");
  });

  test("returns null for unknown run ID", () => {
    const run = getRunById(runsDir, "run-999");
    assert.equal(run, null);
  });

  test("returns null for non-existent directory", () => {
    const run = getRunById("/does/not/exist", "run-001");
    assert.equal(run, null);
  });
});

// ── getResumableRuns ───────────────────────────────────────────────────────

describe("getResumableRuns", () => {
  test("returns only failed and paused_for_review runs", () => {
    const resumable = getResumableRuns(runsDir);
    assert.equal(resumable.length, 2);
    for (const run of resumable) {
      assert.ok(
        (RESUMABLE_STATUSES as readonly string[]).includes(run.status),
        `unexpected status: ${run.status}`
      );
    }
  });

  test("does not include completed runs", () => {
    const resumable = getResumableRuns(runsDir);
    assert.ok(!resumable.some((r) => r.status === "completed"));
  });
});

// ── formatRunLabel ─────────────────────────────────────────────────────────

describe("formatRunLabel", () => {
  test("includes run_id", () => {
    const label = formatRunLabel(makeRun({ run_id: "run-abc" }));
    assert.ok(label.includes("run-abc"));
  });

  test("includes status", () => {
    const label = formatRunLabel(makeRun({ status: "completed" }));
    assert.ok(label.includes("completed"));
  });

  test("includes task count", () => {
    const run = makeRun({ tasks_executed: [{ task_id: "t1", outcome: "ok", engine: "e", fallback_taken: false, start_time: "", end_time: "", notes: [] }] });
    const label = formatRunLabel(run);
    assert.ok(label.includes("1 task"));
  });

  test("includes date portion of start_time", () => {
    const label = formatRunLabel(makeRun({ start_time: "2025-06-15T08:30:00Z" }));
    assert.ok(label.includes("2025-06-15"));
  });
});
