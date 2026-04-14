/**
 * packages/core/src/task-profiler.ts
 *
 * Deterministic task profiling for execution routing.
 *
 * Analyzes a task using its metadata and body content to produce a compact
 * structured profile: complexity tier, context/output size, local viability,
 * decomposition signal, and recommended provider class.
 *
 * Pure functions — no I/O. All heuristics are transparent and inspectable.
 *
 * Entry point: profileTask()
 */

import type { DryRunSizeTier, DryRunTaskSource } from "./dry-run-estimate.ts";
import { estimateDryRunForTask } from "./dry-run-estimate.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How complex this task appears based on content signals. */
export type ComplexityTier = "low" | "medium" | "high";

/**
 * How well-suited this task is for local model execution.
 * Based on complexity, context size, and metadata hints.
 */
export type LocalViabilityTier = "good" | "marginal" | "poor";

/**
 * The recommended class of execution provider for this task.
 * Does not name a specific model — describes the tier.
 */
export type RecommendedProviderClass = "deterministic" | "local" | "cloud";

/** Raw signals extracted from the task source. */
export interface TaskProfileSignals {
  /** Total character length of the task body. */
  body_length: number;
  /** Character length of the acceptance criteria section. */
  acceptance_criteria_length: number;
  /** Character length of the verification section. */
  verification_length: number;
  /** Number of files listed in files_likely_affected. */
  files_likely_affected_count: number;
  /** Number of entries in depends_on. */
  dependency_count: number;
  /** Normalized task type (lowercase), or null if absent. */
  task_type: string | null;
  /** context_intensity from task metadata (lowercase), or null if absent. */
  context_intensity_hint: string | null;
  /** True if the task specifies preferred_models. */
  has_preferred_models: boolean;
  /** True if the task specifies disallowed_models. */
  has_disallowed_models: boolean;
}

