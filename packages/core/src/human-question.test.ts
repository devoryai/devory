import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildHumanQuestionFixture,
  HUMAN_INTERRUPTION_POLICY_MAP,
  HUMAN_QUESTION_VERSION,
} from "./human-question.ts";

describe("buildHumanQuestionFixture", () => {
  test("builds an open question fixture with stable required fields", () => {
    const question = buildHumanQuestionFixture();

    assert.equal(question.version, HUMAN_QUESTION_VERSION);
    assert.equal(question.status, "open");
    assert.equal(question.answer, null);
    assert.equal(question.audit_trail[0]?.event_type, "opened");
    assert.equal(question.timeout_policy.on_timeout, "assume-default");
  });

  test("builds an answered question fixture with answer payload and audit trail", () => {
    const question = buildHumanQuestionFixture({
      status: "answered",
      updated_at: "2026-03-28T10:05:00.000Z",
    });

    assert.equal(question.status, "answered");
    assert.equal(question.answer?.selected_option_id, "skip-migration");
    assert.equal(question.answer?.answered_by, "operator");
    assert.equal(question.audit_trail.at(-1)?.event_type, "answered");
  });
});

describe("HUMAN_INTERRUPTION_POLICY_MAP", () => {
  test("level_1 continues work without pausing the run", () => {
    const mapping = HUMAN_INTERRUPTION_POLICY_MAP.level_1;
    assert.equal(mapping.work_continues, true);
    assert.equal(mapping.lane_pauses, false);
    assert.equal(mapping.run_status, "running");
  });

  test("level_2 pauses the affected lane using existing review-pause semantics", () => {
    const mapping = HUMAN_INTERRUPTION_POLICY_MAP.level_2;
    assert.equal(mapping.work_continues, true);
    assert.equal(mapping.lane_pauses, true);
    assert.equal(mapping.run_halts, false);
    assert.equal(mapping.run_status, "paused_for_review");
  });

  test("level_3 halts the run", () => {
    const mapping = HUMAN_INTERRUPTION_POLICY_MAP.level_3;
    assert.equal(mapping.work_continues, false);
    assert.equal(mapping.lane_pauses, true);
    assert.equal(mapping.run_halts, true);
    assert.equal(mapping.run_status, "failed");
  });
});
