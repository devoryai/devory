import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUnattendedCheckpointArtifact } from "./unattended-checkpoint.ts";

describe("normalizeUnattendedCheckpointArtifact", () => {
  test("normalizes valid checkpoint artifacts", () => {
    const artifact = normalizeUnattendedCheckpointArtifact({
      checkpoint_id: "checkpoint-1",
      run_id: "run-164",
      task_id: "factory-164",
      created_at: "2026-03-29T12:00:00.000Z",
      trigger: "recovery_sensitive_transition",
      current_phase: "invoking-runner",
      current_adapter: "claude",
      current_attempt: 1,
      recent_progress_summary: "Runner invocation started.",
      pending_actions: ["invoke_runner"],
      policy_snapshot: {
        policy: { version: "execution-policy-v1" },
        injection_source: "agent-context",
        applied_layers: ["shipped-defaults"],
        workspace_config_path: null,
      },
      artifact_references: {
        heartbeat_snapshot: "artifacts/heartbeats/run-164.json",
        task_snapshot: "artifacts/execution/factory-164/task-snapshot.md",
        execution_plan: null,
        staging_manifest: null,
        agent_context: null,
        routing_manifest: null,
        execution_result: null,
        retry_context: null,
        review_package: null,
        changed_files: null,
      },
    });

    assert.equal(artifact?.checkpoint_id, "checkpoint-1");
    assert.equal(artifact?.trigger, "recovery_sensitive_transition");
    assert.equal(artifact?.policy_snapshot.injection_source, "agent-context");
  });

  test("rejects artifacts missing required identifiers", () => {
    assert.equal(
      normalizeUnattendedCheckpointArtifact({
        run_id: "run-164",
        created_at: "2026-03-29T12:00:00.000Z",
        current_phase: "invoking-runner",
      }),
      null
    );
  });
});
