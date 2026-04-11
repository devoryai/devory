import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  COMMAND_OUTCOME_STATUSES,
  GOVERNANCE_COMMAND_TYPES,
  isOverrideCommand,
  parseGovernanceCommandEnvelope,
  isRunScopedCommand,
  isTaskScopedCommand,
  validateGovernanceCommandEnvelope,
  type GovernanceCommandEnvelope,
} from "./command-channel.ts";

describe("command channel contract", () => {
  test("publishes all v1 governance command types", () => {
    assert.deepEqual(GOVERNANCE_COMMAND_TYPES, [
      "pause-run",
      "resume-run",
      "requeue-task",
      "approve-task",
      "send-back-task",
      "block-task",
      "assign-reviewer",
      "override-model",
      "override-profile",
    ]);
  });

  test("publishes command outcome statuses", () => {
    assert.deepEqual(COMMAND_OUTCOME_STATUSES, [
      "accepted",
      "rejected",
      "deferred",
    ]);
  });

  test("detects override commands", () => {
    const command: GovernanceCommandEnvelope = {
      command_id: "cmd-override-model",
      command_type: "override-model",
      issued_by: "user-123",
      issued_at: "2026-04-03T00:00:00.000Z",
      workspace_id: "workspace-123",
      target_task_id: "factory-371",
      expires_at: "2026-04-04T00:00:00.000Z",
      payload: {
        task_id: "factory-371",
        requested_model: "claude-sonnet-4-6",
        justification: "Need higher reasoning depth for compliance logic.",
      },
    };

    assert.equal(isOverrideCommand(command), true);
    assert.equal(isTaskScopedCommand(command), true);
    assert.equal(isRunScopedCommand(command), false);
  });

  test("detects run-scoped commands", () => {
    const command: GovernanceCommandEnvelope = {
      command_id: "cmd-pause-run",
      command_type: "pause-run",
      issued_by: "user-123",
      issued_at: "2026-04-03T00:00:00.000Z",
      workspace_id: "workspace-123",
      target_run_id: "run-123",
      expires_at: "2026-04-04T00:00:00.000Z",
      payload: {},
    };

    assert.equal(isRunScopedCommand(command), true);
    assert.equal(isTaskScopedCommand(command), false);
    assert.equal(isOverrideCommand(command), false);
  });

  test("detects task-scoped commands", () => {
    const command: GovernanceCommandEnvelope = {
      command_id: "cmd-send-back",
      command_type: "send-back-task",
      issued_by: "reviewer-123",
      issued_at: "2026-04-03T00:00:00.000Z",
      workspace_id: "workspace-123",
      target_task_id: "factory-371",
      expires_at: "2026-04-04T00:00:00.000Z",
      payload: {
        task_id: "factory-371",
        reason: "Please split the command module from governance-repo.ts.",
      },
    };

    assert.equal(isTaskScopedCommand(command), true);
    assert.equal(isRunScopedCommand(command), false);
    assert.equal(isOverrideCommand(command), false);
  });

  test("validates a supported governance command envelope", () => {
    const result = validateGovernanceCommandEnvelope({
      command_id: "cmd-approve",
      command_type: "approve-task",
      issued_by: "reviewer-123",
      issued_at: "2026-04-03T00:00:00.000Z",
      workspace_id: "workspace-123",
      target_task_id: "factory-371",
      expires_at: "2026-04-04T00:00:00.000Z",
      payload: {
        task_id: "factory-371",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.command?.command_type, "approve-task");
  });

  test("rejects invalid governance command envelopes", () => {
    const result = validateGovernanceCommandEnvelope({
      command_id: "cmd-send-back",
      command_type: "send-back-task",
      issued_by: "reviewer-123",
      issued_at: "not-a-date",
      workspace_id: "workspace-123",
      expires_at: "2026-04-04T00:00:00.000Z",
      payload: {
        task_id: "factory-371",
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("; "), /issued_at/);
    assert.match(result.errors.join("; "), /payload.reason/);
  });

  test("parseGovernanceCommandEnvelope throws on invalid input", () => {
    assert.throws(
      () => parseGovernanceCommandEnvelope({ command_type: "pause-run" }),
      /invalid governance command envelope/,
    );
  });
});
