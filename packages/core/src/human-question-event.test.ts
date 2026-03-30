import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildHumanQuestionFixture } from "./human-question.ts";
import {
  buildHumanQuestionDigest,
  buildHumanQuestionLifecycleEvent,
  parseHumanQuestionLifecycleEvent,
  renderHumanQuestionDigestMarkdown,
  serializeHumanQuestionLifecycleEvent,
} from "./human-question-event.ts";

describe("human question lifecycle events", () => {
  test("renders and parses auditable lifecycle events with downstream links", () => {
    const question = buildHumanQuestionFixture({
      question_id: "hq-145",
      task_id: "factory-145",
      run_id: "orchestrator-run-145",
      status: "answered",
    });
    const event = buildHumanQuestionLifecycleEvent({
      event_type: "resumed",
      question,
      timestamp: "2026-03-28T18:00:00.000Z",
      resumed_run_id: "orchestrator-run-145",
      resulting_task_stage: "ready",
      note: "Resumed after operator answer.",
    });

    assert.equal(event.resumed_run_id, "orchestrator-run-145");
    assert.equal(event.resulting_task_stage, "ready");
    assert.equal(
      parseHumanQuestionLifecycleEvent(serializeHumanQuestionLifecycleEvent(event))?.event_type,
      "resumed"
    );
  });

  test("builds unanswered digest aggregates from open question records", () => {
    const digest = buildHumanQuestionDigest(
      [
        buildHumanQuestionFixture({
          question_id: "hq-open-1",
          run_id: "run-a",
          lane_id: "lane-a",
          interruption_level: "level_1",
          status: "open",
          created_at: "2026-03-28T17:00:00.000Z",
        }),
        buildHumanQuestionFixture({
          question_id: "hq-open-2",
          run_id: "run-a",
          lane_id: "lane-b",
          interruption_level: "level_2",
          status: "open",
          created_at: "2026-03-28T17:30:00.000Z",
        }),
        buildHumanQuestionFixture({
          question_id: "hq-answered",
          status: "answered",
          created_at: "2026-03-28T17:10:00.000Z",
        }),
      ],
      "2026-03-28T18:00:00.000Z"
    );

    assert.equal(digest.total_open_questions, 2);
    assert.equal(digest.by_interruption_level["level_1"], 1);
    assert.equal(digest.by_interruption_level["level_2"], 1);
    assert.equal(digest.by_run_id["run-a"], 2);
    assert.match(renderHumanQuestionDigestMarkdown(digest), /hq-open-1/);
    assert.doesNotMatch(renderHumanQuestionDigestMarkdown(digest), /hq-answered/);
  });
});
