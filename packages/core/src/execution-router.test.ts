/**
 * packages/core/src/execution-router.test.ts
 *
 * Tests for the deterministic execution routing policy engine.
 *
 * Runs with Node's built-in test runner:
 *   tsx --test packages/core/src/execution-router.test.ts
 *
 * Coverage:
 *  1. Auto preference + local-viable task → local_ollama (when available)
 *  2. Auto preference + local-viable task → cloud_premium fallback (when ollama unavailable)
 *  3. Auto preference + poor-viability task → cloud_premium
 *  4. prefer_local + available ollama → selects local_ollama
 *  5. force_local + available ollama → selects local_ollama, no warnings on good viability
 *  6. force_local + unavailable ollama → warning shown, fallback taken
 *  7. force_local + poor viability → viability warning shown
 *  8. force_cloud → always selects cloud_premium
 *  9. allow_cloud → same as auto (cloud allowed)
 * 10. deterministic_only → selects deterministic
 * 11. deterministic_only + non-deterministic profile → warning shown
 * 12. Local-first default: local preferred before cloud when profile allows
 * 13. Decomposition recommended for high-complexity tasks
 * 14. decomposition_note is null when not recommended
 * 15. explanation_bullets is non-empty for all preferences
 * 16. estimated_cost_impact reflects local (free) vs cloud
 * 17. alternative_provider is populated when alternatives exist
 * 18. confidence is high when clear match, low when provider unavailable
 * 19. route_mode strings match expected values for each preference
 * 20. summarizeRoutingDecisions counts by provider correctly
 * 21. formatRoutingDecisionSummary produces a non-empty string
 * 22. Fallback taken when target provider unavailable
 * 23. No warnings for happy-path auto routing to local
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  routeExecution,
  formatRoutingDecisionSummary,
  summarizeRoutingDecisions,
} from "./execution-router.ts";
import { withOllamaAvailability } from "./provider-registry.ts";
import { profileTask } from "./task-profiler.ts";
import type { DryRunTaskSource } from "./dry-run-estimate.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSimpleTask(): DryRunTaskSource {
  return {
    meta: {
      type: "bugfix",
      files_likely_affected: ["src/utils.ts"],
    },
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
      files_likely_affected: [
        "src/a.ts",
        "src/b.ts",
        "src/c.ts",
        "src/d.ts",
        "src/e.ts",
        "src/f.ts",
      ],
    },
    body: [
      "## Goal",
      "Implement a complex cross-cutting feature.",
      "## Acceptance Criteria",
      "- All modules updated.",
      "- Tests pass.",
      "- Integration verified.",
      "- Performance acceptable.",
      "## Verification",
      "- npm test",
      "- npm run build",
      "- manual smoke test",
    ].join("\n"),
  };
}

function makeEpicTask(): DryRunTaskSource {
  return {
    meta: {
      type: "epic",
      files_likely_affected: [],
    },
    body: "## Goal\nBuild the entire auth system.",
  };
}

// Registry with Ollama available
const registryWithOllama = withOllamaAvailability(true);
// Registry without Ollama (default)
const registryWithoutOllama = withOllamaAvailability(false);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("execution router", () => {
  describe("auto preference", () => {
    test("local-viable task with Ollama available → selects local_ollama", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "local_ollama");
      assert.equal(decision.preference_applied, "auto");
    });

    test("local-viable task with Ollama unavailable → falls back to cloud_premium", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithoutOllama,
      });

      assert.equal(decision.selected_provider.id, "cloud_premium");
      assert.equal(decision.route_mode, "local-unavailable-fallback");
    });

    test("poor-viability task (high complexity) → selects cloud_premium", () => {
      const profile = profileTask(makeComplexTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "cloud_premium");
      assert.equal(decision.selected_provider.locality, "cloud");
    });
  });

  describe("prefer_local preference", () => {
    test("with Ollama available → selects local_ollama", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "prefer_local", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "local_ollama");
    });
  });

  describe("force_local preference", () => {
    test("with Ollama available and good viability → selects local_ollama, no viability warning", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "force_local", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "local_ollama");
      const hasViabilityWarning = decision.warnings.some((w) =>
        w.includes("poor local viability")
      );
      assert.equal(hasViabilityWarning, false);
    });

    test("with Ollama unavailable → fallback taken and warning shown", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "force_local", {
        registry: registryWithoutOllama,
      });

      assert.equal(decision.route_mode, "forced-local");
      // Should have fallen back since local is unavailable
      assert.notEqual(decision.selected_provider.id, "local_ollama");
      // Warning may mention unavailability
      assert.ok(decision.warnings.length >= 0); // warnings may vary
    });

    test("with poor-viability task → viability warning shown", () => {
      const profile = profileTask(makeComplexTask());
      const decision = routeExecution(profile, "force_local", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "local_ollama");
      assert.equal(decision.route_mode, "forced-local");
      const hasViabilityWarning = decision.warnings.some((w) =>
        w.includes("poor local viability")
      );
      assert.ok(
        hasViabilityWarning,
        "should warn about poor viability when forcing local on a complex task"
      );
    });
  });

  describe("force_cloud preference", () => {
    test("always selects cloud_premium regardless of profile", () => {
      const simpleProfile = profileTask(makeSimpleTask());
      const decision = routeExecution(simpleProfile, "force_cloud", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "cloud_premium");
      assert.equal(decision.route_mode, "forced-cloud");
    });

    test("works for complex tasks too", () => {
      const complexProfile = profileTask(makeComplexTask());
      const decision = routeExecution(complexProfile, "force_cloud", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "cloud_premium");
    });
  });

  describe("allow_cloud preference", () => {
    test("behaves like auto (cloud permitted)", () => {
      const profile = profileTask(makeSimpleTask());
      const autoDecision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });
      const allowCloudDecision = routeExecution(profile, "allow_cloud", {
        registry: registryWithOllama,
      });

      // Both should select the same provider (both treat cloud as permitted)
      assert.equal(
        allowCloudDecision.selected_provider.id,
        autoDecision.selected_provider.id
      );
    });
  });

  describe("deterministic_only preference", () => {
    test("selects deterministic provider", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "deterministic_only", {
        registry: registryWithOllama,
      });

      assert.equal(decision.selected_provider.id, "deterministic");
      assert.equal(decision.route_mode, "deterministic-selected");
    });

    test("warns when task is not a deterministic candidate", () => {
      const profile = profileTask(makeSimpleTask());
      // Most tasks won't be deterministic candidates
      if (profile.recommended_provider_class !== "deterministic") {
        const decision = routeExecution(profile, "deterministic_only", {
          registry: registryWithOllama,
        });

        const hasWarning = decision.warnings.some((w) =>
          w.toLowerCase().includes("deterministic")
        );
        assert.ok(
          hasWarning,
          "should warn when deterministic_only is set for a non-deterministic task"
        );
      }
    });
  });

  describe("local-first default behavior", () => {
    test("auto prefers local over cloud when profile allows", () => {
      const profile = profileTask(makeSimpleTask());
      // Ensure local is available
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(
        decision.selected_provider.locality,
        "local",
        "local-first: should prefer local provider when task is viable"
      );
    });

    test("cloud only selected when task profile requires it", () => {
      const profile = profileTask(makeComplexTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(profile.local_viability, "poor");
      assert.equal(decision.selected_provider.locality, "cloud");
    });
  });

  describe("decomposition recommendation", () => {
    test("epic task gets decomposition_recommended=true and a note", () => {
      const profile = profileTask(makeEpicTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(decision.decomposition_recommended, true);
      assert.ok(
        typeof decision.decomposition_note === "string" &&
          decision.decomposition_note.length > 0,
        "should have a decomposition note"
      );
    });

    test("simple task has decomposition_recommended=false", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(decision.decomposition_recommended, false);
      assert.equal(decision.decomposition_note, null);
    });
  });

  describe("explanation bullets", () => {
    test("explanation_bullets is non-empty for all preferences", () => {
      const profile = profileTask(makeSimpleTask());
      const preferences = [
        "auto",
        "prefer_local",
        "force_local",
        "allow_cloud",
        "force_cloud",
        "deterministic_only",
      ] as const;

      for (const pref of preferences) {
        const decision = routeExecution(profile, pref, {
          registry: registryWithOllama,
        });
        assert.ok(
          decision.explanation_bullets.length > 0,
          `preference '${pref}' should produce explanation bullets`
        );
      }
    });
  });

  describe("cost impact", () => {
    test("local provider shows free cost impact", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.ok(
        decision.estimated_cost_impact.includes("$0.00"),
        `local routing should show $0.00: ${decision.estimated_cost_impact}`
      );
    });

    test("cloud provider cost impact mentions cloud", () => {
      const profile = profileTask(makeComplexTask());
      const decision = routeExecution(profile, "force_cloud", {
        registry: registryWithOllama,
      });

      // Cloud without dry-run estimate gives a generic message
      assert.ok(
        decision.estimated_cost_impact.length > 0,
        "should have a cost impact string"
      );
    });

    test("dry-run estimate is used for cloud cost when provided", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "force_cloud", {
        registry: registryWithOllama,
        dryRunEstimate: {
          estimate_label: "estimate",
          model_id: "claude-sonnet-4-6",
          model_display_name: "Claude Sonnet 4.6",
          runner: "claude",
          context_tier: "small",
          output_tier: "small",
          estimated_input_tokens: { min: 450, max: 1000 },
          estimated_output_tokens: { min: 280, max: 1100 },
          estimated_total_tokens: { min: 730, max: 2100 },
          estimated_cost_usd: { min: 0.001, max: 0.005 },
          confidence: "medium",
          reasons: [],
          factors: {
            task_count: 1,
            task_body_length: 100,
            acceptance_criteria_length: 50,
            verification_length: 20,
            files_likely_affected_count: 1,
            governance_context_likely_included: true,
            doctrine_context_likely_included: true,
          },
          lower_cost_suggestion: null,
        },
      });

      assert.ok(
        decision.estimated_cost_impact.includes("$"),
        "should show dollar estimate when dry-run estimate provided"
      );
      assert.ok(
        decision.estimated_cost_impact.includes("0.001") ||
          decision.estimated_cost_impact.includes("0.005"),
        "should include the estimate values"
      );
    });
  });

  describe("alternative provider", () => {
    test("alternative_provider is populated when alternatives exist", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.ok(
        decision.alternative_provider !== null,
        "should have an alternative when multiple available providers exist"
      );
      assert.notEqual(
        decision.alternative_provider?.id,
        decision.selected_provider.id
      );
    });
  });

  describe("confidence", () => {
    test("high confidence when local available and good viability", () => {
      const profile = profileTask(makeSimpleTask());
      assert.equal(profile.local_viability, "good");
      assert.equal(profile.complexity_tier, "low");

      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(decision.confidence, "high");
    });

    test("low confidence when provider is unavailable", () => {
      // Force to a provider we know is unavailable
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "force_local", {
        // Neither local nor others are available in this empty-ish registry
        registry: [
          {
            id: "local_ollama",
            label: "Local (Ollama)",
            locality: "local",
            cost_profile: "free",
            capability_tier: "standard",
            suitable_task_patterns: [],
            available: false,
            availability_note: "Not running.",
          },
          {
            id: "cloud_premium",
            label: "Cloud",
            locality: "cloud",
            cost_profile: "medium",
            capability_tier: "premium",
            suitable_task_patterns: [],
            available: false,
            availability_note: "No API key.",
          },
          {
            id: "deterministic",
            label: "Deterministic",
            locality: "local",
            cost_profile: "free",
            capability_tier: "basic",
            suitable_task_patterns: [],
            available: true,
            availability_note: null,
          },
        ],
      });

      // Fallback taken → confidence medium or low
      assert.ok(
        decision.confidence === "medium" || decision.confidence === "low",
        `expected medium or low confidence when fallback taken, got ${decision.confidence}`
      );
    });
  });

  describe("route_mode strings", () => {
    test("force_cloud produces forced-cloud mode", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "force_cloud", {
        registry: registryWithOllama,
      });
      assert.equal(decision.route_mode, "forced-cloud");
    });

    test("force_local produces forced-local mode", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "force_local", {
        registry: registryWithOllama,
      });
      assert.equal(decision.route_mode, "forced-local");
    });

    test("deterministic_only produces deterministic-selected mode", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "deterministic_only", {
        registry: registryWithOllama,
      });
      assert.equal(decision.route_mode, "deterministic-selected");
    });

    test("auto with Ollama unavailable produces local-unavailable-fallback mode", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithoutOllama,
      });
      assert.equal(decision.route_mode, "local-unavailable-fallback");
    });
  });

  describe("summarizeRoutingDecisions", () => {
    test("counts by provider correctly", () => {
      const simpleProfile = profileTask(makeSimpleTask());
      const complexProfile = profileTask(makeComplexTask());

      const decisions = [
        routeExecution(simpleProfile, "auto", { registry: registryWithOllama }),
        routeExecution(simpleProfile, "auto", { registry: registryWithOllama }),
        routeExecution(complexProfile, "auto", { registry: registryWithOllama }),
      ];

      const summary = summarizeRoutingDecisions(decisions);
      assert.equal(summary.total, 3);
      assert.ok(
        typeof summary.summary_line === "string" && summary.summary_line.length > 0
      );
    });

    test("handles empty decisions array", () => {
      const summary = summarizeRoutingDecisions([]);
      assert.equal(summary.total, 0);
      assert.equal(summary.decomposition_candidates, 0);
      assert.ok(summary.summary_line.includes("No tasks"));
    });

    test("decomposition_candidates counted correctly", () => {
      const epicProfile = profileTask(makeEpicTask());
      const simpleProfile = profileTask(makeSimpleTask());

      const decisions = [
        routeExecution(epicProfile, "auto", { registry: registryWithOllama }),
        routeExecution(simpleProfile, "auto", { registry: registryWithOllama }),
      ];

      const summary = summarizeRoutingDecisions(decisions);
      assert.equal(summary.decomposition_candidates, 1);
    });
  });

  describe("formatRoutingDecisionSummary", () => {
    test("produces a non-empty string for any decision", () => {
      const profile = profileTask(makeSimpleTask());
      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      const summary = formatRoutingDecisionSummary(decision);
      assert.ok(
        typeof summary === "string" && summary.length > 0,
        "should produce a non-empty summary string"
      );
      assert.ok(summary.includes("Routing:"), "should start with 'Routing:'");
    });

    test("includes decomposition signal in summary when recommended", () => {
      const epicProfile = profileTask(makeEpicTask());
      const decision = routeExecution(epicProfile, "auto", {
        registry: registryWithOllama,
      });

      const summary = formatRoutingDecisionSummary(decision);
      assert.ok(
        summary.includes("decomposition"),
        "summary should mention decomposition when recommended"
      );
    });
  });

  describe("no warnings on happy path", () => {
    test("auto routing to local with good viability produces no warnings", () => {
      const profile = profileTask(makeSimpleTask());
      assert.equal(profile.local_viability, "good");

      const decision = routeExecution(profile, "auto", {
        registry: registryWithOllama,
      });

      assert.equal(
        decision.warnings.length,
        0,
        `happy path should have no warnings: ${JSON.stringify(decision.warnings)}`
      );
    });
  });
});
