/**
 * packages/core/src/execution-binding.test.ts
 *
 * Tests for the execution binding layer.
 *
 * Runs with Node's built-in test runner:
 *   tsx --test packages/core/src/execution-binding.test.ts
 *
 * Coverage:
 *  1. selected provider class maps to correct execution path (cloud_api, local_ollama, deterministic)
 *  2. unavailable local provider falls back to unavailable_fallback path
 *  3. force_local + local unavailable → force_local_violated=true, unavailable_stopped path
 *  4. force_local + local available → no violation, local_ollama path
 *  5. selected vs. actual route recorded correctly (binding_summary, formatBindingRecord)
 *  6. decomposition recommendation carried forward into binding
 *  7. per-task bindings parallel to input decisions
 *  8. no fake successful execution: unavailable providers do not silently succeed
 *  9. buildExecutionBindingEnv produces correct env var map
 * 10. empty decisions array handled gracefully
 * 11. prefer_local fallback produces warning, not stop
 * 12. force_cloud always produces cloud_api path
 * 13. deterministic_only always produces deterministic path
 * 14. auto preference with cloud selection → cloud_api, no fallback
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  bindExecution,
  buildExecutionBindingEnv,
  formatBindingRecord,
} from "./execution-binding.ts";
import { routeExecution } from "./execution-router.ts";
import { withOllamaAvailability } from "./provider-registry.ts";
import { DEFAULT_ROUTING_POLICY, applyRoutingPolicyOverrides } from "./routing-policy.ts";
import { profileTask } from "./task-profiler.ts";
import type { DryRunTaskSource } from "./dry-run-estimate.ts";
import type { ExecutionRoutingDecision } from "./execution-router.ts";
import type { TargetReadinessSnapshot } from "./target-readiness.ts";

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
      "## Verification",
      "- npm test",
    ].join("\n"),
  };
}

function makeComplexTask(): DryRunTaskSource {
  return {
    meta: {
      type: "feature",
      context_intensity: "high",
      files_likely_affected: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts", "src/f.ts"],
    },
    body: [
      "## Goal",
      "Implement a complex cross-cutting feature.",
      "## Acceptance Criteria",
      "- All modules updated.",
      "- Tests pass.",
      "## Verification",
      "- npm test",
    ].join("\n"),
  };
}

function makeEpicTask(): DryRunTaskSource {
  return {
    meta: { type: "epic", files_likely_affected: [] },
    body: "## Goal\nBuild the entire auth system.",
  };
}

const registryWithOllama = withOllamaAvailability(true);
const registryWithoutOllama = withOllamaAvailability(false);
const targetAwarePolicy = applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
  enabled_targets: [
    "ollama:qwen2.5-coder:14b",
    "ollama:deepseek-coder:6.7b",
    "cloud:claude-sonnet-4-6",
    "cloud:gpt-5-mini",
  ],
});

function routeSimple(preference: Parameters<typeof routeExecution>[1], registry = registryWithOllama): ExecutionRoutingDecision {
  return routeExecution(profileTask(makeSimpleTask()), preference, { registry });
}

function routeComplex(preference: Parameters<typeof routeExecution>[1], registry = registryWithOllama): ExecutionRoutingDecision {
  return routeExecution(profileTask(makeComplexTask()), preference, { registry });
}

function routeEpic(preference: Parameters<typeof routeExecution>[1], registry = registryWithOllama): ExecutionRoutingDecision {
  return routeExecution(profileTask(makeEpicTask()), preference, { registry });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("execution binding layer", () => {
  describe("execution path mapping", () => {
    test("cloud_premium provider maps to cloud_api path", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");

      assert.equal(binding.selected_provider_class, "cloud_premium");
      assert.equal(binding.execution_path, "cloud_api");
      assert.equal(binding.fallback_taken, false);
    });

    test("local_ollama provider (available) maps to local_ollama path", () => {
      const decisions = [routeSimple("force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.equal(binding.selected_provider_class, "local_ollama");
      assert.equal(binding.execution_path, "local_ollama");
      assert.equal(binding.fallback_taken, false);
      assert.equal(binding.force_local_violated, false);
    });

    test("deterministic provider maps to deterministic path", () => {
      const decisions = [routeSimple("deterministic_only")];
      const binding = bindExecution(decisions, "deterministic_only");

      assert.equal(binding.selected_provider_class, "deterministic");
      assert.equal(binding.execution_path, "deterministic");
    });
  });

  describe("fallback behavior", () => {
    test("auto + local unavailable → unavailable_fallback path, not stopped", () => {
      const decisions = [routeSimple("auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");

      // Routing engine fell back to cloud when Ollama unavailable
      assert.equal(binding.selected_provider_class, "cloud_premium");
      // auto preference: fallback is allowed, path is unavailable_fallback
      assert.equal(binding.execution_path, "unavailable_fallback");
      assert.equal(binding.fallback_taken, true);
      assert.equal(binding.force_local_violated, false);
    });

    test("prefer_local + local unavailable → warning, not stopped", () => {
      const decisions = [routeSimple("prefer_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "prefer_local");

      assert.equal(binding.force_local_violated, false);
      assert.ok(
        binding.warnings.some((w) => w.toLowerCase().includes("unavailable") || w.toLowerCase().includes("fallback")),
        `should warn about unavailable local: ${JSON.stringify(binding.warnings)}`
      );
    });

    test("prefer_local + local unavailable → unavailable_fallback, not unavailable_stopped", () => {
      const decisions = [routeSimple("prefer_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "prefer_local");

      assert.notEqual(binding.execution_path, "unavailable_stopped");
    });
  });

  describe("force_local violation", () => {
    test("force_local + local available → no violation, local_ollama path", () => {
      const decisions = [routeSimple("force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.equal(binding.force_local_violated, false);
      assert.equal(binding.execution_path, "local_ollama");
      assert.equal(binding.warnings.filter((w) => w.includes("Force local")).length, 0);
    });

    test("force_local + local unavailable → force_local_violated=true", () => {
      const decisions = [routeSimple("force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.equal(binding.force_local_violated, true);
      assert.equal(binding.execution_path, "unavailable_stopped");
    });

    test("force_local + local unavailable → warning describes stop condition", () => {
      const decisions = [routeSimple("force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");

      const hasStopWarning = binding.warnings.some(
        (w) => w.includes("Force local") || w.includes("force_local") || w.includes("force local")
      );
      assert.ok(hasStopWarning, `should warn about force_local stop: ${JSON.stringify(binding.warnings)}`);
    });

    test("force_local + local unavailable → no fake successful execution", () => {
      const decisions = [routeSimple("force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");

      // Must NOT claim execution_path = local_ollama (that would be fake)
      assert.notEqual(binding.execution_path, "local_ollama");
      // Must NOT claim fallback_taken = false (that would hide the problem)
      assert.equal(binding.fallback_taken, true);
    });
  });

  describe("selected vs. actual route recording", () => {
    test("binding_summary contains selected provider and path", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");

      assert.ok(binding.binding_summary.includes("cloud_premium"), `summary should mention provider: ${binding.binding_summary}`);
      assert.ok(binding.binding_summary.includes("force_cloud"), `summary should mention preference: ${binding.binding_summary}`);
    });

    test("binding_summary records fallback when taken", () => {
      const decisions = [routeSimple("auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");

      assert.ok(
        binding.binding_summary.includes("local_ollama"),
        `summary should record originally targeted provider: ${binding.binding_summary}`
      );
    });

    test("binding records concrete target and adapter when configured", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud", {
        policy: targetAwarePolicy,
        task_profiles: [profileTask(makeSimpleTask())],
        task_metas: [makeSimpleTask().meta ?? null],
      });

      assert.equal(binding.actual_target_id, "cloud:gpt-5-mini");
      assert.equal(binding.selected_adapter_id, "openai");
      assert.equal(binding.actual_adapter_id, "openai");
      assert.equal(binding.actual_execution_path, "packaged_runner:openai");
      assert.ok(binding.binding_summary.includes("target=cloud:gpt-5-mini"));
    });

    test("binding records target fallback honestly when preferred local target is unavailable", () => {
      const policy = applyRoutingPolicyOverrides(targetAwarePolicy, {
        preferred_local_targets: ["ollama:qwen2.5-coder:14b"],
        disabled_targets: ["ollama:qwen2.5-coder:14b"],
      });
      const decisions = [routeSimple("force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local", {
        policy,
        task_profiles: [profileTask(makeSimpleTask())],
        task_metas: [makeSimpleTask().meta ?? null],
      });

      assert.equal(binding.target_fallback_taken, true);
      assert.equal(binding.selected_target_id, "ollama:qwen2.5-coder:14b");
      assert.equal(binding.actual_target_id, "ollama:deepseek-coder:6.7b");
      assert.equal(binding.actual_adapter_id, "ollama");
      assert.ok(binding.target_fallback_reason?.includes("deepseek-coder:6.7b"));
    });

    test("unconfigured concrete target keeps provider lane honest without fabricating an actual target", () => {
      const policy = applyRoutingPolicyOverrides(targetAwarePolicy, {
        enabled_targets: ["cloud:claude-opus-4-1"],
      });
      const decisions = [routeSimple("force_cloud")];
      const task = makeSimpleTask();
      const binding = bindExecution(decisions, "force_cloud", {
        policy,
        task_profiles: [profileTask(task)],
        task_metas: [{ ...task.meta, preferred_models: ["claude-opus-4-1"] }],
        readiness: {
          provider_classes: {
            cloud_premium: {
              state: "ready",
              detail: "credentials verified",
            },
          },
          targets: {
            "cloud:claude-opus-4-1": {
              state: "ready",
              detail: "credentials verified",
            },
          },
        },
      });

      assert.equal(binding.actual_target_id, null);
      assert.equal(binding.actual_adapter_id, "openai");
      assert.equal(binding.actual_execution_path, "packaged_runner:openai");
      assert.equal(binding.execution_path, "cloud_api");
      assert.match(
        `${binding.adapter_fallback_reason ?? ""} ${binding.warnings.join(" ")}`,
        /Target not configured for this workspace|Cloud execution forced/i
      );
    });

    test("binding carries target readiness metadata and fallback cause", () => {
      const readiness: TargetReadinessSnapshot = {
        provider_classes: {
          local_ollama: { state: "ready", detail: "inventory loaded" },
        },
        targets: {
          "ollama:qwen2.5-coder:14b": {
            state: "unavailable",
            detail: "model missing",
          },
          "ollama:deepseek-coder:6.7b": {
            state: "ready",
            detail: "model present",
          },
        },
      };
      const policy = applyRoutingPolicyOverrides(targetAwarePolicy, {
        preferred_local_targets: ["ollama:qwen2.5-coder:14b"],
      });
      const decisions = [routeSimple("force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local", {
        policy,
        readiness,
        task_profiles: [profileTask(makeSimpleTask())],
        task_metas: [makeSimpleTask().meta ?? null],
      });

      assert.equal(binding.actual_target_id, "ollama:deepseek-coder:6.7b");
      assert.equal(binding.target_readiness_state, "ready");
      assert.equal(binding.target_fallback_cause, "readiness");
      assert.equal(binding.fallback_cause, "readiness");
    });

    test("formatBindingRecord shows no-fallback on happy path", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const record = formatBindingRecord(binding);

      assert.ok(record.includes("no-fallback"), `record should note no fallback: ${record}`);
    });

    test("formatBindingRecord shows fallback details when fallback taken", () => {
      const decisions = [routeSimple("auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");
      const record = formatBindingRecord(binding);

      assert.ok(
        record.includes("fallback_from=local_ollama"),
        `record should show what was originally targeted: ${record}`
      );
    });

    test("formatBindingRecord shows stop condition for force_local violation", () => {
      const decisions = [routeSimple("force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");
      const record = formatBindingRecord(binding);

      assert.ok(
        record.includes("STOPPED") || record.includes("violated"),
        `record should describe stop: ${record}`
      );
    });
  });

  describe("decomposition recommendation continuity", () => {
    test("epic task decomposition carried forward into binding", () => {
      const decisions = [routeEpic("auto")];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.decomposition_recommended, true);
      assert.ok(
        typeof binding.decomposition_note === "string" && binding.decomposition_note.length > 0,
        "should have a decomposition note"
      );
    });

    test("decomposition warning included in warnings when recommended", () => {
      const decisions = [routeEpic("auto")];
      const binding = bindExecution(decisions, "auto");

      const hasDecompWarning = binding.warnings.some((w) =>
        w.toLowerCase().includes("decomposition") || w.toLowerCase().includes("splitting")
      );
      assert.ok(hasDecompWarning, `should include decomposition warning: ${JSON.stringify(binding.warnings)}`);
    });

    test("simple task has no decomposition in binding", () => {
      const decisions = [routeSimple("auto")];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.decomposition_recommended, false);
      assert.equal(binding.decomposition_note, null);
    });

    test("binding_summary notes decomposition when recommended", () => {
      const decisions = [routeEpic("auto")];
      const binding = bindExecution(decisions, "auto");

      assert.ok(
        binding.binding_summary.includes("decomposition"),
        `summary should mention decomposition: ${binding.binding_summary}`
      );
    });
  });

  describe("per-task bindings", () => {
    test("per_task_bindings length matches input decisions", () => {
      const decisions = [
        routeSimple("auto"),
        routeComplex("auto"),
        routeEpic("auto"),
      ];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.per_task_bindings.length, 3);
    });

    test("per_task_bindings have correct task indices", () => {
      const decisions = [routeSimple("auto"), routeComplex("auto")];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.per_task_bindings[0].task_index, 0);
      assert.equal(binding.per_task_bindings[1].task_index, 1);
    });

    test("per_task_bindings reflect individual task routing decisions", () => {
      const decisions = [
        routeSimple("force_cloud"),
        routeSimple("force_cloud"),
      ];
      const binding = bindExecution(decisions, "force_cloud");

      for (const tb of binding.per_task_bindings) {
        assert.equal(tb.selected_provider_class, "cloud_premium");
        assert.equal(tb.execution_path, "cloud_api");
      }
    });

    test("per_task_bindings track fallback per task", () => {
      // Mix: local + cloud tasks, local unavailable
      const decisions = [
        routeSimple("prefer_local", registryWithoutOllama),
        routeComplex("prefer_local", registryWithoutOllama),
      ];
      const binding = bindExecution(decisions, "prefer_local");

      // Both should show some form of fallback since local is unavailable
      for (const tb of binding.per_task_bindings) {
        assert.ok(
          tb.fallback_taken || tb.selected_provider_class !== "local_ollama",
          "each task binding should reflect that local was unavailable"
        );
      }
    });

    test("per_task_bindings carry decomposition per task", () => {
      const decisions = [
        routeSimple("auto"),
        routeEpic("auto"),
      ];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.per_task_bindings[0].decomposition_recommended, false);
      assert.equal(binding.per_task_bindings[1].decomposition_recommended, true);
    });
  });

  describe("buildExecutionBindingEnv", () => {
    test("produces DEVORY_PROVIDER_CLASS env var", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_PROVIDER_CLASS, "cloud_premium");
    });

    test("produces DEVORY_EXECUTION_PATH env var", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_EXECUTION_PATH, "cloud_api");
    });

    test("DEVORY_FALLBACK_TAKEN is 'false' when no fallback", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_FALLBACK_TAKEN, "false");
    });

    test("DEVORY_FALLBACK_TAKEN is 'true' when fallback taken", () => {
      const decisions = [routeSimple("auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_FALLBACK_TAKEN, "true");
    });

    test("DEVORY_ORIGINALLY_TARGETED is set when fallback taken", () => {
      const decisions = [routeSimple("auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_ORIGINALLY_TARGETED, "local_ollama");
    });

    test("DEVORY_ORIGINALLY_TARGETED is empty string when no fallback", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_ORIGINALLY_TARGETED, "");
    });

    test("DEVORY_DECOMPOSITION_FLAG is 'true' for epic tasks", () => {
      const decisions = [routeEpic("auto")];
      const binding = bindExecution(decisions, "auto");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_DECOMPOSITION_FLAG, "true");
    });

    test("DEVORY_DECOMPOSITION_FLAG is 'false' for simple tasks", () => {
      const decisions = [routeSimple("auto")];
      const binding = bindExecution(decisions, "auto");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_DECOMPOSITION_FLAG, "false");
    });

    test("DEVORY_FORCE_LOCAL_VIOLATED is 'true' when violated", () => {
      const decisions = [routeSimple("force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_FORCE_LOCAL_VIOLATED, "true");
    });

    test("DEVORY_FORCE_LOCAL_VIOLATED is 'false' when not violated", () => {
      const decisions = [routeSimple("force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_FORCE_LOCAL_VIOLATED, "false");
    });

    test("produces concrete target env vars when target resolution is configured", () => {
      const decisions = [routeSimple("force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local", {
        policy: targetAwarePolicy,
        task_profiles: [profileTask(makeSimpleTask())],
        task_metas: [makeSimpleTask().meta ?? null],
      });
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_SELECTED_TARGET_ID, "ollama:deepseek-coder:6.7b");
      assert.equal(env.DEVORY_ACTUAL_TARGET_ID, "ollama:deepseek-coder:6.7b");
      assert.equal(env.DEVORY_SELECTED_ADAPTER_ID, "ollama");
      assert.equal(env.DEVORY_ACTUAL_ADAPTER_ID, "ollama");
      assert.equal(env.DEVORY_TARGET_ADAPTER, "ollama");
      assert.equal(env.DEVORY_ADAPTER_INVOCATION_MODE, "ollama");
      assert.equal(env.DEVORY_ACTUAL_EXECUTION_PATH, "packaged_runner:ollama");
      assert.equal(env.DEVORY_TARGET_FALLBACK_TAKEN, "false");
    });

    test("produces target readiness env vars when target resolution is configured", () => {
      const decisions = [routeSimple("force_cloud")];
      const binding = bindExecution(decisions, "force_cloud", {
        policy: targetAwarePolicy,
        readiness: {
          provider_classes: {
            cloud_premium: {
              state: "configured_but_unverified",
              detail: "credentials detected",
            },
          },
          targets: {
            "cloud:gpt-5-mini": {
              state: "configured_but_unverified",
              detail: "credentials detected",
            },
          },
        },
        task_profiles: [profileTask(makeSimpleTask())],
        task_metas: [makeSimpleTask().meta ?? null],
      });
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_TARGET_READINESS_STATE, "configured_but_unverified");
      assert.equal(env.DEVORY_TARGET_READINESS_DETAIL, "credentials detected");
      assert.equal(env.DEVORY_FALLBACK_CAUSE, "none");
      assert.equal(env.DEVORY_TARGET_FALLBACK_CAUSE, "none");
    });

    test("DEVORY_PREFERENCE_APPLIED reflects the chosen preference", () => {
      const decisions = [routeSimple("prefer_local")];
      const binding = bindExecution(decisions, "prefer_local");
      const env = buildExecutionBindingEnv(binding);

      assert.equal(env.DEVORY_PREFERENCE_APPLIED, "prefer_local");
    });

    test("all expected env var keys are present", () => {
      const decisions = [routeSimple("auto")];
      const binding = bindExecution(decisions, "auto");
      const env = buildExecutionBindingEnv(binding);

      const expectedKeys = [
        "DEVORY_PROVIDER_CLASS",
        "DEVORY_EXECUTION_PATH",
        "DEVORY_ROUTE_MODE",
        "DEVORY_PREFERENCE_APPLIED",
        "DEVORY_FALLBACK_TAKEN",
        "DEVORY_ORIGINALLY_TARGETED",
        "DEVORY_DECOMPOSITION_FLAG",
        "DEVORY_FORCE_LOCAL_VIOLATED",
        "DEVORY_TARGET_READINESS_STATE",
        "DEVORY_FALLBACK_CAUSE",
      ];
      for (const key of expectedKeys) {
        assert.ok(
          Object.hasOwn(env, key),
          `env should contain ${key}`
        );
      }
    });
  });

  describe("edge cases", () => {
    test("empty decisions array handled gracefully", () => {
      const binding = bindExecution([], "auto");

      assert.ok(typeof binding.selected_provider_class === "string");
      assert.ok(typeof binding.execution_path === "string");
      assert.equal(binding.per_task_bindings.length, 0);
      assert.equal(binding.decomposition_recommended, false);
    });

    test("force_cloud always produces cloud_api regardless of profile", () => {
      const decisions = [
        routeComplex("force_cloud"),
        routeEpic("force_cloud"),
        routeSimple("force_cloud"),
      ];
      const binding = bindExecution(decisions, "force_cloud");

      assert.equal(binding.execution_path, "cloud_api");
      assert.equal(binding.fallback_taken, false);
      assert.equal(binding.force_local_violated, false);
    });

    test("deterministic_only produces deterministic path for all tasks", () => {
      const decisions = [
        routeSimple("deterministic_only"),
        routeComplex("deterministic_only"),
      ];
      const binding = bindExecution(decisions, "deterministic_only");

      assert.equal(binding.execution_path, "deterministic");
    });

    test("auto with cloud-only profile → cloud_api, no fallback marked", () => {
      const decisions = [routeComplex("auto", registryWithOllama)];
      const binding = bindExecution(decisions, "auto");

      // Complex task routes to cloud by profile recommendation, not fallback
      assert.equal(binding.selected_provider_class, "cloud_premium");
      assert.equal(binding.execution_path, "cloud_api");
      // No fallback was taken — cloud was the correct choice per profile
      assert.equal(binding.fallback_taken, false);
    });
  });
});
