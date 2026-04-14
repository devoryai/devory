/**
 * packages/vscode/src/test/execution-binding-handoff.test.ts
 *
 * Integration tests for execution binding handoff into the run invocation.
 *
 * Verifies that:
 *  - Routing decisions drive actual env vars passed to the runner subprocess
 *  - Unavailable local provider fallback is visible (not silent)
 *  - force_local failure binding produces DEVORY_FORCE_LOCAL_VIOLATED=true
 *  - Selected vs. actual route is recorded in DEVORY_* env vars
 *  - Decomposition recommendation continuity in env vars
 *  - Per-task binding decisions are computed (spot check per_task_bindings length)
 *  - No fake successful execution for unavailable providers
 *  - routingEnv is correctly injected into RunRuntimeInvocation env
 *
 * Run: tsx --test packages/vscode/src/test/execution-binding-handoff.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";

import {
  bindExecution,
  buildExecutionBindingEnv,
  routeExecution,
  profileTask,
  withOllamaAvailability,
  DEFAULT_ROUTING_POLICY,
  applyRoutingPolicyOverrides,
} from "@devory/core";
import type { DryRunTaskSource, ExecutionRoutingDecision } from "@devory/core";
import { resolvePackagedRunInvocation } from "../lib/run-adapter.js";

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
      "- Edge case handled.",
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

function route(
  task: DryRunTaskSource,
  preference: Parameters<typeof routeExecution>[1],
  registry = registryWithOllama
): ExecutionRoutingDecision {
  return routeExecution(profileTask(task), preference, { registry });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("execution binding → run invocation handoff", () => {
  describe("routing env vars injected into runner invocation", () => {
    test("DEVORY_PROVIDER_CLASS reaches invocation env", () => {
      const decisions = [route(makeSimpleTask(), "force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { limit: 1, routingEnv }
      );

      assert.equal(invocation.env.DEVORY_PROVIDER_CLASS, "cloud_premium");
    });

    test("DEVORY_EXECUTION_PATH reaches invocation env", () => {
      const decisions = [route(makeSimpleTask(), "force_cloud")];
      const binding = bindExecution(decisions, "force_cloud");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_EXECUTION_PATH, "cloud_api");
    });

    test("local_ollama path reaches invocation when Ollama available", () => {
      const decisions = [route(makeSimpleTask(), "force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_PROVIDER_CLASS, "local_ollama");
      assert.equal(invocation.env.DEVORY_EXECUTION_PATH, "local_ollama");
    });

    test("concrete target env vars reach invocation when configured", () => {
      const task = makeSimpleTask();
      const decisions = [route(task, "force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local", {
        policy: targetAwarePolicy,
        task_profiles: [profileTask(task)],
        task_metas: [task.meta ?? null],
      });
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_ACTUAL_TARGET_ID, "ollama:deepseek-coder:6.7b");
      assert.equal(invocation.env.DEVORY_TARGET_ADAPTER, "ollama");
      assert.equal(invocation.env.DEVORY_ACTUAL_ADAPTER_ID, "ollama");
      assert.equal(invocation.env.DEVORY_ADAPTER_INVOCATION_MODE, "ollama");
    });

    test("target readiness env vars reach invocation when configured", () => {
      const task = makeSimpleTask();
      const decisions = [route(task, "force_cloud")];
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
        task_profiles: [profileTask(task)],
        task_metas: [task.meta ?? null],
      });
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(
        invocation.env.DEVORY_TARGET_READINESS_STATE,
        "configured_but_unverified"
      );
      assert.equal(invocation.env.DEVORY_TARGET_READINESS_DETAIL, "credentials detected");
    });

    test("invocation env retains DEVORY_FACTORY_ROOT alongside routing env", () => {
      const decisions = [route(makeSimpleTask(), "auto")];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_FACTORY_ROOT, "/workspace");
      assert.ok(invocation.env.DEVORY_PROVIDER_CLASS, "routing env should be present");
    });

    test("invocation without routingEnv still works (backward compat)", () => {
      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { limit: 2 }
      );

      // Should not have DEVORY_PROVIDER_CLASS if no routing env passed
      assert.equal(invocation.env.DEVORY_PROVIDER_CLASS, undefined);
      // Should still have standard env vars
      assert.equal(invocation.env.DEVORY_FACTORY_ROOT, "/workspace");
    });
  });

  describe("fallback visibility — not silent", () => {
    test("local unavailable fallback: DEVORY_FALLBACK_TAKEN=true in env", () => {
      const decisions = [route(makeSimpleTask(), "auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_FALLBACK_TAKEN, "true");
    });

    test("local unavailable fallback: DEVORY_ORIGINALLY_TARGETED=local_ollama", () => {
      const decisions = [route(makeSimpleTask(), "auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_ORIGINALLY_TARGETED, "local_ollama");
    });

    test("local unavailable fallback: actual provider is NOT local_ollama", () => {
      const decisions = [route(makeSimpleTask(), "auto", registryWithoutOllama)];
      const binding = bindExecution(decisions, "auto");

      assert.notEqual(binding.selected_provider_class, "local_ollama");
    });

    test("no fake successful execution: unavailable_stopped has DEVORY_FORCE_LOCAL_VIOLATED=true", () => {
      const decisions = [route(makeSimpleTask(), "force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_FORCE_LOCAL_VIOLATED, "true");
    });
  });

  describe("force_local failure behavior", () => {
    test("force_local + unavailable → force_local_violated=true in binding", () => {
      const decisions = [route(makeSimpleTask(), "force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.equal(binding.force_local_violated, true);
    });

    test("force_local + unavailable → execution_path is unavailable_stopped", () => {
      const decisions = [route(makeSimpleTask(), "force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.equal(binding.execution_path, "unavailable_stopped");
    });

    test("force_local + unavailable → warnings include stop explanation", () => {
      const decisions = [route(makeSimpleTask(), "force_local", registryWithoutOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.ok(
        binding.warnings.some(
          (w) =>
            w.toLowerCase().includes("force local") ||
            w.toLowerCase().includes("force_local") ||
            w.toLowerCase().includes("local provider")
        ),
        `warnings should explain stop: ${JSON.stringify(binding.warnings)}`
      );
    });

    test("force_local + available → no violation, local path used", () => {
      const decisions = [route(makeSimpleTask(), "force_local", registryWithOllama)];
      const binding = bindExecution(decisions, "force_local");

      assert.equal(binding.force_local_violated, false);
      assert.equal(binding.execution_path, "local_ollama");
      assert.equal(binding.selected_provider_class, "local_ollama");
    });
  });

  describe("decomposition recommendation continuity", () => {
    test("epic task decomposition flag reaches invocation env", () => {
      const decisions = [route(makeEpicTask(), "auto")];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_DECOMPOSITION_FLAG, "true");
    });

    test("simple task has DEVORY_DECOMPOSITION_FLAG=false in env", () => {
      const decisions = [route(makeSimpleTask(), "auto")];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.equal(invocation.env.DEVORY_DECOMPOSITION_FLAG, "false");
    });

    test("binding has decomposition_note when recommended", () => {
      const decisions = [route(makeEpicTask(), "auto")];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.decomposition_recommended, true);
      assert.ok(
        typeof binding.decomposition_note === "string" && binding.decomposition_note.length > 0
      );
    });
  });

  describe("per-task decision handling", () => {
    test("per_task_bindings produced for each routing decision", () => {
      const decisions = [
        route(makeSimpleTask(), "auto"),
        route(makeEpicTask(), "auto"),
        route(makeSimpleTask(), "auto"),
      ];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.per_task_bindings.length, 3);
    });

    test("each per-task binding has valid execution_path", () => {
      const validPaths = new Set([
        "cloud_api",
        "local_ollama",
        "deterministic",
        "unavailable_fallback",
        "unavailable_stopped",
      ]);

      const decisions = [
        route(makeSimpleTask(), "force_cloud"),
        route(makeEpicTask(), "force_cloud"),
      ];
      const binding = bindExecution(decisions, "force_cloud");

      for (const tb of binding.per_task_bindings) {
        assert.ok(
          validPaths.has(tb.execution_path),
          `invalid execution_path: ${tb.execution_path}`
        );
      }
    });

    test("per_task_bindings reflect decomposition per task independently", () => {
      const decisions = [
        route(makeSimpleTask(), "auto"),
        route(makeEpicTask(), "auto"),
      ];
      const binding = bindExecution(decisions, "auto");

      assert.equal(binding.per_task_bindings[0].decomposition_recommended, false);
      assert.equal(binding.per_task_bindings[1].decomposition_recommended, true);
    });
  });

  describe("runner args preserved with routing env", () => {
    test("--limit arg still present when routingEnv added", () => {
      const decisions = [route(makeSimpleTask(), "auto")];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { limit: 5, routingEnv }
      );

      assert.ok(invocation.args.includes("--limit"), "should still have --limit arg");
      assert.ok(invocation.args.includes("5"), "should have limit value");
    });

    test("--resume arg still present when routingEnv added", () => {
      const decisions = [route(makeSimpleTask(), "auto")];
      const binding = bindExecution(decisions, "auto");
      const routingEnv = buildExecutionBindingEnv(binding);

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { resumeId: "run-42", routingEnv }
      );

      assert.ok(invocation.args.includes("--resume"), "should still have --resume arg");
      assert.ok(invocation.args.includes("run-42"), "should have run id");
    });

    test("runner entry point path unchanged", () => {
      const routingEnv = buildExecutionBindingEnv(
        bindExecution([route(makeSimpleTask(), "auto")], "auto")
      );

      const invocation = resolvePackagedRunInvocation(
        "/workspace",
        "/runtime",
        { routingEnv }
      );

      assert.ok(
        invocation.args[0].endsWith(
          path.join("packages", "runner", "src", "factory-run.js")
        ),
        `runner entry should be unchanged: ${invocation.args[0]}`
      );
    });
  });
});
