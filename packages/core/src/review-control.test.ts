import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_CONTROL_MECHANISMS,
  REVIEW_CONTROL_CONTRACT_VERSION,
  TASK_REVIEW_ACTIONS,
  buildRunAttentionQueueItem,
  buildTaskReviewQueueItem,
  buildTaskTriageQueueItem,
  getSupportedReviewActions,
  normalizeReviewQueueItem,
} from "./review-control.ts";

describe("review control contract", () => {
  test("builds and normalizes a task review queue item", () => {
    const item = buildTaskReviewQueueItem({
      task_id: "factory-170",
      title: "Define review queue contract",
      summary: "Awaiting approval after implementation and tests.",
      run_id: "run-170",
    });

    assert.equal(item.version, REVIEW_CONTROL_CONTRACT_VERSION);
    assert.deepEqual(item.supported_actions, TASK_REVIEW_ACTIONS);
    assert.equal(item.source.stage, "review");
    assert.deepEqual(normalizeReviewQueueItem(item), item);
  });

  test("builds and normalizes a run attention item", () => {
    const item = buildRunAttentionQueueItem({
      run_id: "run-170",
      title: "Resume unattended run",
      summary: "Checkpoint exists after a paused review interruption.",
      status: "paused_for_review",
      task_id: "factory-170",
    });

    assert.deepEqual(item.supported_actions, ["resume-run"]);
    assert.equal(item.source.authority, "run-ledger");
    assert.equal(item.attention_state, "paused_for_review");
    assert.deepEqual(normalizeReviewQueueItem(item), item);
  });

  test("builds and normalizes a blocked task triage item", () => {
    const item = buildTaskTriageQueueItem({
      task_id: "factory-171",
      title: "Investigate blocked task",
      summary: "Blocked by unresolved human question.",
      run_id: "run-171",
    });

    assert.deepEqual(item.supported_actions, []);
    assert.equal(item.source.stage, "blocked");
    assert.deepEqual(normalizeReviewQueueItem(item), item);
  });

  test("publishes supported actions by queue kind", () => {
    assert.deepEqual(getSupportedReviewActions("task-review"), [
      "approve",
      "send-back",
      "block",
    ]);
    assert.deepEqual(getSupportedReviewActions("run-attention"), ["resume-run"]);
    assert.deepEqual(getSupportedReviewActions("task-triage"), []);
  });

  test("documents workflow mechanism mapping for v1 actions", () => {
    assert.equal(
      REVIEW_CONTROL_MECHANISMS.approve.api_route,
      "/api/task/review-action"
    );
    assert.equal(
      REVIEW_CONTROL_MECHANISMS["resume-run"].cli_equivalent,
      "devory run --resume <run-id>"
    );
  });

  test("rejects malformed queue items", () => {
    assert.equal(
      normalizeReviewQueueItem({
        kind: "run-attention",
        item_id: "run-attention:run-170",
        title: "Broken item",
        summary: "Missing run id and source details.",
        attention_state: "failed",
        supported_actions: ["resume-run"],
      }),
      null
    );
  });
});