/** Complete task profile produced by the profiler. */
export interface TaskProfile {
  /** Estimated task complexity tier derived from content signals. */
  complexity_tier: ComplexityTier;
  /** Estimated context (input) size tier for this task. */
  context_size_tier: DryRunSizeTier;
  /** Estimated output size tier for this task. */
  output_size_tier: DryRunSizeTier;
  /**
   * Estimated suitability of this task for local model execution.
   * "good" = strong local candidate. "poor" = cloud recommended.
   */
  local_viability: LocalViabilityTier;
  /**
   * True when task appears too broad for efficient execution without
   * first decomposing into subtasks.
   */
  decomposition_candidate: boolean;
  /** Provider class recommended for this task by the profiler. */
  recommended_provider_class: RecommendedProviderClass;
  /** Raw signals used to derive the profile. */
  signals: TaskProfileSignals;
  /** Human-readable reasons explaining the profile outcome. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Internal heuristics (pure functions)
// ---------------------------------------------------------------------------

function deriveComplexityTier(
  signals: TaskProfileSignals,
  contextSizeTier: DryRunSizeTier,
  outputSizeTier: DryRunSizeTier
): ComplexityTier {
  // Epic tasks are always high complexity — they must be decomposed
  if (signals.task_type === "epic") return "high";

  // Explicit high context intensity from task metadata
  if (signals.context_intensity_hint === "high") return "high";

  // Large context or very high file count
  if (contextSizeTier === "large") return "high";
  if (signals.files_likely_affected_count > 5) return "high";

  // Medium-tier signals
  if (signals.context_intensity_hint === "medium") return "medium";
  if (contextSizeTier === "medium") return "medium";
  if (outputSizeTier === "large") return "medium";
  if (signals.files_likely_affected_count >= 2) return "medium";
  if (signals.acceptance_criteria_length > 400) return "medium";
  if (signals.body_length > 1500) return "medium";

  return "low";
}

function deriveLocalViability(
  complexityTier: ComplexityTier,
  contextSizeTier: DryRunSizeTier,
  signals: TaskProfileSignals
): LocalViabilityTier {
  // Poor viability: task is too large/complex for typical local models
  if (complexityTier === "high") return "poor";
  if (contextSizeTier === "large") return "poor";
  if (signals.context_intensity_hint === "high") return "poor";

  // Good viability: clearly fits within local model capacity
  if (complexityTier === "low" && contextSizeTier === "small") return "good";

  // Marginal: within range but not a clear fit
  return "marginal";
}

function deriveRecommendedProviderClass(
  localViability: LocalViabilityTier,
  signals: TaskProfileSignals,
  outputSizeTier: DryRunSizeTier
): RecommendedProviderClass {
  // Cloud when local is not viable
  if (localViability === "poor") return "cloud";

  // Deterministic path for truly trivial tasks with no real code output needed
  if (
    outputSizeTier === "small" &&
    signals.body_length < 300 &&
    signals.files_likely_affected_count === 0 &&
    signals.acceptance_criteria_length < 50
  ) {
    return "deterministic";
  }

  return "local";
}

function buildProfileReasons(
  signals: TaskProfileSignals,
  complexityTier: ComplexityTier,
  contextSizeTier: DryRunSizeTier,
  localViability: LocalViabilityTier,
  decompositionCandidate: boolean
): string[] {
  const reasons: string[] = [];

  if (signals.task_type === "epic") {
    reasons.push(
      "Task type is 'epic'; treated as high complexity and decomposition required."
    );
  }

  if (signals.context_intensity_hint === "high") {
    reasons.push(
      "Task metadata sets context_intensity=high; cloud execution preferred."
    );
  } else if (signals.context_intensity_hint === "medium") {
    reasons.push(
      "Task metadata sets context_intensity=medium; medium complexity signal."
    );
  }

  if (signals.files_likely_affected_count > 5) {
    reasons.push(
      `High file count (${signals.files_likely_affected_count} files) indicates cross-cutting scope.`
    );
  } else if (signals.files_likely_affected_count >= 2) {
    reasons.push(
      `File count (${signals.files_likely_affected_count} files affected) suggests moderate scope.`
    );
  } else if (signals.files_likely_affected_count === 0) {
    reasons.push("No specific files listed; scope appears narrow or is unknown.");
  }

  if (contextSizeTier === "large") {
    reasons.push("Large context size estimated; may exceed local model context limits.");
  } else if (contextSizeTier === "medium") {
    reasons.push("Medium context size estimated; within local model capacity with care.");
  } else {
    reasons.push("Small context size estimated; well within local model capacity.");
  }

  if (complexityTier === "high") {
    reasons.push("High complexity: cloud execution recommended.");
  } else if (complexityTier === "medium") {
    reasons.push("Medium complexity: local execution viable with a capable local model.");
  } else {
    reasons.push("Low complexity: strong local candidate.");
  }

  if (decompositionCandidate) {
    reasons.push(
      "Task appears too broad for efficient local execution; consider splitting first."
    );
  }

  if (localViability === "poor") {
    reasons.push(
      "Local model viability is poor; cloud execution recommended."
    );
  } else if (localViability === "marginal") {
    reasons.push(
      "Local model viability is marginal; quality may vary depending on local model capability."
    );
  } else {
    reasons.push("Task is a good local candidate.");
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Profiles a task using its metadata and body content.
 *
 * Returns a TaskProfile with complexity tier, context/output size tiers,
 * local viability, decomposition signal, recommended provider class,
 * raw signals, and human-readable reasons.
 *
 * Deterministic — same input always produces the same output.
 * Uses the dry-run estimate engine for token/size signals.
 */
export function profileTask(source: DryRunTaskSource): TaskProfile {
  const estimate = estimateDryRunForTask(source);
  const factors = estimate.factors;
  const meta = source.meta ?? {};

  const signals: TaskProfileSignals = {
    body_length: factors.task_body_length,
    acceptance_criteria_length: factors.acceptance_criteria_length,
    verification_length: factors.verification_length,
    files_likely_affected_count: factors.files_likely_affected_count,
    dependency_count:
      Array.isArray(meta.depends_on) ? meta.depends_on.length : 0,
    task_type:
      typeof meta.type === "string" && meta.type.trim() !== ""
        ? meta.type.trim().toLowerCase()
        : null,
    context_intensity_hint:
      typeof meta.context_intensity === "string" &&
      meta.context_intensity.trim() !== ""
        ? meta.context_intensity.trim().toLowerCase()
        : null,
    has_preferred_models:
      Array.isArray(meta.preferred_models) && meta.preferred_models.length > 0,
    has_disallowed_models:
      Array.isArray(meta.disallowed_models) &&
      meta.disallowed_models.length > 0,
  };

  const complexityTier = deriveComplexityTier(
    signals,
    estimate.context_tier,
    estimate.output_tier
  );
  const localViability = deriveLocalViability(
    complexityTier,
    estimate.context_tier,
    signals
  );
  const decompositionCandidate =
    signals.task_type === "epic" ||
    (complexityTier === "high" &&
      (signals.files_likely_affected_count > 5 ||
        estimate.context_tier === "large"));
  const recommendedProviderClass = deriveRecommendedProviderClass(
    localViability,
    signals,
    estimate.output_tier
  );
  const reasons = buildProfileReasons(
    signals,
    complexityTier,
    estimate.context_tier,
    localViability,
    decompositionCandidate
  );

  return {
    complexity_tier: complexityTier,
    context_size_tier: estimate.context_tier,
    output_size_tier: estimate.output_tier,
    local_viability: localViability,
    decomposition_candidate: decompositionCandidate,
    recommended_provider_class: recommendedProviderClass,
    signals,
    reasons,
  };
}
