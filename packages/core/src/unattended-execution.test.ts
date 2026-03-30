import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeUnattendedExecutionSnapshot,
  UNATTENDED_EXECUTION_CONTRACT_VERSION,
} from "./unattended-execution.ts";

describe("normalizeUnattendedExecutionSnapshot", () => {
  test("keeps healthy active snapshots intact", () => {
    const snapshot = normalizeUnattendedExecutionSnapshot({
      run_id: "run-healthy",
      status: "active",
      worker_health: "healthy",
      durable_source: "run_record",
      transient_adapter_state: "tool:apply_patch",
      heartbeat: {
        captured_at: "2026-03-28T12:00:30.000Z",
        age_ms: 1_500,
        progress_sequence: 14,
        active_task_id: "factory-158",
        lane_id: "default",
        tool_name: "apply_patch",
        adapter_session_id: "adapter-1",
      },
      progress: {
        latest_event_id: "evt-14",
        latest_event_at: "2026-03-28T12:00:29.000Z",
        sequence: 14,
        category: "file_mutation",
        summary: "Updated core contract files.",
      },
      checkpoint: {
        artifact_path: "artifacts/execution/run-healthy/checkpoint.json",
        checkpoint_id: "checkpoint-1",
        captured_at: "2026-03-28T12:00:00.000Z",
        source_run_id: "run-healthy",
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
    });

    assert.ok(snapshot);
    assert.equal(snapshot?.version, UNATTENDED_EXECUTION_CONTRACT_VERSION);
    assert.equal(snapshot?.status, "active");
    assert.equal(snapshot?.worker_health, "healthy");
    assert.equal(snapshot?.heartbeat.progress_sequence, 14);
    assert.equal(snapshot?.progress.category, "file_mutation");
  });

  test("normalizes stalled snapshots conservatively", () => {
    const snapshot = normalizeUnattendedExecutionSnapshot({
      run_id: "run-stalled",
      status: "stalled",
      worker_health: "stalled",
      durable_source: "artifact",
      heartbeat: {
        captured_at: "2026-03-28T12:05:00.000Z",
        age_ms: 180000,
      },
      progress: {
        latest_event_id: "evt-22",
        latest_event_at: "2026-03-28T12:02:00.000Z",
        sequence: 22,
        category: "tool_activity",
        summary: "Tool call timed out waiting for output.",
      },
      recovery: {
        state: "failed",
        attempts: 2,
        last_attempt_at: "2026-03-28T12:04:30.000Z",
        resumed_run_id: null,
        failover_run_id: null,
        reason: "Heartbeat exceeded stall threshold.",
      },
      escalation: {
        required: true,
        reason: "stall_detected",
        summary: "Worker stopped making forward progress.",
        triggered_at: "2026-03-28T12:05:00.000Z",
      },
    });

    assert.ok(snapshot);
    assert.equal(snapshot?.durable_source, "artifact");
    assert.equal(snapshot?.status, "stalled");
    assert.equal(snapshot?.worker_health, "stalled");
    assert.equal(snapshot?.recovery.state, "failed");
    assert.equal(snapshot?.escalation.reason, "stall_detected");
    assert.equal(snapshot?.checkpoint.checkpoint_id, null);
  });

  test("captures recovered snapshots and rejects missing run ids", () => {
    const snapshot = normalizeUnattendedExecutionSnapshot({
      run_id: "run-recovered",
      status: "active",
      worker_health: "recovering",
      checkpoint: {
        artifact_path: "artifacts/execution/run-recovered/checkpoint.json",
        checkpoint_id: "checkpoint-7",
        captured_at: "2026-03-28T12:06:00.000Z",
        source_run_id: "run-original",
        resumed_from_run_id: "run-original",
      },
      recovery: {
        state: "succeeded",
        attempts: 1,
        last_attempt_at: "2026-03-28T12:06:15.000Z",
        resumed_run_id: "run-recovered",
        failover_run_id: null,
        reason: "Recovered from checkpoint after adapter restart.",
      },
    });

    assert.ok(snapshot);
    assert.equal(snapshot?.worker_health, "recovering");
    assert.equal(snapshot?.checkpoint.resumed_from_run_id, "run-original");
    assert.equal(snapshot?.recovery.state, "succeeded");
    assert.equal(
      normalizeUnattendedExecutionSnapshot({
        status: "active",
      }),
      null
    );
  });
});
