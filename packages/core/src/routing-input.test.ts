import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeRoutingInput } from "./routing-input.ts";

describe("normalizeRoutingInput", () => {
  test("normalizes deterministic task and runtime signals", () => {
    const input = normalizeRoutingInput(
      {
        id: "factory-130",
        title: "Normalize routing inputs",
        type: "Feature",
        project: "ai-dev-factory",
        repo: ".",
        branch: "task/factory-130",
        required_capabilities: ["coding", "coding", "debugging"],
        preferred_capabilities: ["testing"],
        preferred_models: ["claude-sonnet-4-6"],
        disallowed_models: ["factory-dry-run"],
        execution_profile: "implementation",
        context_intensity: "high",
        quality_priority: "high",
        speed_priority: "medium",
        max_cost_tier: "medium",
        lane: "backend",
        repo_area: "workers",
      },
      {
        execution_mode: "claude",
        stage: "implementation",
        cost_environment: "default",
        retry_attempt: 2,
      }
    );

    assert.equal(input.task_type, "feature");
    assert.equal(input.work_role, "implementation");
    assert.equal(input.execution_mode, "claude");
    assert.deepEqual(input.required_capabilities, ["coding", "debugging"]);
    assert.equal(input.context_intensity, "high");
    assert.equal(input.environment_constraints.retry_attempt, 2);
  });

  test("does not fabricate unsupported signals", () => {
    const input = normalizeRoutingInput({
      id: "factory-001",
      title: "Legacy task",
      project: "ai-dev-factory",
      type: "feature",
    });

    assert.equal(input.language, null);
    assert.equal(input.framework, null);
    assert.equal(input.complexity, null);
    assert.equal(input.risk_level, null);
    assert.equal(input.privacy_sensitivity, null);
    assert.equal(input.work_role, null);
  });
});
