import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { withOllamaAvailability } from "./provider-registry.ts";
import { DEFAULT_ROUTING_POLICY, applyRoutingPolicyOverrides } from "./routing-policy.ts";
import { profileTask } from "./task-profiler.ts";
import {
  buildProviderTargetRegistry,
  resolveProviderTarget,
} from "./provider-target-resolver.ts";
import type { TargetReadinessSnapshot } from "./target-readiness.ts";
import type { DryRunTaskSource } from "./dry-run-estimate.ts";

function makeSimpleTask(): DryRunTaskSource {
  return {
    meta: { type: "bugfix", files_likely_affected: ["src/a.ts"] },
    body: ["## Goal", "Fix one bug.", "## Acceptance Criteria", "- Bug is fixed."].join("\n"),
  };
}

function makeComplexTask(): DryRunTaskSource {
  return {
    meta: {
      type: "feature",
      context_intensity: "high",
      files_likely_affected: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
    },
    body: ["## Goal", "Implement a complex feature.", "## Acceptance Criteria", "- Works."].join("\n"),
  };
}

describe("provider target resolver", () => {
  test("preferred local target is selected when configured and available", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      preferred_local_targets: ["ollama:qwen2.5-coder:14b"],
      enabled_targets: ["ollama:qwen2.5-coder:14b", "ollama:deepseek-coder:6.7b"],
    });
    const resolution = resolveProviderTarget("local_ollama", {
      policy,
      provider_registry: withOllamaAvailability(true),
      task_profile: profileTask(makeSimpleTask()),
    });

    assert.equal(resolution.actual_target?.id, "ollama:qwen2.5-coder:14b");
    assert.equal(resolution.adapter_id, "ollama");
    assert.equal(resolution.fallback_taken, false);
  });

  test("unavailable preferred local target falls back honestly to next enabled target", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      preferred_local_targets: ["ollama:qwen2.5-coder:14b"],
      enabled_targets: ["ollama:qwen2.5-coder:14b", "ollama:deepseek-coder:6.7b"],
      disabled_targets: ["ollama:qwen2.5-coder:14b"],
    });
    const resolution = resolveProviderTarget("local_ollama", {
      policy,
      provider_registry: withOllamaAvailability(true),
      task_profile: profileTask(makeSimpleTask()),
    });

    assert.equal(resolution.preferred_target?.id, "ollama:qwen2.5-coder:14b");
    assert.equal(resolution.actual_target?.id, "ollama:deepseek-coder:6.7b");
    assert.equal(resolution.fallback_taken, true);
  });

  test("readiness-aware resolution prefers verified-ready local target over unverified one", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      enabled_targets: ["ollama:qwen2.5-coder:14b", "ollama:deepseek-coder:6.7b"],
    });
    const readiness: TargetReadinessSnapshot = {
      provider_classes: {
        local_ollama: { state: "ready", detail: "inventory loaded" },
      },
      targets: {
        "ollama:qwen2.5-coder:14b": {
          state: "configured_but_unverified",
          detail: "configured only",
        },
        "ollama:deepseek-coder:6.7b": {
          state: "ready",
          detail: "present in inventory",
        },
      },
    };

    const resolution = resolveProviderTarget("local_ollama", {
      policy,
      provider_registry: withOllamaAvailability(true),
      readiness,
      task_profile: profileTask(makeSimpleTask()),
    });

    assert.equal(resolution.actual_target?.id, "ollama:deepseek-coder:6.7b");
    assert.equal(resolution.readiness_state, "ready");
  });

  test("task-profile complexity can favor the larger local target", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      enabled_targets: ["ollama:qwen2.5-coder:14b", "ollama:deepseek-coder:6.7b"],
    });
    const resolution = resolveProviderTarget("local_ollama", {
      policy,
      provider_registry: withOllamaAvailability(true),
      task_profile: profileTask(makeComplexTask()),
    });

    assert.equal(resolution.actual_target?.id, "ollama:qwen2.5-coder:14b");
  });

  test("task preferred_models can influence concrete target selection", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      enabled_targets: ["cloud:claude-sonnet-4-6", "cloud:gpt-5-mini"],
    });
    const resolution = resolveProviderTarget("cloud_premium", {
      policy,
      task_profile: profileTask(makeSimpleTask()),
      task_meta: { preferred_models: ["gpt-5-mini"] },
    });

    assert.equal(resolution.actual_target?.id, "cloud:gpt-5-mini");
  });

  test("provider-class policy blocking leaves no fake actual target", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      local_only: true,
      enabled_targets: ["cloud:claude-sonnet-4-6"],
    });
    const registry = buildProviderTargetRegistry({
      policy,
      provider_registry: withOllamaAvailability(true),
    });
    const resolution = resolveProviderTarget("cloud_premium", {
      policy,
      provider_registry: registry.map((entry) => ({
        id: entry.provider_class,
        label: entry.provider_class,
        locality: entry.provider_class === "cloud_premium" ? "cloud" : "local",
        cost_profile: entry.relative_cost === "high" ? "high" : "free",
        capability_tier: entry.provider_class === "cloud_premium" ? "premium" : "basic",
        suitable_task_patterns: [],
        available: entry.provider_class !== "cloud_premium",
        availability_note: entry.provider_class === "cloud_premium" ? "Cloud disabled by policy." : null,
      })),
      task_profile: profileTask(makeComplexTask()),
    });

    assert.equal(resolution.actual_target, null);
    assert.equal(resolution.adapter_id, null);
  });

  test("configured but unverified target remains selectable but honest", () => {
    const policy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
      enabled_targets: ["cloud:gpt-5-mini"],
    });
    const readiness: TargetReadinessSnapshot = {
      provider_classes: {
        cloud_premium: {
          state: "configured_but_unverified",
          detail: "OpenAI credentials detected; API reachability not probed.",
        },
      },
      targets: {
        "cloud:gpt-5-mini": {
          state: "configured_but_unverified",
          detail: "OpenAI credentials detected; API reachability not probed.",
        },
      },
    };

    const resolution = resolveProviderTarget("cloud_premium", {
      policy,
      readiness,
      task_profile: profileTask(makeSimpleTask()),
    });

    assert.equal(resolution.actual_target?.id, "cloud:gpt-5-mini");
    assert.equal(resolution.readiness_state, "configured_but_unverified");
    assert.ok(
      resolution.warnings.some((warning) =>
        warning.toLowerCase().includes("not probed")
      )
    );
  });
});
