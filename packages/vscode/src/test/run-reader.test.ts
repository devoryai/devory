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

function writeRunRaw(dir: string, filename: string, run: unknown): void {
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
    spend_units_consumed: 0,
    cost_events: [],
    start_time: "2025-01-01T10:00:00Z",
    end_time: "2025-01-01T10:05:00Z",
    routing_ledger: {
      version: "routing-evidence-v1",
      compatibility_mode: "native",
      run_summary: {
        total_tasks: 0,
        tasks_executed_count: 0,
        tasks_remaining_count: 0,
        success_count: 0,
        failure_count: 0,
        review_count: 0,
        fallback_count: 0,
        retry_count: 0,
        engines_used: [],
        providers_used: [],
        models_used: [],
        spend_units_consumed: 0,
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
      },
      outcome_placeholders: {
        requested_by: null,
        operator_summary: null,
        post_run_review: null,
      },
    },
    unattended_execution: null,
    progress_events: [],
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
    assert.equal(runs[0].routing_ledger.version, "routing-evidence-v1");
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
    assert.equal(run!.routing_ledger.compatibility_mode, "native");
  });

  test("returns null for unknown run ID", () => {
    const run = getRunById(runsDir, "run-999");
    assert.equal(run, null);
  });

  test("returns null for non-existent directory", () => {
    const run = getRunById("/does/not/exist", "run-001");
    assert.equal(run, null);
  });

  test("normalizes sparse legacy run records from disk safely", () => {
    writeRunRaw(runsDir, "2025-01-04T10-run-004.json", {
      run_id: "run-004",
      status: "failed",
      task_queue: ["factory-168"],
      tasks_executed: [
        {
          task_id: "factory-168",
          outcome: "failure",
          engine: "claude",
          fallback_taken: false,
          start_time: "2025-01-04T10:00:00Z",
          end_time: "2025-01-04T10:01:00Z",
          notes: ["retry policy exhausted"],
        },
      ],
      failure: {
        task_id: "factory-168",
        reason: "retry policy exhausted",
        timestamp: "2025-01-04T10:01:00Z",
      },
      start_time: "2025-01-04T10:00:00Z",
      end_time: "2025-01-04T10:01:00Z",
    });

    const run = getRunById(runsDir, "run-004");
    assert.ok(run);
    assert.equal(run?.routing_ledger.compatibility_mode, "legacy-normalized");
    assert.equal(run?.unattended_execution, null);
    assert.deepEqual(run?.progress_events, []);
  });
});

// ── getResumableRuns ───────────────────────────────────────────────────────

describe("getResumableRuns", () => {
  test("returns only failed and paused_for_review runs", () => {
    const resumable = getResumableRuns(runsDir);
    assert.ok(resumable.length >= 2);
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

  test("prefers unattended execution status when present", () => {
    const label = formatRunLabel(
      makeRun({
        status: "running",
        unattended_execution: {
          version: "unattended-execution-v1",
          run_id: "run-001",
          status: "waiting_on_tool",
          worker_health: "healthy",
          durable_source: "run_record",
          transient_adapter_state: null,
          heartbeat: {
            captured_at: null,
            age_ms: null,
            progress_sequence: null,
            active_task_id: null,
            lane_id: null,
            tool_name: null,
            adapter_session_id: null,
          },
          progress: {
            latest_event_id: null,
            latest_event_at: null,
            sequence: null,
            category: null,
            summary: null,
          },
          checkpoint: {
            artifact_path: null,
            checkpoint_id: null,
            captured_at: null,
            source_run_id: null,
            resumed_from_run_id: null,
          },
          recovery: {
            state: "not_attempted",
            attempts: 0,
            last_attempt_at: null,
            resumed_run_id: null,
            failover_run_id: null,
            reason: null,
          },
          escalation: {
            required: false,
            reason: null,
            summary: null,
            triggered_at: null,
          },
        },
      })
    );
    assert.ok(label.includes("waiting_on_tool"));
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

  test("reads persisted unattended recovery status after writing a run to disk", () => {
    writeRun(
      runsDir,
      "2025-01-05T10-run-005.json",
      makeRun({
        run_id: "run-005",
        status: "running",
        unattended_execution: {
          version: "unattended-execution-v1",
          run_id: "run-005",
          status: "blocked_on_human",
          worker_health: "lagging",
          durable_source: "run_record",
          transient_adapter_state: "awaiting-human",
          heartbeat: {
            captured_at: "2025-01-05T10:01:00Z",
            age_ms: 0,
            progress_sequence: 4,
            active_task_id: "factory-168",
            lane_id: null,
            tool_name: "openai",
            adapter_session_id: null,
          },
          progress: {
            latest_event_id: "evt-4",
            latest_event_at: "2025-01-05T10:01:00Z",
            sequence: 4,
            category: "escalation",
            summary: "Retry policy exhausted for factory-168.",
          },
          checkpoint: {
            artifact_path: "artifacts/execution/factory-168/checkpoints/cp-168.json",
            checkpoint_id: "cp-168",
            captured_at: "2025-01-05T10:00:30Z",
            source_run_id: "run-004",
            resumed_from_run_id: "run-004",
          },
          recovery: {
            state: "failed",
            attempts: 3,
            last_attempt_at: "2025-01-05T10:01:00Z",
            resumed_run_id: "run-005",
            failover_run_id: null,
            reason: "Retry policy exhausted for factory-168.",
          },
          escalation: {
            required: true,
            reason: "retry_exhausted",
            summary: "Retry policy exhausted for factory-168.",
            triggered_at: "2025-01-05T10:01:00Z",
          },
        },
      })
    );

    const run = getRunById(runsDir, "run-005");
    const label = formatRunLabel(run!);

    assert.ok(label.includes("blocked_on_human"));
    assert.ok(label.includes("run-005"));
  });
});
