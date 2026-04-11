/**
 * packages/vscode/src/test/task-control.test.ts
 *
 * Tests for src/lib/task-control.ts.
 *
 * Run: tsx --test packages/vscode/src/test/task-control.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatTaskReviewError,
  runTaskPromoteWorkflow,
  runTaskRequeueWorkflow,
  runTaskReviewWorkflow,
} from "../lib/task-control.js";

describe("runTaskPromoteWorkflow", () => {
  test("promotes a ready task to doing and refreshes on success", () => {
    let changed = false;

    const result = runTaskPromoteWorkflow(
      {
        task: "tasks/ready/factory-177.md",
        label: "factory-177",
        fromStage: "ready",
      },
      {
        factoryRoot: "/workspace",
        moveTaskImpl: () => ({
          ok: true,
          fromPath: "/workspace/tasks/ready/factory-177.md",
          toPath: "/workspace/tasks/doing/factory-177.md",
          fromStatus: "ready",
          toStatus: "doing",
        }),
        onChanged: () => {
          changed = true;
        },
      }
    );

    assert.deepEqual(result, {
      ok: true,
      message: "Devory: promoted factory-177 → doing.",
    });
    assert.equal(changed, true);
  });
});

describe("runTaskReviewWorkflow", () => {
  test("returns a friendly invalid-context error when a task is not in review", () => {
    const result = runTaskReviewWorkflow(
      {
        task: "tasks/doing/factory-177.md",
        label: "factory-177",
        action: "approve",
      },
      {
        factoryRoot: "/workspace",
        applyReviewActionImpl: () => ({
          ok: false,
          error: "Task factory-177 must be in review before review actions can run",
        }),
      }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /review action failed/);
    assert.match(result.error, /must be in review/);
  });
});

describe("runTaskRequeueWorkflow", () => {
  test("requeues a blocked task to ready", () => {
    const result = runTaskRequeueWorkflow(
      {
        task: "tasks/blocked/factory-177.md",
        label: "factory-177",
        fromStage: "blocked",
      },
      {
        factoryRoot: "/workspace",
        moveTaskImpl: () => ({
          ok: true,
          fromPath: "/workspace/tasks/blocked/factory-177.md",
          toPath: "/workspace/tasks/ready/factory-177.md",
          fromStatus: "blocked",
          toStatus: "ready",
        }),
      }
    );

    assert.deepEqual(result, {
      ok: true,
      message: "Devory: requeued factory-177 → ready.",
    });
  });

  test("restores an archived task to backlog when requested", () => {
    const result = runTaskRequeueWorkflow(
      {
        task: "tasks/archived/factory-177.md",
        label: "factory-177",
        fromStage: "archived",
        toStage: "backlog",
      },
      {
        factoryRoot: "/workspace",
        moveTaskImpl: () => ({
          ok: true,
          fromPath: "/workspace/tasks/archived/factory-177.md",
          toPath: "/workspace/tasks/backlog/factory-177.md",
          fromStatus: "archived",
          toStatus: "backlog",
        }),
      }
    );

    assert.deepEqual(result, {
      ok: true,
      message: "Devory: requeued factory-177 → backlog.",
    });
  });
});

describe("formatTaskReviewError", () => {
  test("includes validation details when present", () => {
    const message = formatTaskReviewError({
      ok: false,
      error: "Validation failed",
      validationErrors: ["reason is required for block action"],
    });

    assert.match(message, /review action failed/);
    assert.match(message, /Validation failed/);
    assert.match(message, /reason is required/);
  });

  test("returns a queued approval message when governance mode defers the action", () => {
    const result = runTaskReviewWorkflow(
      {
        task: "tasks/review/factory-177.md",
        label: "factory-177",
        action: "approve",
      },
      {
        factoryRoot: "/workspace",
        applyReviewActionImpl: () => ({
          ok: true,
          taskId: "factory-177",
          fromPath: "/workspace/tasks/review/factory-177.md",
          toPath: "/workspace/tasks/review/factory-177.md",
          fromStatus: "review",
          toStatus: "done",
          executionMode: "governance-queued",
          transitionArtifactPath: null,
          reviewArtifactPath: "/workspace/runs/review.md",
          governanceCommandPath: "/workspace/.devory/commands/pending/cmd.json",
        }),
      }
    );

    assert.deepEqual(result, {
      ok: true,
      message: "Devory: queued approval for factory-177.",
    });
  });
});
