import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildProviderDoctorSnapshot,
  describeExecutionPreflightBlock,
} from "./provider-readiness.ts";
import type { ExecutionBindingResult } from "./execution-binding.ts";
import type { ProviderTargetEntry } from "./provider-target-resolver.ts";

function makeTarget(
  overrides: Partial<ProviderTargetEntry>
): ProviderTargetEntry {
  return {
    id: "ollama:qwen2.5-coder:14b",
    provider_class: "local_ollama",
    adapter_id: "ollama",
    model_id: "qwen2.5-coder:14b",
    label: "Qwen 2.5 Coder 14B (Ollama)",
    configured: true,
    available: true,
    adapter_available: true,
    relative_cost: "free",
    capability_hint: "coding",
    suitable_task_patterns: ["feature"],
    availability_note: null,
    readiness_state: "ready",
    readiness_detail: "Model present in Ollama inventory.",
    ...overrides,
  };
}

function makeBinding(
  overrides: Partial<ExecutionBindingResult> = {}
): ExecutionBindingResult {
  return {
    selected_provider_class: "local_ollama",
    execution_path: "unavailable_stopped",
    preference_applied: "force_local",
    fallback_taken: true,
    originally_targeted_class: "local_ollama",
    fallback_reason: "Local model (Ollama) not available",
    force_local_violated: true,
    warnings: [],
    decomposition_recommended: false,
    decomposition_note: null,
    route_mode: "forced-local",
    binding_summary: "summary",
    per_task_bindings: [],
    cloud_confirmation_required: false,
    blocked_by_policy: false,
    policy_block_reason: null,
    policy_effects: [],
    selected_target_id: "ollama:qwen2.5-coder:14b",
    actual_target_id: null,
    selected_adapter_id: "ollama",
    actual_adapter_id: null,
    adapter_id: null,
    selected_execution_path: "packaged_runner:ollama",
    actual_execution_path: null,
    adapter_fallback_taken: false,
    adapter_fallback_reason: "Concrete target \"ollama:qwen2.5-coder:14b\" is not runnable in the current workspace.",
    adapter_resolution_note: null,
    target_fallback_taken: false,
    target_fallback_reason: null,
    target_resolution: null,
    target_readiness_state: "unavailable",
    target_readiness_detail: "Model qwen2.5-coder:14b not found in Ollama inventory.",
    fallback_cause: "readiness",
    target_fallback_cause: "readiness",
    ...overrides,
  };
}

describe("provider readiness snapshot", () => {
  test("marks a supported provider routeable when a truthful target is ready", () => {
    const snapshot = buildProviderDoctorSnapshot({
      env: { OLLAMA_BASE_URL: "http://localhost:11434" },
      target_registry: [makeTarget()],
      ollama_probe: {
        base_url: "http://localhost:11434",
        reachable: true,
        status: 200,
        models: ["qwen2.5-coder:14b"],
        detail: "Loaded 1 Ollama model tag.",
      },
    });

    const ollama = snapshot.providers.find((entry) => entry.id === "ollama");
    assert.ok(ollama);
    assert.equal(ollama.support_level, "first_class");
    assert.equal(ollama.configured, true);
    assert.equal(ollama.reachable, "reachable");
    assert.equal(ollama.routeable, true);
    assert.match(ollama.routeable_detail, /Routeable now via ollama:qwen2\.5-coder:14b/);
    assert.ok(snapshot.routeable_provider_ids.includes("ollama"));
    assert.ok(snapshot.viable_provider_ids.includes("ollama"));
  });

  test("marks a supported provider unconfigured when credentials are missing", () => {
    const snapshot = buildProviderDoctorSnapshot({
      env: {},
      target_registry: [
        makeTarget({
          id: "cloud:gpt-5-mini",
          provider_class: "cloud_premium",
          adapter_id: "cloud_api",
          model_id: "gpt-5-mini",
          label: "GPT-5 Mini",
          available: false,
          adapter_available: false,
          readiness_state: "unavailable",
          readiness_detail: "OpenAI credentials missing. Set OPENAI_API_KEY.",
        }),
      ],
    });

    const openai = snapshot.providers.find((entry) => entry.id === "openai");
    assert.ok(openai);
    assert.equal(openai.support_level, "first_class");
    assert.equal(openai.configured, false);
    assert.equal(openai.reachable, "unreachable");
    assert.equal(openai.routeable, false);
    assert.match(openai.routeable_detail, /none are runnable right now|No configured routed targets available/);
    assert.equal(snapshot.routeable_provider_ids.includes("openai"), false);
  });

  test("marks Ollama reachable but not routeable when routed model is missing", () => {
    const snapshot = buildProviderDoctorSnapshot({
      env: { OLLAMA_BASE_URL: "http://localhost:11434" },
      target_registry: [
        makeTarget({
          available: false,
          adapter_available: false,
          readiness_state: "unavailable",
          readiness_detail:
            "Model qwen2.5-coder:14b not found in Ollama inventory.",
        }),
      ],
      ollama_probe: {
        base_url: "http://localhost:11434",
        reachable: true,
        status: 200,
        models: ["qwen2.5-coder:7b"],
        detail: "Loaded 1 Ollama model tag.",
      },
    });

    const ollama = snapshot.providers.find((entry) => entry.id === "ollama");
    assert.ok(ollama);
    assert.equal(ollama.reachable, "reachable");
    assert.equal(ollama.routeable, false);
    assert.match(ollama.target_models_detail, /Missing: qwen2.5-coder:14b/);
  });

  test("classifies Copilot as experimental and Gemini as unsupported", () => {
    const snapshot = buildProviderDoctorSnapshot({
      env: { GH_TOKEN: "test-token" },
      target_registry: [],
    });

    const copilot = snapshot.providers.find((entry) => entry.id === "copilot");
    const gemini = snapshot.providers.find((entry) => entry.id === "gemini");
    assert.ok(copilot);
    assert.ok(gemini);
    assert.equal(copilot.support_level, "experimental_adapter");
    assert.equal(copilot.routeable, false);
    assert.equal(gemini.support_level, "unsupported");
    assert.equal(gemini.supported, false);
  });
});

describe("execution preflight block descriptions", () => {
  test("returns actionable Ollama remediation when local execution is blocked", () => {
    const snapshot = buildProviderDoctorSnapshot({
      env: { OLLAMA_BASE_URL: "http://localhost:11434" },
      target_registry: [
        makeTarget({
          available: false,
          adapter_available: false,
          readiness_state: "unavailable",
          readiness_detail:
            "Model qwen2.5-coder:14b not found in Ollama inventory.",
        }),
      ],
      ollama_probe: {
        base_url: "http://localhost:11434",
        reachable: true,
        status: 200,
        models: ["qwen2.5-coder:7b"],
        detail: "Loaded 1 Ollama model tag.",
      },
    });

    const block = describeExecutionPreflightBlock(makeBinding(), snapshot);
    assert.ok(block);
    assert.match(block.title, /No viable local execution target is ready/);
    assert.ok(
      block.suggestions.some((entry) => entry.includes("Install or switch")),
      JSON.stringify(block.suggestions)
    );
  });
});
