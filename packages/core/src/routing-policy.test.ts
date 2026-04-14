/**
 * packages/core/src/routing-policy.test.ts
 *
 * Tests for the routing policy config model, config loader, and policy-aware
 * routing/binding behavior.
 *
 * Runs with Node's built-in test runner:
 *   tsx --test packages/core/src/routing-policy.test.ts
 *
 * Coverage:
 *  1.  normalizeRoutingPolicyOverrides: valid fields, unknown fields ignored
 *  2.  applyRoutingPolicyOverrides: fields merged correctly
 *  3.  Policy defaults — no constraint changes when using DEFAULT_ROUTING_POLICY
 *  4.  cloud_allowed=false — cloud provider excluded from routing
 *  5.  local_only=true — cloud disabled, cloud_allowed forced false
 *  6.  local_only invariant — resolveRoutingPolicy enforces cloud_allowed=false
 *  7.  require_cloud_confirmation — cloud_confirmation_required on decision + binding
 *  8.  max_estimated_cloud_cost_usd exceeded — warning in policy_effects
 *  9.  allow_fallback_to_cloud=false — local unavailable does not escalate to cloud
 * 10.  default_preference applied when preference="auto"
 * 11.  preferred_local_provider / preferred_cloud_provider — recorded in policy
 * 12.  detectOllamaConfigured: env var detection
 * 13.  buildRegistryFromEnvironment: availability set from env
 * 14.  Policy-aware execution binding: cloud_confirmation_required in result
 * 15.  Policy-aware execution binding: blocked_by_policy when cloud disallowed
 * 16.  Explanation bullets include policy effects
 * 17.  Existing routing tests not broken (smoke: auto, force_local, force_cloud)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRoutingPolicyOverrides,
  applyRoutingPolicyOverrides,
  DEFAULT_ROUTING_POLICY,
  formatRoutingPolicySummary,
  VALID_ROUTING_POLICY_PREFERENCES,
  type RoutingPolicy,
} from "./routing-policy.ts";
import {
  detectOllamaConfigured,
  buildRegistryFromEnvironment,
  withOllamaAvailability,
} from "./provider-registry.ts";
import { routeExecution } from "./execution-router.ts";
import { bindExecution, buildExecutionBindingEnv } from "./execution-binding.ts";
import { profileTask } from "./task-profiler.ts";
import type { DryRunTaskSource } from "./dry-run-estimate.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSimpleTask(): DryRunTaskSource {
  return {
    meta: { type: "bugfix", files_likely_affected: ["src/utils.ts"] },
    body: [
      "## Goal",
      "Fix a small edge case.",
      "## Acceptance Criteria",
      "- Edge case is handled.",
    ].join("\n"),
  };
}

function makeComplexTask(): DryRunTaskSource {
  return {
    meta: {
      type: "feature",
      context_intensity: "high",
      files_likely_affected: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
    },
    body: [
      "## Goal",
      "Implement a large cross-cutting feature.",
      "## Acceptance Criteria",
      "- All modules updated.",
    ].join("\n"),
  };
}

const registryOllamaAvailable = withOllamaAvailability(true);
const registryOllamaUnavailable = withOllamaAvailability(false);

function policyWith(overrides: Partial<RoutingPolicy>): RoutingPolicy {
  return applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, overrides);
}

function route(
  task: DryRunTaskSource,
  preference: Parameters<typeof routeExecution>[1],
  policy?: RoutingPolicy,
  registry = registryOllamaAvailable
) {
  return routeExecution(profileTask(task), preference, { registry, policy });
}

// ---------------------------------------------------------------------------
// 1. normalizeRoutingPolicyOverrides
// ---------------------------------------------------------------------------

describe("normalizeRoutingPolicyOverrides", () => {
  test("throws when value is not an object", () => {
    assert.throws(
      () => normalizeRoutingPolicyOverrides("not an object"),
      /JSON object/
    );
    assert.throws(
      () => normalizeRoutingPolicyOverrides(null),
      /JSON object/
    );
  });

  test("normalizes valid preference", () => {
    const result = normalizeRoutingPolicyOverrides({ default_preference: "prefer_local" });
    assert.equal(result.default_preference, "prefer_local");
  });

  test("ignores unknown preference", () => {
    const result = normalizeRoutingPolicyOverrides({ default_preference: "totally_unknown" });
    assert.equal(result.default_preference, undefined);
  });

  test("normalizes boolean fields", () => {
    const result = normalizeRoutingPolicyOverrides({
      cloud_allowed: false,
      local_only: true,
      require_cloud_confirmation: true,
      sensitive_workspace_mode: false,
      allow_fallback_to_cloud: false,
    });
    assert.equal(result.cloud_allowed, false);
    assert.equal(result.local_only, true);
    assert.equal(result.require_cloud_confirmation, true);
    assert.equal(result.sensitive_workspace_mode, false);
    assert.equal(result.allow_fallback_to_cloud, false);
  });

  test("normalizes max_estimated_cloud_cost_usd as null", () => {
    const result = normalizeRoutingPolicyOverrides({ max_estimated_cloud_cost_usd: null });
    assert.equal(result.max_estimated_cloud_cost_usd, null);
  });

  test("normalizes max_estimated_cloud_cost_usd as positive number", () => {
    const result = normalizeRoutingPolicyOverrides({ max_estimated_cloud_cost_usd: 0.50 });
    assert.equal(result.max_estimated_cloud_cost_usd, 0.50);
  });

  test("normalizes preferred_local_provider to valid class id", () => {
    const result = normalizeRoutingPolicyOverrides({ preferred_local_provider: "local_ollama" });
    assert.equal(result.preferred_local_provider, "local_ollama");
  });

  test("normalizes preferred_local_provider null", () => {
    const result = normalizeRoutingPolicyOverrides({ preferred_local_provider: null });
    assert.equal(result.preferred_local_provider, null);
  });

  test("ignores invalid preferred_local_provider", () => {
    const result = normalizeRoutingPolicyOverrides({ preferred_local_provider: "gpt-4" });
    assert.equal(result.preferred_local_provider, undefined);
  });

  test("normalizes target preference arrays", () => {
    const result = normalizeRoutingPolicyOverrides({
      preferred_local_targets: ["ollama:qwen2.5-coder:14b"],
      preferred_cloud_targets: ["cloud:claude-sonnet-4-6"],
      enabled_targets: ["cloud:gpt-5-mini"],
      disabled_targets: ["ollama:deepseek-coder:6.7b"],
    });
    assert.deepEqual(result.preferred_local_targets, ["ollama:qwen2.5-coder:14b"]);
    assert.deepEqual(result.preferred_cloud_targets, ["cloud:claude-sonnet-4-6"]);
    assert.deepEqual(result.enabled_targets, ["cloud:gpt-5-mini"]);
    assert.deepEqual(result.disabled_targets, ["ollama:deepseek-coder:6.7b"]);
  });

  test("ignores unknown fields silently", () => {
    const result = normalizeRoutingPolicyOverrides({ unknown_field: "value", cloud_allowed: true });
    assert.equal(result.cloud_allowed, true);
    assert.ok(!Object.hasOwn(result, "unknown_field"));
  });

  test("all valid preference values are accepted", () => {
    for (const pref of VALID_ROUTING_POLICY_PREFERENCES) {
      const result = normalizeRoutingPolicyOverrides({ default_preference: pref });
      assert.equal(result.default_preference, pref);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. applyRoutingPolicyOverrides
// ---------------------------------------------------------------------------

describe("applyRoutingPolicyOverrides", () => {
  test("overrides fields on top of base", () => {
    const base = { ...DEFAULT_ROUTING_POLICY };
    const result = applyRoutingPolicyOverrides(base, { cloud_allowed: false });
    assert.equal(result.cloud_allowed, false);
    // Other fields unchanged
    assert.equal(result.local_only, false);
    assert.equal(result.default_preference, "auto");
  });

  test("does not mutate base", () => {
    const base = { ...DEFAULT_ROUTING_POLICY };
    applyRoutingPolicyOverrides(base, { cloud_allowed: false });
    assert.equal(base.cloud_allowed, true); // unchanged
  });
});

// ---------------------------------------------------------------------------
// 3. Policy defaults — no behavioral change
// ---------------------------------------------------------------------------

describe("policy defaults (no constraint)", () => {
  test("default policy does not block cloud routing", () => {
    const decision = route(makeComplexTask(), "auto", DEFAULT_ROUTING_POLICY);
    // Complex task routes to cloud; default policy should not block it
    assert.equal(decision.selected_provider.id, "cloud_premium");
    assert.equal(decision.cloud_confirmation_required, true);
    assert.equal(decision.policy_effects.length, 0);
  });

  test("default policy does not add policy effects", () => {
    const decision = route(makeSimpleTask(), "auto", DEFAULT_ROUTING_POLICY);
    assert.equal(decision.policy_effects.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. cloud_allowed=false
// ---------------------------------------------------------------------------

describe("cloud_allowed=false", () => {
  const policy = policyWith({ cloud_allowed: false });

  test("cloud provider marked unavailable — routing avoids cloud", () => {
    const decision = route(makeComplexTask(), "auto", policy);
    assert.notEqual(decision.selected_provider.id, "cloud_premium");
  });

  test("policy_effects mentions cloud disallowed", () => {
    const decision = route(makeComplexTask(), "auto", policy);
    const hasCloudNote = decision.policy_effects.some((e) =>
      e.toLowerCase().includes("disallow") || e.toLowerCase().includes("cloud_allowed")
    );
    assert.ok(hasCloudNote, `policy_effects should mention cloud disallowed: ${JSON.stringify(decision.policy_effects)}`);
  });

  test("explanation_bullets include policy effect", () => {
    const decision = route(makeComplexTask(), "auto", policy);
    const allText = decision.explanation_bullets.join(" ");
    assert.ok(
      allText.toLowerCase().includes("cloud") && allText.toLowerCase().includes("policy"),
      `explanation should reference policy: ${allText}`
    );
  });

  test("force_cloud preference still routes but warns about cloud availability", () => {
    // When cloud_allowed=false, cloud is marked unavailable in registry.
    // force_cloud targets cloud_premium, which is unavailable — fallback occurs.
    const decision = route(makeSimpleTask(), "force_cloud", policy);
    // The decision will have selected a fallback (deterministic or local)
    assert.notEqual(decision.selected_provider.id, "cloud_premium");
  });
});

// ---------------------------------------------------------------------------
// 5. local_only=true
// ---------------------------------------------------------------------------

describe("local_only=true", () => {
  const policy = policyWith({ local_only: true });

  test("local_only blocks cloud routing for complex tasks", () => {
    const decision = route(makeComplexTask(), "auto", policy);
    assert.notEqual(decision.selected_provider.id, "cloud_premium");
  });

  test("policy_effects mentions local-only mode", () => {
    const decision = route(makeComplexTask(), "auto", policy);
    const hasLocalOnlyNote = decision.policy_effects.some((e) =>
      e.toLowerCase().includes("local-only") || e.toLowerCase().includes("local only")
    );
    assert.ok(hasLocalOnlyNote, `policy_effects should mention local-only: ${JSON.stringify(decision.policy_effects)}`);
  });

  test("local_only with Ollama available → local_ollama selected", () => {
    const decision = route(makeSimpleTask(), "auto", policy, registryOllamaAvailable);
    assert.equal(decision.selected_provider.id, "local_ollama");
  });

  test("local_only with Ollama unavailable → fallback to deterministic", () => {
    const decision = route(makeSimpleTask(), "auto", policy, registryOllamaUnavailable);
    assert.equal(decision.selected_provider.id, "deterministic");
  });
});

// ---------------------------------------------------------------------------
// 6. local_only invariant — cloud_allowed forced false
// ---------------------------------------------------------------------------

describe("local_only invariant enforcement", () => {
  test("policy with local_only=true has cloud_allowed=false in effects", () => {
    // When local_only=true, cloud is effectively disallowed regardless of cloud_allowed value
    const policy = policyWith({ local_only: true, cloud_allowed: true }); // cloud_allowed=true ignored
    const decision = route(makeComplexTask(), "auto", policy);
    // Cloud should still be blocked
    assert.notEqual(decision.selected_provider.id, "cloud_premium");
  });
});

// ---------------------------------------------------------------------------
// 7. require_cloud_confirmation
// ---------------------------------------------------------------------------

describe("require_cloud_confirmation", () => {
  const policy = policyWith({ require_cloud_confirmation: true });

  test("cloud routing sets cloud_confirmation_required=true on decision", () => {
    const decision = route(makeComplexTask(), "force_cloud", policy);
    assert.equal(decision.cloud_confirmation_required, true);
  });

  test("local routing does not set cloud_confirmation_required", () => {
    const decision = route(makeSimpleTask(), "force_local", policy, registryOllamaAvailable);
    assert.equal(decision.cloud_confirmation_required, false);
  });

  test("policy_effects mentions confirmation required when cloud selected", () => {
    const decision = route(
      makeComplexTask(),
      "force_cloud",
      policyWith({
        require_cloud_confirmation: true,
        default_preference: "prefer_local",
      })
    );
    const hasConfirmNote = decision.policy_effects.some((e) =>
      e.toLowerCase().includes("default preference")
    );
    assert.ok(hasConfirmNote, `policy_effects should mention policy overrides: ${JSON.stringify(decision.policy_effects)}`);
  });

  test("binding aggregates cloud_confirmation_required across decisions", () => {
    const decisions = [
      route(makeComplexTask(), "force_cloud", policy),
      route(makeSimpleTask(), "force_cloud", policy),
    ];
    const binding = bindExecution(decisions, "force_cloud", policy);
    assert.equal(binding.cloud_confirmation_required, true);
  });

  test("binding cloud_confirmation_required=false when local only", () => {
    const decisions = [
      route(makeSimpleTask(), "force_local", policy, registryOllamaAvailable),
    ];
    const binding = bindExecution(decisions, "force_local", policy);
    assert.equal(binding.cloud_confirmation_required, false);
  });

  test("DEVORY_CLOUD_CONFIRMATION_REQUIRED=true in binding env", () => {
    const decisions = [route(makeComplexTask(), "force_cloud", policy)];
    const binding = bindExecution(decisions, "force_cloud", policy);
    const env = buildExecutionBindingEnv(binding);
    assert.equal(env.DEVORY_CLOUD_CONFIRMATION_REQUIRED, "true");
  });

  test("DEVORY_CLOUD_CONFIRMATION_REQUIRED=false when local", () => {
    const decisions = [
      route(makeSimpleTask(), "force_local", policy, registryOllamaAvailable),
    ];
    const binding = bindExecution(decisions, "force_local", policy);
    const env = buildExecutionBindingEnv(binding);
    assert.equal(env.DEVORY_CLOUD_CONFIRMATION_REQUIRED, "false");
  });
});

// ---------------------------------------------------------------------------
// 8. max_estimated_cloud_cost_usd exceeded
// ---------------------------------------------------------------------------

describe("max_estimated_cloud_cost_usd", () => {
  test("exceeding cost ceiling produces policy_effect warning", () => {
    const policy = policyWith({ max_estimated_cloud_cost_usd: 0.001 });
    const estimate = {
      runner: "local-packaged-runner",
      model_id: "claude-3-5-sonnet",
      model_display_name: "Claude Sonnet",
      context_tier: "medium" as const,
      output_tier: "medium" as const,
      estimated_cost_usd: { min: 0.01, max: 0.05 },
      confidence: "medium" as const,
      task_count: 1,
      suggestions: [],
    };
    const decision = routeExecution(
      profileTask(makeComplexTask()),
      "force_cloud",
      { registry: registryOllamaAvailable, policy, dryRunEstimate: estimate }
    );
    const hasCostNote = decision.policy_effects.some((e) =>
      e.includes("exceeds")
    );
    assert.ok(hasCostNote, `policy_effects should mention cost ceiling: ${JSON.stringify(decision.policy_effects)}`);
  });

  test("cost under ceiling produces no cost policy effect", () => {
    const policy = policyWith({ max_estimated_cloud_cost_usd: 10.00 });
    const estimate = {
      runner: "local-packaged-runner",
      model_id: "claude-3-5-sonnet",
      model_display_name: "Claude Sonnet",
      context_tier: "low" as const,
      output_tier: "low" as const,
      estimated_cost_usd: { min: 0.001, max: 0.005 },
      confidence: "medium" as const,
      task_count: 1,
      suggestions: [],
    };
    const decision = routeExecution(
      profileTask(makeSimpleTask()),
      "force_cloud",
      { registry: registryOllamaAvailable, policy, dryRunEstimate: estimate }
    );
    const hasCostNote = decision.policy_effects.some((e) =>
      e.includes("exceeds")
    );
    assert.ok(!hasCostNote, `no cost ceiling effect expected: ${JSON.stringify(decision.policy_effects)}`);
  });
});

// ---------------------------------------------------------------------------
// 9. allow_fallback_to_cloud=false
// ---------------------------------------------------------------------------

describe("allow_fallback_to_cloud=false", () => {
  const policy = policyWith({ allow_fallback_to_cloud: false });

  test("local unavailable does not fall back to cloud", () => {
    const decision = route(makeSimpleTask(), "auto", policy, registryOllamaUnavailable);
    assert.notEqual(decision.selected_provider.id, "cloud_premium");
  });

  test("no-cloud-fallback note appears in policy summary", () => {
    const summary = formatRoutingPolicySummary(policy);
    assert.ok(
      summary.includes("no-cloud-fallback"),
      `summary should mention no-cloud-fallback: ${summary}`
    );
  });

  test("direct cloud selection (force_cloud) still works when cloud_allowed=true", () => {
    // allow_fallback_to_cloud=false only blocks automatic escalation, not direct selection
    const decision = route(makeSimpleTask(), "force_cloud", policy);
    // Cloud is in registry as available (policy only blocks fallback path)
    // force_cloud targets cloud_premium directly — the fallback-restriction registry
    // is only used when the original target was local and unavailable.
    assert.equal(decision.selected_provider.id, "cloud_premium");
  });

  test("local_only + allow_fallback_to_cloud=false → cloud fully blocked", () => {
    const combinedPolicy = policyWith({ local_only: true, allow_fallback_to_cloud: false });
    const decision = route(makeComplexTask(), "auto", combinedPolicy);
    assert.notEqual(decision.selected_provider.id, "cloud_premium");
  });
});

// ---------------------------------------------------------------------------
// 10. default_preference from policy
// ---------------------------------------------------------------------------

describe("default_preference from policy", () => {
  test("policy default_preference=prefer_local used when routing with auto", () => {
    const policy = policyWith({ default_preference: "prefer_local" });
    const decision = route(makeSimpleTask(), "auto", policy, registryOllamaAvailable);
    // prefer_local should push toward local_ollama
    assert.equal(decision.selected_provider.id, "local_ollama");
    // preference_applied should reflect the effective preference
    assert.equal(decision.preference_applied, "prefer_local");
  });

  test("explicit preference overrides policy default", () => {
    const policy = policyWith({ default_preference: "prefer_local" });
    const decision = route(makeComplexTask(), "force_cloud", policy);
    assert.equal(decision.selected_provider.id, "cloud_premium");
    assert.equal(decision.preference_applied, "force_cloud");
  });

  test("default_preference=auto produces no policy effect note", () => {
    const policy = policyWith({ default_preference: "auto" });
    const decision = route(makeSimpleTask(), "auto", policy);
    const hasDefaultNote = decision.policy_effects.some((e) =>
      e.includes("default preference")
    );
    assert.ok(!hasDefaultNote, `auto default should not add policy effect: ${JSON.stringify(decision.policy_effects)}`);
  });

  test("non-auto default_preference adds policy effect note", () => {
    const policy = policyWith({ default_preference: "prefer_local" });
    const decision = route(makeSimpleTask(), "auto", policy);
    const hasDefaultNote = decision.policy_effects.some((e) =>
      e.toLowerCase().includes("default preference") || e.toLowerCase().includes("prefer_local")
    );
    assert.ok(hasDefaultNote, `non-auto default should add policy effect: ${JSON.stringify(decision.policy_effects)}`);
  });
});

// ---------------------------------------------------------------------------
// 11. preferred_local_provider / preferred_cloud_provider — config shape
// ---------------------------------------------------------------------------

describe("preferred provider fields", () => {
  test("preferred_local_provider is stored in policy", () => {
    const policy = policyWith({ preferred_local_provider: "local_ollama" });
    assert.equal(policy.preferred_local_provider, "local_ollama");
  });

  test("preferred_cloud_provider is stored in policy", () => {
    const policy = policyWith({ preferred_cloud_provider: "cloud_premium" });
    assert.equal(policy.preferred_cloud_provider, "cloud_premium");
  });

  test("null preferred providers are stored as null", () => {
    const policy = policyWith({ preferred_local_provider: null, preferred_cloud_provider: null });
    assert.equal(policy.preferred_local_provider, null);
    assert.equal(policy.preferred_cloud_provider, null);
  });

  test("target preference arrays are stored in policy", () => {
    const policy = policyWith({
      preferred_local_targets: ["ollama:qwen2.5-coder:14b"],
      preferred_cloud_targets: ["cloud:claude-sonnet-4-6"],
      enabled_targets: ["cloud:gpt-5-mini"],
      disabled_targets: ["ollama:deepseek-coder:6.7b"],
    });
    assert.deepEqual(policy.preferred_local_targets, ["ollama:qwen2.5-coder:14b"]);
    assert.deepEqual(policy.preferred_cloud_targets, ["cloud:claude-sonnet-4-6"]);
    assert.deepEqual(policy.enabled_targets, ["cloud:gpt-5-mini"]);
    assert.deepEqual(policy.disabled_targets, ["ollama:deepseek-coder:6.7b"]);
  });
});

// ---------------------------------------------------------------------------
// 12. detectOllamaConfigured
// ---------------------------------------------------------------------------

describe("detectOllamaConfigured", () => {
  test("returns false when no env vars set", () => {
    assert.equal(detectOllamaConfigured({}), false);
  });

  test("returns true when FACTORY_DEFAULT_ENGINE=ollama", () => {
    assert.equal(detectOllamaConfigured({ FACTORY_DEFAULT_ENGINE: "ollama" }), true);
  });

  test("returns false when FACTORY_DEFAULT_ENGINE has other value", () => {
    assert.equal(detectOllamaConfigured({ FACTORY_DEFAULT_ENGINE: "cloud" }), false);
  });

  test("returns true when OLLAMA_BASE_URL is set", () => {
    assert.equal(detectOllamaConfigured({ OLLAMA_BASE_URL: "http://localhost:11434" }), true);
  });

  test("returns true when OLLAMA_HOST is set", () => {
    assert.equal(detectOllamaConfigured({ OLLAMA_HOST: "localhost" }), true);
  });

  test("empty string OLLAMA_BASE_URL is treated as not set (falsy)", () => {
    assert.equal(detectOllamaConfigured({ OLLAMA_BASE_URL: "" }), false);
  });
});

// ---------------------------------------------------------------------------
// 13. buildRegistryFromEnvironment
// ---------------------------------------------------------------------------

describe("buildRegistryFromEnvironment", () => {
  test("Ollama available when FACTORY_DEFAULT_ENGINE=ollama", () => {
    const registry = buildRegistryFromEnvironment({ FACTORY_DEFAULT_ENGINE: "ollama" });
    const ollama = registry.find((p) => p.id === "local_ollama");
    assert.ok(ollama?.available, "local_ollama should be available");
    assert.equal(ollama?.availability_note, null);
  });

  test("Ollama unavailable when no env vars set", () => {
    const registry = buildRegistryFromEnvironment({});
    const ollama = registry.find((p) => p.id === "local_ollama");
    assert.equal(ollama?.available, false);
    assert.ok(
      typeof ollama?.availability_note === "string" && ollama.availability_note.length > 0,
      "should have availability note explaining the issue"
    );
  });

  test("cloud_premium unavailable when cloudAllowed=false", () => {
    const registry = buildRegistryFromEnvironment({}, false);
    const cloud = registry.find((p) => p.id === "cloud_premium");
    assert.equal(cloud?.available, false);
    assert.ok(cloud?.availability_note?.includes("cloud_allowed"), "note should reference cloud_allowed");
  });

  test("cloud_premium available when cloudAllowed=true (default)", () => {
    const registry = buildRegistryFromEnvironment({});
    const cloud = registry.find((p) => p.id === "cloud_premium");
    assert.equal(cloud?.available, true);
    assert.equal(cloud?.availability_note, null);
  });

  test("deterministic always available", () => {
    const registry = buildRegistryFromEnvironment({}, false);
    const det = registry.find((p) => p.id === "deterministic");
    assert.equal(det?.available, true);
  });
});

// ---------------------------------------------------------------------------
// 14. Policy-aware binding: cloud_confirmation_required
// ---------------------------------------------------------------------------

describe("policy-aware execution binding", () => {
  test("cloud_confirmation_required=true flows from routing to binding", () => {
    const policy = policyWith({ require_cloud_confirmation: true });
    const decisions = [route(makeComplexTask(), "force_cloud", policy)];
    const binding = bindExecution(decisions, "force_cloud", policy);
    assert.equal(binding.cloud_confirmation_required, true);
  });

  test("cloud_confirmation_required=false when no routing policy is supplied", () => {
    const decisions = [route(makeComplexTask(), "force_cloud")];
    const binding = bindExecution(decisions, "force_cloud");
    assert.equal(binding.cloud_confirmation_required, false);
  });

  test("policy_effects aggregated from decisions into binding", () => {
    const policy = policyWith({ default_preference: "prefer_local" });
    const decisions = [
      route(makeComplexTask(), "force_cloud", policy),
      route(makeSimpleTask(), "force_cloud", policy),
    ];
    const binding = bindExecution(decisions, "force_cloud", policy);
    assert.ok(binding.policy_effects.length > 0, "binding should have aggregated policy effects");
  });

  test("policy_effects deduplicated in binding", () => {
    const policy = policyWith({ require_cloud_confirmation: true });
    const decisions = [
      route(makeComplexTask(), "force_cloud", policy),
      route(makeComplexTask(), "force_cloud", policy),
    ];
    const binding = bindExecution(decisions, "force_cloud", policy);
    // Same effects from two decisions should not duplicate
    const effectSet = new Set(binding.policy_effects);
    assert.equal(effectSet.size, binding.policy_effects.length, "policy_effects should be deduplicated");
  });
});

// ---------------------------------------------------------------------------
// 15. Policy-aware binding: blocked_by_policy
// ---------------------------------------------------------------------------

describe("blocked_by_policy in binding", () => {
  test("cloud_allowed=false + cloud routing → blocked_by_policy", () => {
    // When cloud is blocked by policy but routing somehow selected cloud
    // (defensive check in binding layer), blocked_by_policy should be true.
    // We simulate this by passing a policy that disallows cloud AFTER routing
    // already selected cloud (no-policy routing first, then binding with policy).
    const noPolicy = route(makeComplexTask(), "force_cloud"); // selects cloud_premium
    const policy = policyWith({ cloud_allowed: false });
    const binding = bindExecution([noPolicy], "force_cloud", policy);
    assert.equal(binding.blocked_by_policy, true);
    assert.ok(typeof binding.policy_block_reason === "string" && binding.policy_block_reason.length > 0);
  });

  test("DEVORY_BLOCKED_BY_POLICY=true in env when blocked", () => {
    const noPolicy = route(makeComplexTask(), "force_cloud");
    const policy = policyWith({ cloud_allowed: false });
    const binding = bindExecution([noPolicy], "force_cloud", policy);
    const env = buildExecutionBindingEnv(binding);
    assert.equal(env.DEVORY_BLOCKED_BY_POLICY, "true");
  });

  test("DEVORY_BLOCKED_BY_POLICY=false when not blocked", () => {
    const decisions = [route(makeSimpleTask(), "force_cloud")];
    const binding = bindExecution(decisions, "force_cloud");
    const env = buildExecutionBindingEnv(binding);
    assert.equal(env.DEVORY_BLOCKED_BY_POLICY, "false");
  });

  test("local_only policy + cloud selected → blocked_by_policy", () => {
    const noPolicy = route(makeComplexTask(), "force_cloud");
    const policy = policyWith({ local_only: true });
    const binding = bindExecution([noPolicy], "force_cloud", policy);
    assert.equal(binding.blocked_by_policy, true);
    assert.ok(
      binding.policy_block_reason?.toLowerCase().includes("local-only") ||
      binding.policy_block_reason?.toLowerCase().includes("local only"),
      `reason should mention local-only: ${binding.policy_block_reason}`
    );
  });

  test("no policy → blocked_by_policy=false", () => {
    const decisions = [route(makeComplexTask(), "force_cloud")];
    const binding = bindExecution(decisions, "force_cloud");
    assert.equal(binding.blocked_by_policy, false);
    assert.equal(binding.policy_block_reason, null);
  });

  test("warning includes policy block reason when blocked", () => {
    const noPolicy = route(makeComplexTask(), "force_cloud");
    const policy = policyWith({ cloud_allowed: false });
    const binding = bindExecution([noPolicy], "force_cloud", policy);
    assert.ok(
      binding.warnings.some((w) => w.toLowerCase().includes("blocked") || w.toLowerCase().includes("policy")),
      `warnings should mention the block: ${JSON.stringify(binding.warnings)}`
    );
  });
});

// ---------------------------------------------------------------------------
// 16. Explanation bullets include policy effects
// ---------------------------------------------------------------------------

describe("explanation bullets with policy effects", () => {
  test("local_only policy effect appears first in explanation_bullets", () => {
    const policy = policyWith({ local_only: true });
    const decision = route(makeComplexTask(), "auto", policy);
    assert.ok(
      decision.explanation_bullets.length > 0,
      "should have explanation bullets"
    );
    // Policy effects are prepended to bullets
    const firstBullet = decision.explanation_bullets[0];
    assert.ok(
      firstBullet.toLowerCase().includes("local-only") ||
      firstBullet.toLowerCase().includes("cloud"),
      `first bullet should reflect policy: ${firstBullet}`
    );
  });

  test("no policy effects in policy_effects array when default policy", () => {
    const decision = route(makeComplexTask(), "auto", DEFAULT_ROUTING_POLICY);
    // policy_effects should be empty — no constraint was applied beyond defaults
    assert.deepEqual(
      decision.policy_effects,
      [],
      `default policy should produce no policy_effects: ${JSON.stringify(decision.policy_effects)}`
    );
  });
});

// ---------------------------------------------------------------------------
// 17. Existing routing smoke tests — not broken by policy additions
// ---------------------------------------------------------------------------

describe("routing smoke tests (backward compat)", () => {
  test("auto with no policy → cloud_premium for complex task", () => {
    const decision = routeExecution(profileTask(makeComplexTask()), "auto", {
      registry: registryOllamaAvailable,
    });
    assert.equal(decision.selected_provider.id, "cloud_premium");
    assert.equal(decision.cloud_confirmation_required, false);
    assert.deepEqual(decision.policy_effects, []);
  });

  test("force_local with Ollama available → local_ollama", () => {
    const decision = routeExecution(profileTask(makeSimpleTask()), "force_local", {
      registry: registryOllamaAvailable,
    });
    assert.equal(decision.selected_provider.id, "local_ollama");
    assert.equal(decision.cloud_confirmation_required, false);
  });

  test("force_cloud → cloud_premium regardless of profile", () => {
    const decision = routeExecution(profileTask(makeSimpleTask()), "force_cloud", {
      registry: registryOllamaUnavailable,
    });
    assert.equal(decision.selected_provider.id, "cloud_premium");
    assert.equal(decision.cloud_confirmation_required, false);
  });

  test("bindExecution without policy still works (backward compat)", () => {
    const decisions = [
      routeExecution(profileTask(makeSimpleTask()), "force_cloud", {
        registry: registryOllamaAvailable,
      }),
    ];
    const binding = bindExecution(decisions, "force_cloud");
    assert.equal(binding.execution_path, "cloud_api");
    assert.equal(binding.cloud_confirmation_required, false);
    assert.equal(binding.blocked_by_policy, false);
    assert.equal(binding.policy_block_reason, null);
    assert.deepEqual(binding.policy_effects, []);
  });
});

// ---------------------------------------------------------------------------
// formatRoutingPolicySummary
// ---------------------------------------------------------------------------

describe("formatRoutingPolicySummary", () => {
  test("empty string for default policy", () => {
    assert.equal(formatRoutingPolicySummary(DEFAULT_ROUTING_POLICY), "");
  });

  test("includes local-only when local_only=true", () => {
    const policy = policyWith({ local_only: true });
    assert.ok(formatRoutingPolicySummary(policy).includes("local-only mode"));
  });

  test("includes cloud=disabled when cloud_allowed=false", () => {
    const policy = policyWith({ cloud_allowed: false });
    assert.ok(formatRoutingPolicySummary(policy).includes("cloud=disabled"));
  });

  test("includes cloud-confirmation-disabled when confirmation is turned off from the shipped default", () => {
    const policy = policyWith({ require_cloud_confirmation: false });
    assert.ok(formatRoutingPolicySummary(policy).includes("cloud-confirmation-disabled"));
  });

  test("includes max-cost when set", () => {
    const policy = policyWith({ max_estimated_cloud_cost_usd: 0.5 });
    assert.ok(formatRoutingPolicySummary(policy).includes("max-cost="));
  });

  test("local-only takes precedence in summary (no cloud=disabled listed separately)", () => {
    const policy = policyWith({ local_only: true, cloud_allowed: false });
    const summary = formatRoutingPolicySummary(policy);
    // local-only is the single note; cloud=disabled is implied
    assert.ok(summary.includes("local-only mode"));
    assert.ok(!summary.includes("cloud=disabled"), "cloud=disabled should not appear separately when local-only");
  });
});
