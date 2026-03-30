/**
 * packages/vscode/src/test/task-move.test.ts
 *
 * Tests for src/lib/task-move.ts.
 *
 * Run: tsx --test packages/vscode/src/test/task-move.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatTaskMoveError,
  runTaskMoveWorkflow,
} from "../lib/task-move.js";

describe("formatTaskMoveError", () => {
  test("includes validation errors when present", () => {
    const message = formatTaskMoveError({
      ok: false,
      error: "Validation failed",
      validationErrors: ['Missing required field: "agent"'],
    });

    assert.match(message, /Devory: move failed/);
    assert.match(message, /Validation failed/);
    assert.match(message, /Missing required field: "agent"/);
  });
});

describe("runTaskMoveWorkflow", () => {
  test("returns success and refreshes after a successful move", () => {
    let refreshed = false;

    const result = runTaskMoveWorkflow(
      { task: "tasks/doing/factory-122.md", to: "review", label: "factory-122" },
      {
        factoryRoot: "/workspace",
        moveTaskImpl: () => ({
          ok: true,
          fromPath: "/workspace/tasks/doing/factory-122.md",
          toPath: "/workspace/tasks/review/factory-122.md",
          fromStatus: "doing",
          toStatus: "review",
        }),
        onMoved: () => {
          refreshed = true;
        },
      }
    );

    assert.deepEqual(result, {
      ok: true,
      message: "Devory: moved factory-122 → review.",
    });
    assert.equal(refreshed, true);
  });

  test("returns a formatted error when the move is rejected", () => {
    let refreshed = false;

    const result = runTaskMoveWorkflow(
      { task: "tasks/backlog/factory-122.md", to: "done", label: "factory-122" },
      {
        factoryRoot: "/workspace",
        moveTaskImpl: () => ({
          ok: false,
          error: 'Transition "backlog" → "done" is not allowed.',
        }),
        onMoved: () => {
          refreshed = true;
        },
      }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Devory: move failed/);
    assert.match(result.error, /not allowed/);
    assert.equal(refreshed, false);
  });

  test("passes validation details through the UI-facing error", () => {
    const result = runTaskMoveWorkflow(
      { task: "tasks/ready/factory-122.md", to: "doing", label: "factory-122" },
      {
        factoryRoot: "/workspace",
        moveTaskImpl: () => ({
          ok: false,
          error: "Validation failed",
          validationErrors: ['Missing required field: "agent"'],
        }),
      }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.validationErrors, ['Missing required field: "agent"']);
    assert.match(result.error, /Missing required field: "agent"/);
  });
});
