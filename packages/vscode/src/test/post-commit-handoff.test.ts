import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPostCommitActions,
  selectFirstCommittedTask,
} from "../lib/post-commit-handoff.js";

describe("selectFirstCommittedTask", () => {
  test("prefers the first committed ready task", () => {
    const selected = selectFirstCommittedTask([
      { taskId: "factory-1", stage: "backlog", commitIndex: 0 },
      { taskId: "factory-2", stage: "ready", commitIndex: 1 },
      { taskId: "factory-3", stage: "ready", commitIndex: 2 },
    ]);

    assert.equal(selected?.taskId, "factory-2");
  });

  test("falls back to the first committed backlog task when no ready tasks exist", () => {
    const selected = selectFirstCommittedTask([
      { taskId: "factory-1", stage: "doing", commitIndex: 0 },
      { taskId: "factory-2", stage: "backlog", commitIndex: 1 },
      { taskId: "factory-3", stage: "review", commitIndex: 2 },
    ]);

    assert.equal(selected?.taskId, "factory-2");
  });

  test("falls back to commit order when neither ready nor backlog exists", () => {
    const selected = selectFirstCommittedTask([
      { taskId: "factory-10", stage: "review", commitIndex: 3 },
      { taskId: "factory-11", stage: "doing", commitIndex: 1 },
      { taskId: "factory-12", stage: "blocked", commitIndex: 2 },
    ]);

    assert.equal(selected?.taskId, "factory-11");
  });
});

describe("buildPostCommitActions", () => {
  test("keeps the same compact action set", () => {
    const actions = buildPostCommitActions("ready");
    assert.deepEqual(
      actions.map((action) => action.id),
      ["run-first-task", "reveal-task", "open-show-work"]
    );
  });

  test("explains backlog run behavior honestly", () => {
    const actions = buildPostCommitActions("backlog");
    const runAction = actions.find((action) => action.id === "run-first-task");
    assert.ok(runAction);
    assert.match(runAction.detail, /Promote the selected backlog task/i);
  });

  test("explains non-ready run behavior with a truthful next step", () => {
    const actions = buildPostCommitActions("review");
    const runAction = actions.find((action) => action.id === "run-first-task");
    assert.ok(runAction);
    assert.match(runAction.detail, /move it to ready before running/i);
  });

  test("keeps Show Work action explicit about availability", () => {
    const actions = buildPostCommitActions("ready");
    const showWorkAction = actions.find((action) => action.id === "open-show-work");
    assert.ok(showWorkAction);
    assert.match(showWorkAction.detail, /available without starting a run/i);
  });
});
