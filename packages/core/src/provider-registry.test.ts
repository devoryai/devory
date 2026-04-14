/**
 * packages/core/src/provider-registry.test.ts
 *
 * Tests for the provider class registry.
 *
 * Runs with Node's built-in test runner:
 *   tsx --test packages/core/src/provider-registry.test.ts
 *
 * Coverage:
 *  1. PROVIDER_REGISTRY contains the three expected provider classes
 *  2. deterministic provider is always available
 *  3. local_ollama provider defaults to unavailable (requires config)
 *  4. cloud_premium provider is available by default
 *  5. getProviderById returns correct entry for each known id
 *  6. getProviderById returns null for unknown id
 *  7. getAvailableProviders excludes unavailable providers
 *  8. withOllamaAvailability(true) makes local_ollama available
 *  9. withOllamaAvailability(false) keeps local_ollama unavailable
 * 10. withOllamaAvailability does not mutate PROVIDER_REGISTRY
 * 11. getFallbackProvider returns next available entry in order
 * 12. getFallbackProvider returns null when no fallback exists
 * 13. All providers have non-empty labels and suitable_task_patterns
 * 14. Provider locality values are valid ("local" or "cloud")
 * 15. Local providers have free cost profile
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  PROVIDER_REGISTRY,
  getAvailableProviders,
  getFallbackProvider,
  getProviderById,
  withOllamaAvailability,
} from "./provider-registry.ts";

describe("provider registry", () => {
  test("PROVIDER_REGISTRY contains deterministic, local_ollama, and cloud_premium", () => {
    const ids = PROVIDER_REGISTRY.map((p) => p.id);
    assert.ok(ids.includes("deterministic"), "should include deterministic");
    assert.ok(ids.includes("local_ollama"), "should include local_ollama");
    assert.ok(ids.includes("cloud_premium"), "should include cloud_premium");
    assert.equal(ids.length, 3, "should have exactly 3 providers");
  });

  test("deterministic provider is always available", () => {
    const det = PROVIDER_REGISTRY.find((p) => p.id === "deterministic");
    assert.ok(det, "deterministic provider should exist");
    assert.equal(det.available, true);
    assert.equal(det.availability_note, null);
  });

  test("local_ollama defaults to unavailable", () => {
    const ollama = PROVIDER_REGISTRY.find((p) => p.id === "local_ollama");
    assert.ok(ollama, "local_ollama provider should exist");
    assert.equal(
      ollama.available,
      false,
      "local_ollama should be unavailable by default (requires config)"
    );
    assert.ok(
      typeof ollama.availability_note === "string" &&
        ollama.availability_note.length > 0,
      "should have an availability note explaining how to enable"
    );
  });

  test("cloud_premium is available by default", () => {
    const cloud = PROVIDER_REGISTRY.find((p) => p.id === "cloud_premium");
    assert.ok(cloud, "cloud_premium provider should exist");
    assert.equal(cloud.available, true);
  });

  test("getProviderById returns correct entry for deterministic", () => {
    const entry = getProviderById("deterministic");
    assert.ok(entry, "should find deterministic");
    assert.equal(entry.id, "deterministic");
    assert.equal(entry.locality, "local");
  });

  test("getProviderById returns correct entry for local_ollama", () => {
    const entry = getProviderById("local_ollama");
    assert.ok(entry, "should find local_ollama");
    assert.equal(entry.id, "local_ollama");
    assert.equal(entry.locality, "local");
  });

  test("getProviderById returns correct entry for cloud_premium", () => {
    const entry = getProviderById("cloud_premium");
    assert.ok(entry, "should find cloud_premium");
    assert.equal(entry.id, "cloud_premium");
    assert.equal(entry.locality, "cloud");
  });

  test("getProviderById returns null for unknown id", () => {
    // @ts-expect-error intentionally passing unknown id
    const entry = getProviderById("unknown_provider");
    assert.equal(entry, null);
  });

  test("getAvailableProviders excludes local_ollama when unavailable", () => {
    const available = getAvailableProviders();
    const ids = available.map((p) => p.id);
    assert.ok(!ids.includes("local_ollama"), "unavailable provider should be excluded");
    assert.ok(ids.includes("deterministic"));
    assert.ok(ids.includes("cloud_premium"));
  });

  test("withOllamaAvailability(true) makes local_ollama available", () => {
    const registry = withOllamaAvailability(true);
    const ollama = registry.find((p) => p.id === "local_ollama");
    assert.ok(ollama, "should exist in result");
    assert.equal(ollama.available, true);
  });

  test("withOllamaAvailability(false) keeps local_ollama unavailable", () => {
    const registry = withOllamaAvailability(false);
    const ollama = registry.find((p) => p.id === "local_ollama");
    assert.ok(ollama, "should exist in result");
    assert.equal(ollama.available, false);
  });

  test("withOllamaAvailability does not mutate PROVIDER_REGISTRY", () => {
    const originalOllama = PROVIDER_REGISTRY.find(
      (p) => p.id === "local_ollama"
    );
    assert.ok(originalOllama);
    const before = originalOllama.available;

    withOllamaAvailability(true);

    const afterOllama = PROVIDER_REGISTRY.find((p) => p.id === "local_ollama");
    assert.equal(
      afterOllama?.available,
      before,
      "PROVIDER_REGISTRY should not be mutated"
    );
  });

  test("getFallbackProvider returns next available entry after local_ollama", () => {
    // With local_ollama unavailable (default), fallback from it is cloud_premium
    const fallback = getFallbackProvider("local_ollama");
    assert.ok(fallback, "should find a fallback");
    assert.equal(fallback.id, "cloud_premium");
  });

  test("getFallbackProvider returns null when cloud_premium has no fallback", () => {
    const fallback = getFallbackProvider("cloud_premium");
    assert.equal(fallback, null, "cloud_premium is the last in the registry");
  });

  test("getFallbackProvider returns null for unknown id", () => {
    // @ts-expect-error intentionally passing unknown id
    const fallback = getFallbackProvider("nonexistent");
    assert.equal(fallback, null);
  });

  test("all providers have non-empty labels and task patterns", () => {
    for (const provider of PROVIDER_REGISTRY) {
      assert.ok(
        typeof provider.label === "string" && provider.label.length > 0,
        `provider ${provider.id} should have a label`
      );
      assert.ok(
        Array.isArray(provider.suitable_task_patterns) &&
          provider.suitable_task_patterns.length > 0,
        `provider ${provider.id} should have suitable_task_patterns`
      );
    }
  });

  test("provider locality values are valid", () => {
    const validLocalities = new Set(["local", "cloud"]);
    for (const provider of PROVIDER_REGISTRY) {
      assert.ok(
        validLocalities.has(provider.locality),
        `provider ${provider.id} has invalid locality: ${provider.locality}`
      );
    }
  });

  test("local providers have free cost profile", () => {
    for (const provider of PROVIDER_REGISTRY) {
      if (provider.locality === "local") {
        assert.equal(
          provider.cost_profile,
          "free",
          `local provider ${provider.id} should have free cost profile`
        );
      }
    }
  });

  test("registry is ordered local-first (deterministic before local_ollama before cloud)", () => {
    const ids = PROVIDER_REGISTRY.map((p) => p.id);
    const detIndex = ids.indexOf("deterministic");
    const ollamaIndex = ids.indexOf("local_ollama");
    const cloudIndex = ids.indexOf("cloud_premium");

    assert.ok(detIndex < ollamaIndex, "deterministic should come before local_ollama");
    assert.ok(ollamaIndex < cloudIndex, "local_ollama should come before cloud_premium");
  });
});
