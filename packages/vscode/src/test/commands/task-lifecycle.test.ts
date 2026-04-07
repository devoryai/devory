import "../support/install-command-test-hooks.ts";

import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { resetState, state } from "../support/command-test-state.js";

beforeEach(() => {
  resetState();
});

describe("VS Code task lifecycle commands", () => {
  test("taskCreateCommand shows an error when the factory root is missing", async () => {
    const { taskCreateCommand } = await import("../../commands/task-create.ts");

    await taskCreateCommand("");

    assert.match(state.errorMessages[0] ?? "", /factory root not found/i);
  });

  test("taskCreateCommand passes trimmed input to the create workflow", async () => {
    state.inputBoxValues.push("  factory-406  ", "Add smoke tests", "devory-public");
    state.taskCreateResult = { ok: true, openedInEditor: false, filePath: "/workspace/tasks/backlog/factory-406.md" };

    const { taskCreateCommand } = await import("../../commands/task-create.ts");
    await taskCreateCommand("/workspace");

    assert.deepEqual(state.createCalls[0], {
      id: "factory-406",
      title: "Add smoke tests",
      project: "devory-public",
    });
    assert.match(state.infoMessages[0] ?? "", /task factory-406 created/i);
  });

  test("taskMoveCommand routes the selected task to the move workflow", async () => {
    state.taskLists.set("ready", [
      {
        id: "factory-404",
        title: "CLI tests",
        filepath: "/workspace/tasks/ready/factory-404.md",
      },
    ]);
    state.quickPickValues.push(
      { label: "factory-404", detail: "/workspace/tasks/ready/factory-404.md" },
      { label: "doing" }
    );
    state.taskMoveResult = { ok: true, message: "Devory: moved factory-404 → doing." };

    const { taskMoveCommand } = await import("../../commands/task-move.ts");
    await taskMoveCommand("/workspace", "/workspace/tasks");

    assert.deepEqual(state.moveCalls[0], {
      task: "tasks/ready/factory-404.md",
      to: "doing",
      label: "factory-404",
    });
    assert.match(state.infoMessages[0] ?? "", /moved factory-404/i);
  });

  test("taskPromoteCommand promotes a direct target", async () => {
    state.directTarget = {
      id: "factory-406",
      stage: "ready",
      filepath: "/workspace/tasks/ready/factory-406.md",
    };
    state.taskPromoteResult = { ok: true, message: "Devory: promoted factory-406 → doing." };

    const { taskPromoteCommand } = await import("../../commands/task-promote.ts");
    await taskPromoteCommand("/workspace", "/workspace/tasks");

    assert.deepEqual(state.promoteCalls[0], {
      task: "tasks/ready/factory-406.md",
      label: "factory-406",
      fromStage: "ready",
    });
  });

  test("taskArchiveCommand refuses to archive done tasks", async () => {
    state.directTarget = {
      id: "factory-406",
      stage: "done",
      filepath: "/workspace/tasks/done/factory-406.md",
    };

    const { taskArchiveCommand } = await import("../../commands/task-archive.ts");
    await taskArchiveCommand("/workspace", "/workspace/tasks");

    assert.equal(state.moveCalls.length, 0);
    assert.match(state.infoMessages[0] ?? "", /only active tasks can be archived/i);
  });

  test("taskRequeueCommand prompts for archived task target stage", async () => {
    state.directTarget = {
      id: "factory-406",
      stage: "archived",
      filepath: "/workspace/tasks/archived/factory-406.md",
    };
    state.quickPickValues.push({ label: "ready" });
    state.taskRequeueResult = { ok: true, message: "Devory: requeued factory-406 → ready." };

    const { taskRequeueCommand } = await import("../../commands/task-requeue.ts");
    await taskRequeueCommand("/workspace", "/workspace/tasks");

    assert.deepEqual(state.requeueCalls[0], {
      task: "tasks/archived/factory-406.md",
      label: "factory-406",
      fromStage: "archived",
      toStage: "ready",
    });
  });
});
