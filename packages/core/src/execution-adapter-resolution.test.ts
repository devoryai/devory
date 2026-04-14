import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveExecutionAdapter } from "./execution-adapter-resolution.ts";
import type { ProviderTargetEntry } from "./provider-target-resolver.ts";

function makeTarget(overrides: Partial<ProviderTargetEntry>): ProviderTargetEntry {
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
    readiness_detail: "model present",
    ...overrides,
  };
}

describe("execution adapter resolution", () => {
  test("maps deterministic target onto dry-run adapter lane", () => {
    const resolution = resolveExecutionAdapter({
      target: makeTarget({
        id: "deterministic:factory-default",
        provider_class: "deterministic",
        adapter_id: "deterministic",
        model_id: null,
        label: "Deterministic execution",
      }),
    });

    assert.equal(resolution?.adapter_id, "deterministic");
    assert.equal(resolution?.invocation_mode, "dry-run");
    assert.equal(resolution?.execution_path, "packaged_runner:dry-run");
    assert.equal(resolution?.available, true);
  });

  test("maps concrete ollama target onto local adapter lane", () => {
    const resolution = resolveExecutionAdapter({
      target: makeTarget({
        id: "ollama:deepseek-coder:6.7b",
        model_id: "deepseek-coder:6.7b",
      }),
    });

    assert.equal(resolution?.adapter_id, "ollama");
    assert.equal(resolution?.invocation_mode, "ollama");
    assert.equal(resolution?.execution_path, "packaged_runner:ollama");
  });

  test("marks unsupported concrete target unavailable without fabricating success", () => {
    const resolution = resolveExecutionAdapter({
      target: makeTarget({
        id: "cloud:claude-opus-4-1",
        provider_class: "cloud_premium",
        adapter_id: "cloud_api",
        model_id: "claude-opus-4-1",
        label: "Claude Opus 4.1",
      }),
    });

    assert.equal(resolution?.available, false);
    assert.match(resolution?.reason ?? "", /No execution adapter binding is implemented/);
  });

  test("respects blocked-by-policy readiness", () => {
    const resolution = resolveExecutionAdapter({
      target: makeTarget({
        id: "cloud:gpt-5-mini",
        provider_class: "cloud_premium",
        adapter_id: "cloud_api",
        model_id: "gpt-5-mini",
        label: "GPT-5 Mini",
        readiness_state: "blocked_by_policy",
      }),
      readiness_state: "blocked_by_policy",
    });

    assert.equal(resolution?.available, false);
    assert.match(resolution?.reason ?? "", /blocked by policy/);
  });
});
