import "../support/install-command-test-hooks.ts";

import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { resetState, state } from "../support/command-test-state.js";

beforeEach(() => {
  resetState();
});

describe("VS Code review commands", () => {
  test("taskReviewActionCommand approves a direct target in review", async () => {
    state.directTarget = {
      id: "factory-406",
      stage: "review",
      filepath: "/workspace/tasks/review/factory-406.md",
    };
    state.taskReviewResult = { ok: true, message: "Devory: approved factory-406." };

    const { taskReviewActionCommand } = await import("../../commands/task-review-action.ts");
    await taskReviewActionCommand("/workspace", "/workspace/tasks", "approve");

    assert.deepEqual(state.reviewCalls[0], {
      task: "tasks/review/factory-406.md",
      label: "factory-406",
      action: "approve",
      reason: undefined,
    });
    assert.match(state.infoMessages[0] ?? "", /approved factory-406/i);
  });

  test("taskReviewActionCommand collects a block reason before blocking", async () => {
    state.directTarget = {
      id: "factory-406",
      stage: "review",
      filepath: "/workspace/tasks/review/factory-406.md",
    };
    state.inputBoxValues.push("Needs follow-up");

    const { taskReviewActionCommand } = await import("../../commands/task-review-action.ts");
    await taskReviewActionCommand("/workspace", "/workspace/tasks", "block");

    assert.equal(state.reviewCalls[0]?.reason, "Needs follow-up");
  });

  test("taskReviewActionCommand reports when no review tasks are available", async () => {
    const { taskReviewActionCommand } = await import("../../commands/task-review-action.ts");
    await taskReviewActionCommand("/workspace", "/workspace/tasks", "approve");

    assert.match(state.infoMessages[0] ?? "", /no review tasks are waiting/i);
  });

  test("taskReviewCommand opens the selected review task", async () => {
    state.taskLists.set("review", [
      {
        id: "factory-406",
        title: "Review smoke",
        filepath: "/workspace/tasks/review/factory-406.md",
      },
    ]);
    state.quickPickValues.push({
      label: "$(file) factory-406",
      detail: "/workspace/tasks/review/factory-406.md",
    });

    const { taskReviewCommand } = await import("../../commands/task-review.ts");
    await taskReviewCommand("/workspace/tasks");

    assert.deepEqual(state.openedDocuments, ["/workspace/tasks/review/factory-406.md"]);
    assert.equal(state.shownDocuments.length, 1);
  });
});
