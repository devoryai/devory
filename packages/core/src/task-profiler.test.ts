/**
 * packages/core/src/task-profiler.test.ts
 *
 * Tests for deterministic task profiling.
 *
 * Runs with Node's built-in test runner:
 *   tsx --test packages/core/src/task-profiler.test.ts
 *
 * Coverage:
 *  1. Low-complexity task → low complexity tier, good local viability, local provider
 *  2. High file count → high complexity, poor local viability, cloud provider
 *  3. Epic task type → high complexity, decomposition candidate, cloud provider
 *  4. Large body + acceptance criteria → medium complexity, marginal viability
 *  5. context_intensity=high → high complexity, poor viability, cloud provider
 *  6. context_intensity=medium → medium complexity signal applied
 *  7. Small task with no files → may recommend deterministic provider
 *  8. Dependency count is extracted from depends_on
 *  9. has_preferred_models signal set when preferred_models non-empty
 * 10. has_disallowed_models signal set when disallowed_models non-empty
 * 11. Reasons array is non-empty and contains expected content
 * 12. Task with 2-5 files → medium complexity
 * 13. Missing metadata fields are handled safely (no exceptions)
 * 14. Empty source → low complexity, small tiers
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { profileTask } from "./task-profiler.ts";
import type { TaskProfile } from "./task-profiler.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBody(sections: {
  goal?: string;
  acceptanceCriteria?: string[];
  verification?: string[];
} = {}): string {
  const parts: string[] = [];
  if (sections.goal) {
    parts.push("## Goal", sections.goal);
  }
  if (sections.acceptanceCriteria?.length) {
    parts.push(
      "## Acceptance Criteria",
      ...sections.acceptanceCriteria.map((c) => `- ${c}`)
    );
  }
  if (sections.verification?.length) {
    parts.push(
      "## Verification",
      ...sections.verification.map((v) => `- ${v}`)
    );
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("task profiler", () => {
  test("low-complexity task produces low tier, good viability, local recommendation", () => {
    const profile = profileTask({
      meta: {
        type: "bugfix",
        files_likely_affected: ["src/utils.ts"],
      },
      body: makeBody({
        goal: "Fix a small edge case in the utility function.",
        acceptanceCriteria: ["Edge case is handled."],
        verification: ["npm test"],
      }),
    });

    assert.equal(profile.complexity_tier, "low");
    assert.equal(profile.local_viability, "good");
    assert.equal(profile.recommended_provider_class, "local");
    assert.equal(profile.decomposition_candidate, false);
    assert.ok(profile.reasons.length > 0);
  });

  test("high file count (>5) produces high complexity and cloud recommendation", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        files_likely_affected: [
          "src/a.ts",
          "src/b.ts",
          "src/c.ts",
          "src/d.ts",
          "src/e.ts",
          "src/f.ts",
          "src/g.ts",
        ],
      },
      body: makeBody({
        goal: "Implement a cross-cutting feature across many files.",
        acceptanceCriteria: [
          "All modules updated.",
          "Tests pass.",
          "Integration verified.",
        ],
        verification: ["npm test", "npm run build"],
      }),
    });

    assert.equal(profile.complexity_tier, "high");
    assert.equal(profile.local_viability, "poor");
    assert.equal(profile.recommended_provider_class, "cloud");
    assert.ok(profile.signals.files_likely_affected_count === 7);
  });

  test("epic task type always produces high complexity and is a decomposition candidate", () => {
    const profile = profileTask({
      meta: {
        type: "epic",
        files_likely_affected: [],
      },
      body: makeBody({ goal: "Build the entire auth system." }),
    });

    assert.equal(profile.complexity_tier, "high");
    assert.equal(profile.decomposition_candidate, true);
    assert.equal(profile.recommended_provider_class, "cloud");
    assert.equal(profile.signals.task_type, "epic");
    const hasEpicReason = profile.reasons.some((r) =>
      r.toLowerCase().includes("epic")
    );
    assert.ok(hasEpicReason, "reasons should mention epic");
  });

  test("large acceptance criteria body signals medium complexity", () => {
    const manyItems = Array.from({ length: 15 }, (_, i) =>
      `Criterion ${i + 1} must pass with specific conditions applied carefully.`
    );
    const profile = profileTask({
      meta: {
        type: "feature",
        files_likely_affected: ["src/feature.ts", "src/feature.test.ts"],
      },
      body: makeBody({
        goal: "Add a moderately complex feature.",
        acceptanceCriteria: manyItems,
        verification: ["npm test", "npm run lint"],
      }),
    });

    assert.ok(
      profile.complexity_tier === "medium" || profile.complexity_tier === "high",
      `expected medium or high, got ${profile.complexity_tier}`
    );
    assert.notEqual(profile.complexity_tier, "low");
  });

  test("context_intensity=high produces high complexity and poor local viability", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        context_intensity: "high",
        files_likely_affected: ["src/feature.ts"],
      },
      body: makeBody({ goal: "Feature requiring broad context." }),
    });

    assert.equal(profile.complexity_tier, "high");
    assert.equal(profile.local_viability, "poor");
    assert.equal(profile.recommended_provider_class, "cloud");
    assert.equal(profile.signals.context_intensity_hint, "high");
    const hasContextReason = profile.reasons.some((r) =>
      r.includes("context_intensity=high")
    );
    assert.ok(hasContextReason, "reasons should mention context_intensity=high");
  });

  test("context_intensity=medium produces medium complexity signal", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        context_intensity: "medium",
        files_likely_affected: [],
      },
      body: makeBody({ goal: "Feature with moderate context needs." }),
    });

    assert.equal(profile.signals.context_intensity_hint, "medium");
    assert.ok(
      profile.complexity_tier === "medium" || profile.complexity_tier === "high",
      `expected at least medium, got ${profile.complexity_tier}`
    );
  });

  test("trivial task with no files may produce deterministic recommendation", () => {
    const profile = profileTask({
      meta: {
        type: "test",
        files_likely_affected: [],
      },
      body: "Fix typo.",
    });

    // Very small task — deterministic or local are both acceptable
    assert.ok(
      profile.recommended_provider_class === "deterministic" ||
        profile.recommended_provider_class === "local",
      `expected deterministic or local, got ${profile.recommended_provider_class}`
    );
    assert.equal(profile.complexity_tier, "low");
  });

  test("dependency count is extracted from depends_on array", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        depends_on: ["factory-001", "factory-002", "factory-003"],
        files_likely_affected: [],
      },
      body: makeBody({ goal: "Task with dependencies." }),
    });

    assert.equal(profile.signals.dependency_count, 3);
  });

  test("has_preferred_models is true when preferred_models is non-empty", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        preferred_models: ["claude-sonnet-4-6"],
        files_likely_affected: [],
      },
      body: makeBody({ goal: "Task with model preference." }),
    });

    assert.equal(profile.signals.has_preferred_models, true);
  });

  test("has_disallowed_models is true when disallowed_models is non-empty", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        disallowed_models: ["gpt-4"],
        files_likely_affected: [],
      },
      body: makeBody({ goal: "Task with disallowed model." }),
    });

    assert.equal(profile.signals.has_disallowed_models, true);
  });

  test("reasons array is non-empty and contains file count information", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        files_likely_affected: ["src/a.ts", "src/b.ts"],
      },
      body: makeBody({ goal: "A feature." }),
    });

    assert.ok(profile.reasons.length >= 3, "should have multiple reasons");
    const hasFileReason = profile.reasons.some((r) =>
      r.includes("file")
    );
    assert.ok(hasFileReason, "should mention file count");
  });

  test("2-3 files produce at least medium complexity", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        files_likely_affected: ["src/a.ts", "src/b.ts"],
      },
      body: makeBody({ goal: "A small feature." }),
    });

    assert.ok(
      profile.complexity_tier === "medium" || profile.complexity_tier === "high",
      `expected at least medium, got ${profile.complexity_tier}`
    );
    assert.equal(profile.signals.files_likely_affected_count, 2);
  });

  test("missing metadata fields are handled safely without exceptions", () => {
    let profile: TaskProfile;
    assert.doesNotThrow(() => {
      profile = profileTask({});
    });
    assert.ok(profile!.complexity_tier);
    assert.ok(profile!.local_viability);
    assert.ok(profile!.recommended_provider_class);
    assert.equal(profile!.signals.dependency_count, 0);
    assert.equal(profile!.signals.has_preferred_models, false);
    assert.equal(profile!.signals.has_disallowed_models, false);
  });

  test("empty source produces low complexity and small tiers", () => {
    const profile = profileTask({});

    assert.equal(profile.complexity_tier, "low");
    assert.equal(profile.context_size_tier, "small");
    assert.equal(profile.output_size_tier, "small");
  });

  test("profile includes correct size tiers from dry-run estimate", () => {
    const profile = profileTask({
      meta: {
        type: "feature",
        files_likely_affected: ["a.ts"],
      },
      body: makeBody({
        goal: "Simple feature.",
        acceptanceCriteria: ["Works."],
        verification: ["npm test"],
      }),
    });

    // These should be valid tier values
    assert.ok(
      ["small", "medium", "large"].includes(profile.context_size_tier),
      `context_size_tier must be a valid tier: ${profile.context_size_tier}`
    );
    assert.ok(
      ["small", "medium", "large"].includes(profile.output_size_tier),
      `output_size_tier must be a valid tier: ${profile.output_size_tier}`
    );
  });
});
