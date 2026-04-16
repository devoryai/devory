import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  detectTargetReadiness,
  probeOllamaReadiness,
  resolveOllamaBaseUrl,
} from "./target-readiness.ts";
import { DEFAULT_ROUTING_POLICY, applyRoutingPolicyOverrides } from "./routing-policy.ts";

describe("target readiness detection", () => {
  test("marks Ollama target ready when probe confirms model inventory", () => {
    const readiness = detectTargetReadiness({
      target_ids: ["ollama:qwen2.5-coder:14b"],
      configured_target_ids: ["ollama:qwen2.5-coder:14b"],
      ollama_probe: {
        base_url: "http://localhost:11434",
        reachable: true,
        status: 200,
        models: ["qwen2.5-coder:14b"],
        detail: "ok",
      },
    });

    assert.equal(readiness.targets["ollama:qwen2.5-coder:14b"]?.state, "ready");
  });

  test("marks configured Ollama target unverified when no probe evidence exists", () => {
    const readiness = detectTargetReadiness({
      env: { OLLAMA_BASE_URL: "http://localhost:11434" },
      target_ids: ["ollama:qwen2.5-coder:14b"],
      configured_target_ids: ["ollama:qwen2.5-coder:14b"],
    });

    assert.equal(
      readiness.targets["ollama:qwen2.5-coder:14b"]?.state,
      "configured_but_unverified"
    );
  });

  test("marks configured cloud target unavailable when credentials are missing", () => {
    const readiness = detectTargetReadiness({
      target_ids: ["cloud:gpt-5-mini"],
      configured_target_ids: ["cloud:gpt-5-mini"],
    });

    assert.equal(readiness.targets["cloud:gpt-5-mini"]?.state, "unavailable");
  });

  test("policy block wins over cloud configuration", () => {
    const readiness = detectTargetReadiness({
      env: { OPENAI_API_KEY: "test-key" },
      policy: applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, {
        local_only: true,
      }),
      target_ids: ["cloud:gpt-5-mini"],
      configured_target_ids: ["cloud:gpt-5-mini"],
    });

    assert.equal(readiness.targets["cloud:gpt-5-mini"]?.state, "blocked_by_policy");
  });

  test("Ollama probe returns inventory from /api/tags response", async () => {
    const result = await probeOllamaReadiness({
      base_url: "http://localhost:11434",
      fetch_fn: async () =>
        new Response(
          JSON.stringify({ models: [{ name: "qwen2.5-coder:14b" }] }),
          { status: 200 }
        ),
    });

    assert.equal(result.reachable, true);
    assert.deepEqual(result.models, ["qwen2.5-coder:14b"]);
  });

  test("Ollama probe falls back to host IP candidate when localhost is unreachable", async () => {
    const seen: string[] = [];
    const result = await probeOllamaReadiness({
      env: { OLLAMA_HOST_IP: "172.31.64.1" },
      fetch_fn: async (input) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("http://localhost:11434")) {
          throw new Error("connect ECONNREFUSED");
        }
        if (url.startsWith("http://172.31.64.1:11434")) {
          return new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }), {
            status: 200,
          });
        }
        throw new Error(`unexpected url: ${url}`);
      },
    });

    assert.equal(result.reachable, true);
    assert.equal(result.base_url, "http://172.31.64.1:11434");
    assert.ok(seen.includes("http://172.31.64.1:11434/api/tags"));
  });

  test("resolveOllamaBaseUrl prefers OLLAMA_HOST_IP before localhost", () => {
    assert.equal(
      resolveOllamaBaseUrl({ OLLAMA_HOST_IP: "172.31.64.1" }),
      "http://172.31.64.1:11434"
    );
  });
});
