import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type {
  ExecutionBindingResult,
  ExecutionRoutingDecision,
} from "@devory/core";
import { renderRunDecisionSummary } from "../lib/run-decision-summary.js";

function makeDecision(
  overrides: Partial<ExecutionRoutingDecision> = {}
): ExecutionRoutingDecision {
  return {
    selected_provider: {
      id: "local_ollama",
      label: "Local model (Ollama)",
      locality: "local",
      cost_profile: "free",
      capability_tier: "standard",
      suitable_task_patterns: ["feature"],
      available: true,
      availability_note: null,
    },
    preference_applied: "auto",
    route_mode: "local-first",
    explanation_bullets: ["Task profile fits local execution", "Local-first policy is active"],
    confidence: "high",
    estimated_cost_impact: "$0.00 (local)",
    decomposition_recommended: false,
    decomposition_note: null,
    alternative_provider: null,
    warnings: [],
    cloud_confirmation_required: false,
    policy_effects: [],
    ...overrides,
  };
}

function makeBinding(
  overrides: Partial<ExecutionBindingResult> = {}
): ExecutionBindingResult {
  return {
    selected_provider_class: "local_ollama",
    execution_path: "local_ollama",
    preference_applied: "auto",
    fallback_taken: false,
    originally_targeted_class: null,
    fallback_reason: null,
    force_local_violated: false,
    warnings: [],
    decomposition_recommended: false,
    decomposition_note: null,
    route_mode: "local-first",
    binding_summary: "summary",
    per_task_bindings: [],
    cloud_confirmation_required: false,
    blocked_by_policy: false,
    policy_block_reason: null,
    policy_effects: [],
    selected_target_id: "ollama:qwen2.5-coder:14b",
    actual_target_id: "ollama:qwen2.5-coder:14b",
    selected_adapter_id: "ollama",
    actual_adapter_id: "ollama",
    adapter_id: "ollama",
    selected_execution_path: "packaged_runner:ollama",
    actual_execution_path: "packaged_runner:ollama",
    adapter_fallback_taken: false,
    adapter_fallback_reason: null,
    adapter_resolution_note: null,
    target_fallback_taken: false,
    target_fallback_reason: null,
    target_resolution: null,
    target_readiness_state: "ready",
    target_readiness_detail: "Ollama target is ready.",
    fallback_cause: "none",
    target_fallback_cause: "none",
    ...overrides,
  } as ExecutionBindingResult;
}

describe("renderRunDecisionSummary", () => {
  test("renders a compact pre-run summary for a normal local launch", () => {
    const summary = renderRunDecisionSummary({
      taskCount: 2,
      preference: "auto",
      representativeDecision: makeDecision(),
      binding: makeBinding(),
    });

    assert.match(summary, /^Run Decision/m);
    assert.match(summary, /Preference: Auto/);
    assert.match(summary, /Selected: Local model \(Ollama\)/);
    assert.match(summary, /Actual: same as selected/);
    assert.match(summary, /Why: Task profile fits local execution/);
    assert.match(summary, /Status: ready to launch/);
  });

  test("shows selected versus actual separately when a fallback changed the route", () => {
    const summary = renderRunDecisionSummary({
      taskCount: 1,
      preference: "auto",
      representativeDecision: makeDecision(),
      binding: makeBinding({
        selected_provider_class: "cloud_premium",
        execution_path: "unavailable_fallback",
        fallback_taken: true,
        originally_targeted_class: "local_ollama",
        fallback_reason: "Local model (Ollama) not available",
        selected_target_id: "ollama:qwen2.5-coder:14b",
        actual_target_id: "cloud:gpt-5-mini",
        selected_adapter_id: "ollama",
        actual_adapter_id: "openai",
        adapter_id: "openai",
        selected_execution_path: "packaged_runner:ollama",
        actual_execution_path: "packaged_runner:openai",
      }),
    });

    assert.match(summary, /Selected: Local model \(Ollama\) -> ollama:qwen2.5-coder:14b via ollama/);
    assert.match(summary, /Actual: Cloud model \(premium API\) -> cloud:gpt-5-mini via openai/);
    assert.match(summary, /Status: fallback applied/);
    assert.match(summary, /Next: Local model \(Ollama\) not available\./);
    assert.match(summary, /Fallback: Local model \(Ollama\) not available/);
  });

  test("surfaces confirmation-required state for cloud execution", () => {
    const summary = renderRunDecisionSummary({
      taskCount: 1,
      preference: "force_cloud",
      representativeDecision: makeDecision({
        selected_provider: {
          id: "cloud_premium",
          label: "Cloud model (premium API)",
          locality: "cloud",
          cost_profile: "high",
          capability_tier: "premium",
          suitable_task_patterns: ["feature"],
          available: true,
          availability_note: null,
        },
        preference_applied: "force_cloud",
        route_mode: "forced-cloud",
        explanation_bullets: ["Task profile needs cloud capability"],
        cloud_confirmation_required: true,
      }),
      binding: makeBinding({
        selected_provider_class: "cloud_premium",
        preference_applied: "force_cloud",
        cloud_confirmation_required: true,
        selected_target_id: "cloud:gpt-5-mini",
        actual_target_id: "cloud:gpt-5-mini",
        selected_adapter_id: "openai",
        actual_adapter_id: "openai",
        adapter_id: "openai",
        selected_execution_path: "packaged_runner:openai",
        actual_execution_path: "packaged_runner:openai",
      }),
    });

    assert.match(summary, /Preference: Force cloud/);
    assert.match(summary, /Status: confirmation required/);
    assert.match(summary, /Next: Waiting for approval before cloud execution\./);
    assert.match(summary, /Why: Task profile needs cloud capability/);
  });

  test("surfaces decomposition and blocked-by-policy states truthfully", () => {
    const summary = renderRunDecisionSummary({
      taskCount: 3,
      preference: "prefer_local",
      representativeDecision: makeDecision({
        explanation_bullets: ["Cloud escalation is disabled by policy"],
      }),
      binding: makeBinding({
        selected_provider_class: "local_ollama",
        blocked_by_policy: true,
        policy_block_reason: "No ready local targets found; cloud escalation is not allowed.",
        decomposition_recommended: true,
        decomposition_note: "Split the broad feature before retrying local execution.",
      }),
    });

    assert.match(summary, /Status: policy block/);
    assert.match(summary, /Next: No ready local targets found; cloud escalation is not allowed\./);
    assert.match(summary, /Note: Split the broad feature before retrying local execution\./);
  });
});
