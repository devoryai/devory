import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  DRY_RUN_MODEL_PRICING,
  estimateDryRunForTask,
  estimateDryRunForTaskSources,
} from "./dry-run-estimate.ts";

describe("dry-run estimate", () => {
  test("builds a high-confidence estimate when task data and model are known", () => {
    const estimate = estimateDryRunForTask(
      {
        meta: {
          files_likely_affected: [
            "packages/core/src/dry-run-estimate.ts",
            "packages/vscode/src/providers/task-assistant.ts",
          ],
        },
        body: [
          "## Goal",
          "Add a deterministic dry-run estimator.",
          "",
          "## Acceptance Criteria",
          "- Estimate panel appears before run.",
          "- Output includes a cost range.",
          "",
          "## Verification",
          "- npm run test",
          "- npm run build",
        ].join("\n"),
      },
      {
        selected_model_id: "claude-sonnet-4-6",
      }
    );

    assert.equal(estimate.estimate_label, "estimate");
    assert.equal(estimate.model_id, "claude-sonnet-4-6");
    assert.equal(estimate.confidence, "high");
    assert.ok(estimate.estimated_total_tokens.max > estimate.estimated_total_tokens.min);
    assert.ok(estimate.estimated_cost_usd.max >= estimate.estimated_cost_usd.min);
    assert.ok(estimate.reasons.length >= 3);
  });

  test("uses fallback unknown model bucket when model is missing", () => {
    const estimate = estimateDryRunForTask(
      {
        meta: { files_likely_affected: [] },
        body: "## Goal\nPlan work.",
      },
      {}
    );

    assert.equal(estimate.model_id, null);
    assert.equal(estimate.model_display_name, DRY_RUN_MODEL_PRICING["unknown-default-model"].display_name);
    assert.equal(estimate.confidence, "low");
    assert.equal(estimate.runner, "workspace-default-runner");
    assert.ok(
      estimate.reasons.some((reason) => /fallback pricing bucket/i.test(reason)),
      "expected fallback pricing reason for unknown model"
    );
  });

  test("aggregates multiple tasks and suggests a lower-cost option", () => {
    const estimate = estimateDryRunForTaskSources(
      [
        {
          meta: { files_likely_affected: ["apps/devory/app/runs/page.tsx"] },
          body: "## Acceptance Criteria\n- Add pre-run estimate panel.",
        },
        {
          meta: { files_likely_affected: ["packages/vscode/src/providers/task-assistant.ts"] },
          body: "## Verification\n- npm run test",
        },
      ],
      {
        selected_model_id: "gpt-5-mini",
        available_model_ids: ["factory-dry-run", "gpt-5-mini"],
      }
    );

    assert.equal(estimate.factors.task_count, 2);
    assert.equal(estimate.model_id, "gpt-5-mini");
    assert.ok(estimate.lower_cost_suggestion, "expected lower cost suggestion");
    assert.equal(estimate.lower_cost_suggestion?.model_id, "factory-dry-run");
  });

  test("returns zero range when there are no task sources", () => {
    const estimate = estimateDryRunForTaskSources([], {
      selected_model_id: "claude-sonnet-4-6",
    });

    assert.equal(estimate.factors.task_count, 0);
    assert.deepEqual(estimate.estimated_total_tokens, { min: 0, max: 0 });
    assert.deepEqual(estimate.estimated_cost_usd, { min: 0, max: 0 });
    assert.equal(estimate.confidence, "low");
  });
});
