import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildRoutingOutcomeEvaluation } from "./routing-evaluation.ts";

describe("buildRoutingOutcomeEvaluation", () => {
  test("approved evidence is marked successful", () => {
    const evaluation = buildRoutingOutcomeEvaluation({
      validation_outcome: "passed",
      review_outcome: "approved",
      manual_intervention: "performed",
    });

    assert.equal(evaluation.evaluation_status, "successful");
    assert.equal(evaluation.evidence_status, "complete");
  });

  test("send-back style evidence is marked unsuccessful", () => {
    const evaluation = buildRoutingOutcomeEvaluation({
      validation_outcome: "passed",
      review_outcome: "send-back",
      manual_intervention: "performed",
    });

    assert.equal(evaluation.evaluation_status, "unsuccessful");
    assert.equal(evaluation.review_outcome, "send-back");
  });

  test("sparse evidence remains inconclusive instead of failing", () => {
    const evaluation = buildRoutingOutcomeEvaluation({
      validation_outcome: null,
      review_outcome: null,
      manual_intervention: null,
    });

    assert.equal(evaluation.evaluation_status, "inconclusive");
    assert.equal(evaluation.evidence_status, "missing");
  });
});
