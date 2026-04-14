/**
 * packages/core/src/execution-router.ts
 *
 * Deterministic execution routing policy engine.
 *
 * Combines a task profile, the provider registry, and an optional user
 * preference to produce an ExecutionRoutingDecision: which provider class
 * to use, why, what it costs, and whether decomposition is advised.
 *
 * Local-first by default: prefers deterministic → local → cloud unless
 * the task profile or preference requires otherwise.
 *
 * Pure functions — no I/O.
 *
 * Entry point: routeExecution()
 */

import type { DryRunEstimate } from "./dry-run-estimate.ts";
import type { TaskProfile } from "./task-profiler.ts";
import {
  PROVIDER_REGISTRY,
  getFallbackProvider,
  getProviderById,
  type ProviderClassEntry,
  type ProviderClassId,
} from "./provider-registry.ts";
import {
  DEFAULT_ROUTING_POLICY,
  type RoutingPolicy,
} from "./routing-policy.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * User's stated execution preference.
 * Influences routing but does not bypass safety checks.
 *
 * "auto"             — let the routing engine decide (default, local-first)
 * "prefer_local"     — strongly prefer local if available
 * "force_local"      — require local; warn if not available or low viability
 * "allow_cloud"      — explicitly allow cloud (same as auto; recorded for clarity)
 * "force_cloud"      — always use cloud_premium regardless of profile
 * "deterministic_only" — restrict to the deterministic provider only
 */
export type ExecutionPreference =
  | "auto"
  | "prefer_local"
  | "force_local"
  | "allow_cloud"
  | "force_cloud"
  | "deterministic_only";

export const VALID_EXECUTION_PREFERENCES: readonly ExecutionPreference[] = [
  "auto",
  "prefer_local",
  "force_local",
  "allow_cloud",
  "force_cloud",
  "deterministic_only",
];

/** Human-readable label for each preference option. */
export const EXECUTION_PREFERENCE_LABELS: Record<ExecutionPreference, string> =
  {
    auto: "Auto (local-first)",
    prefer_local: "Prefer local",
    force_local: "Force local",
    allow_cloud: "Allow cloud",
    force_cloud: "Force cloud",
    deterministic_only: "Deterministic only",
  };

/** Confidence in the routing decision. */
export type RoutingConfidence = "low" | "medium" | "high";

/**
 * The complete routing decision for a task or run.
 * Records which provider was selected, why, and any caveats.
 */
export interface ExecutionRoutingDecision {
  /** The selected provider class entry. */
  selected_provider: ProviderClassEntry;
  /**
   * The preference that was in effect during routing.
   * "auto" when no override was supplied.
   */
  preference_applied: ExecutionPreference;
  /**
   * Short label for the routing mode.
   * Examples: "local-first", "cloud-selected", "forced-local", "forced-cloud",
   *   "deterministic-selected", "local-unavailable-fallback"
   */
  route_mode: string;
  /**
   * Human-readable bullets explaining the routing decision.
   * Each bullet is a complete sentence. Ordered most-important first.
   */
  explanation_bullets: string[];
  /** Confidence in the routing decision. */
  confidence: RoutingConfidence;
  /**
   * Compact cost impact string shown in the UI.
   * Examples: "$0.00 (local/no model)", "$0.01–$0.05 (cloud est.)"
   */
  estimated_cost_impact: string;
  /**
   * True when the profiler recommends decomposing the task before execution.
   * Does not block execution — advisory only.
   */
  decomposition_recommended: boolean;
  /** Human-readable note if decomposition is recommended; null otherwise. */
  decomposition_note: string | null;
  /**
   * The next-best available provider, if one exists and differs from selected.
   * Shown as an alternative the user can switch to.
   */
  alternative_provider: ProviderClassEntry | null;
  /**
   * Warnings the user should see before proceeding.
   * Examples: provider not available, forced provider has poor viability.
   */
  warnings: string[];
  /**
   * True when routing policy requires the user to confirm before proceeding
   * with cloud execution. Carried forward into the binding layer.
   */
  cloud_confirmation_required: boolean;
  /**
   * Compact list of policy constraints that influenced this routing decision.
   * Empty when the default policy is in effect with no notable constraints.
   * Examples: "Local-only mode active.", "Cloud disallowed by policy."
   */
  policy_effects: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

function formatCostImpact(
  provider: ProviderClassEntry,
  dryRunEstimate: DryRunEstimate | undefined
): string {
  if (provider.locality === "local") {
    return "$0.00 (local model, no API billing)";
  }
  if (provider.id === "deterministic") {
    return "$0.00 (no model)";
  }
  // Cloud provider — use dry-run estimate if available
  if (dryRunEstimate && dryRunEstimate.estimated_cost_usd.max > 0) {
    const min = dryRunEstimate.estimated_cost_usd.min.toFixed(3);
    const max = dryRunEstimate.estimated_cost_usd.max.toFixed(3);
    return `$${min}–$${max} est. (${dryRunEstimate.confidence} confidence)`;
  }
  return "cost unknown (cloud model — estimate unavailable)";
}

function deriveConfidence(
  provider: ProviderClassEntry,
  profile: TaskProfile,
  fallbackTaken: boolean
): RoutingConfidence {
  if (!provider.available) return "low";
  if (fallbackTaken) return "medium";
  if (
    profile.local_viability === "poor" &&
    provider.locality === "local"
  )
    return "low";
  if (profile.complexity_tier === "low" && provider.locality === "local")
    return "high";
  if (
    profile.complexity_tier === "high" &&
    provider.capability_tier === "premium"
  )
    return "high";
  return "medium";
}

/**
 * Select the target provider id based on the preference and profile.
 * Does not validate availability — that is handled by the caller.
 */
function selectTargetProviderId(
  preference: ExecutionPreference,
  profile: TaskProfile
): ProviderClassId {
  switch (preference) {
    case "force_cloud":
      return "cloud_premium";

    case "deterministic_only":
      return "deterministic";

    case "force_local":
    case "prefer_local":
      return "local_ollama";

    case "auto":
    case "allow_cloud":
    default:
      // Follow the profiler's recommendation
      switch (profile.recommended_provider_class) {
        case "deterministic":
          return "deterministic";
        case "cloud":
          return "cloud_premium";
        case "local":
        default:
          return "local_ollama";
      }
  }
}

function buildRouteMode(
  preference: ExecutionPreference,
  selectedId: ProviderClassId,
  fallbackTaken: boolean,
  unavailableId: ProviderClassId | null
): string {
  if (preference === "force_cloud") return "forced-cloud";
  if (preference === "force_local") return "forced-local";
  if (preference === "deterministic_only") return "deterministic-selected";

  if (fallbackTaken && unavailableId === "local_ollama") {
    return "local-unavailable-fallback";
  }
  if (fallbackTaken) return "fallback-selected";

  if (selectedId === "cloud_premium") return "cloud-selected";
  if (selectedId === "deterministic") return "deterministic-selected";
  return "local-first";
}

function buildExplanationBullets(
  provider: ProviderClassEntry,
  profile: TaskProfile,
  preference: ExecutionPreference,
  fallbackTaken: boolean,
  unavailableId: ProviderClassId | null
): string[] {
  const bullets: string[] = [];

  // Selection rationale
  if (preference === "force_cloud") {
    bullets.push("Cloud provider forced by user preference.");
  } else if (preference === "force_local") {
    bullets.push("Local provider forced by user preference.");
  } else if (preference === "deterministic_only") {
    bullets.push("Deterministic-only mode selected by user preference.");
  } else if (preference === "prefer_local") {
    bullets.push("Local execution preferred by user; selecting local if available.");
  } else {
    // Auto / allow_cloud
    bullets.push(
      `Routing policy: local-first. Recommended provider class: ${profile.recommended_provider_class}.`
    );
  }

  // Fallback narrative
  if (fallbackTaken && unavailableId === "local_ollama") {
    bullets.push(
      "Local model (Ollama) is not available; fell back to next viable provider."
    );
  } else if (fallbackTaken && unavailableId !== null) {
    bullets.push(
      `Provider '${unavailableId}' is not available; fell back to '${provider.id}'.`
    );
  }

  // Profile summary bullets
  bullets.push(
    `Task complexity: ${profile.complexity_tier}. Context size: ${profile.context_size_tier}. Output size: ${profile.output_size_tier}.`
  );
  bullets.push(
    `Local model viability: ${profile.local_viability}.`
  );

  // Locality and cost note
  if (provider.locality === "local") {
    bullets.push(
      `Selected provider runs locally — no cloud API usage or billing.`
    );
  } else {
    bullets.push(
      `Selected provider uses a cloud API — usage cost applies.`
    );
  }

  return bullets;
}

function buildWarnings(
  provider: ProviderClassEntry,
  profile: TaskProfile,
  preference: ExecutionPreference
): string[] {
  const warnings: string[] = [];

  if (!provider.available && provider.availability_note) {
    warnings.push(`Provider not available: ${provider.availability_note}`);
  }

  if (
    preference === "force_local" &&
    profile.local_viability === "poor"
  ) {
    warnings.push(
      "Local execution forced but task profile indicates poor local viability. " +
        "Output quality may be reduced."
    );
  }

  if (
    preference === "deterministic_only" &&
    profile.recommended_provider_class !== "deterministic"
  ) {
    warnings.push(
      "Deterministic-only mode selected, but this task is not a deterministic candidate. " +
        "Execution may produce limited or no useful output."
    );
  }

  if (
    preference === "force_cloud" &&
    provider.locality === "cloud" &&
    provider.cost_profile !== "free"
  ) {
    warnings.push(
      "Cloud execution forced. Ensure cloud API access and budget are in order."
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RouteExecutionOptions {
  /**
   * Override registry entries (e.g., with live Ollama availability).
   * When omitted, uses the default PROVIDER_REGISTRY.
   */
  registry?: ProviderClassEntry[];
  /**
   * Dry-run estimate for the task, used to populate cost impact string.
   * When omitted, cost impact falls back to a generic message.
   */
  dryRunEstimate?: DryRunEstimate;
  /**
   * Routing policy governing provider constraints (local-only, cloud permission,
   * confirmation requirements, cost ceilings). When omitted, all defaults apply
   * and behavior is identical to pre-policy routing.
   */
  policy?: RoutingPolicy;
}

// ---------------------------------------------------------------------------
// Policy helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Returns a modified registry copy with policy-driven availability overrides:
 *  - local_only=true or cloud_allowed=false → cloud_premium marked unavailable
 *
 * Does not handle allow_fallback_to_cloud here; that is applied in the
 * fallback path during routing to allow direct cloud selection while
 * blocking automatic escalation.
 */
function applyPolicyToRegistry(
  registry: ProviderClassEntry[],
  policy: RoutingPolicy
): ProviderClassEntry[] {
  const cloudHardBlocked = policy.local_only || !policy.cloud_allowed;
  if (!cloudHardBlocked) return registry;

  return registry.map((entry): ProviderClassEntry => {
    if (entry.id === "cloud_premium") {
      return {
        ...entry,
        available: false,
        availability_note: policy.local_only
          ? "Cloud disabled — local-only mode is active."
          : "Cloud disabled by routing policy (cloud_allowed=false).",
      };
    }
    return entry;
  });
}

/**
 * Returns a modified registry copy where cloud_premium is marked unavailable
 * when allow_fallback_to_cloud=false. Used only during the fallback path when
 * the originally targeted provider (a local one) was unavailable.
 *
 * Direct cloud selection (force_cloud, allow_cloud) is NOT affected — only the
 * automatic escalation from local failure is blocked.
 */
function blockCloudInFallbackRegistry(
  registry: ProviderClassEntry[]
): ProviderClassEntry[] {
  return registry.map((entry): ProviderClassEntry => {
    if (entry.id === "cloud_premium") {
      return {
        ...entry,
        available: false,
        availability_note: "Cloud fallback disabled by routing policy (allow_fallback_to_cloud=false).",
      };
    }
    return entry;
  });
}

/**
 * Collects the list of policy effects that influenced this routing decision.
 * Effects are only recorded when a constraint is non-default (i.e., meaningful).
 */
function collectPolicyEffects(
  policy: RoutingPolicy,
  selectedProvider: ProviderClassEntry,
  dryRunEstimate: DryRunEstimate | undefined
): string[] {
  const effects: string[] = [];

  if (policy.local_only) {
    effects.push("Local-only mode active — cloud execution is not permitted.");
  } else if (!policy.cloud_allowed) {
    effects.push("Cloud execution disallowed by policy (cloud_allowed=false).");
  }

  if (
    policy.allow_fallback_to_cloud !== true &&
    !policy.local_only &&
    policy.cloud_allowed
  ) {
    effects.push("Cloud fallback disabled — local unavailability will not escalate to cloud.");
  }

  if (policy.sensitive_workspace_mode) {
    effects.push("Sensitive workspace mode active — cloud escalation is restricted.");
  }

  if (
    policy.require_cloud_confirmation &&
    selectedProvider.locality === "cloud" &&
    policy.require_cloud_confirmation !==
      DEFAULT_ROUTING_POLICY.require_cloud_confirmation
  ) {
    effects.push("Cloud confirmation required before execution (require_cloud_confirmation=true).");
  }

  if (
    policy.max_estimated_cloud_cost_usd !== null &&
    dryRunEstimate !== undefined &&
    selectedProvider.locality === "cloud"
  ) {
    const maxEstimate = dryRunEstimate.estimated_cost_usd.max;
    if (maxEstimate > policy.max_estimated_cloud_cost_usd) {
      effects.push(
        `Estimated cost $${maxEstimate.toFixed(3)} exceeds policy ceiling ` +
          `$${policy.max_estimated_cloud_cost_usd.toFixed(2)}.`
      );
    }
  }

  if (policy.default_preference !== "auto") {
    effects.push(
      `Policy default preference: ${policy.default_preference} (overrides auto-routing default).`
    );
  }

  return effects;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produces an ExecutionRoutingDecision for a task given its profile
 * and the user's execution preference.
 *
 * Applies local-first policy by default ("auto").
 * Records reasons, warnings, cost impact, and the alternative provider.
 *
 * Deterministic — same inputs always produce the same output.
 */
export function routeExecution(
  profile: TaskProfile,
  preference: ExecutionPreference = "auto",
  options: RouteExecutionOptions = {}
): ExecutionRoutingDecision {
  const baseRegistry = options.registry ?? PROVIDER_REGISTRY;
  const dryRunEstimate = options.dryRunEstimate;
  const policy = options.policy;

  // Apply policy constraints to the registry before routing begins.
  // local_only / cloud_allowed=false → mark cloud_premium unavailable.
  const registry = policy
    ? applyPolicyToRegistry(baseRegistry, policy)
    : baseRegistry;

  // Apply policy default_preference when user has not expressed an explicit
  // override (i.e., preference is "auto" and policy requests something else).
  const effectivePreference: ExecutionPreference =
    preference === "auto" && policy && policy.default_preference !== "auto"
      ? (policy.default_preference as ExecutionPreference)
      : preference;

  // 1. Determine the target provider id from preference + profile
  const targetId = selectTargetProviderId(effectivePreference, profile);
  const targetEntry = registry.find((p) => p.id === targetId) ?? null;

  let selectedProvider: ProviderClassEntry;
  let fallbackTaken = false;
  let unavailableId: ProviderClassId | null = null;

  if (targetEntry && targetEntry.available) {
    // Target is available — use it
    selectedProvider = targetEntry;
  } else {
    // Target unavailable — attempt fallback
    unavailableId = targetId;

    // When allow_fallback_to_cloud=false and the intended target was a local
    // provider, block cloud from the fallback chain. Direct cloud selection
    // (force_cloud) is unaffected by this restriction.
    const isLocalTarget =
      targetId === "local_ollama" || targetId === "deterministic";
    const fallbackRegistry =
      policy && !policy.allow_fallback_to_cloud && isLocalTarget
        ? blockCloudInFallbackRegistry(registry)
        : registry;

    const fallback =
      getFallbackProvider(targetId, fallbackRegistry) ??
      // Last resort: cloud_premium if available and not blocked
      fallbackRegistry.find((p) => p.id === "cloud_premium" && p.available) ??
      // Absolute last resort: any available provider
      fallbackRegistry.find((p) => p.available) ??
      null;

    if (fallback) {
      selectedProvider = fallback;
      fallbackTaken = true;
    } else {
      // Nothing available — use deterministic as a safe no-op
      selectedProvider =
        registry.find((p) => p.id === "deterministic") ??
        getProviderById("deterministic") ??
        registry[0];
      fallbackTaken = true;
    }
  }

  const routeMode = buildRouteMode(
    effectivePreference,
    selectedProvider.id,
    fallbackTaken,
    unavailableId
  );

  const confidence = deriveConfidence(selectedProvider, profile, fallbackTaken);

  const explanationBullets = buildExplanationBullets(
    selectedProvider,
    profile,
    effectivePreference,
    fallbackTaken,
    unavailableId
  );

  const estimatedCostImpact = formatCostImpact(selectedProvider, dryRunEstimate);

  const decompositionRecommended = profile.decomposition_candidate;
  const decompositionNote = decompositionRecommended
    ? "This task may be better split into subtasks before execution. " +
      "Use the Refine/Split feature to decompose it first."
    : null;

  // Find alternative (different from selected, available, next-in-order)
  const alternativeProvider =
    registry.find(
      (p) => p.available && p.id !== selectedProvider.id
    ) ?? null;

  const warnings = buildWarnings(selectedProvider, profile, effectivePreference);

  // If the selected provider is unavailable but was forced, add an honest warning
  if (!selectedProvider.available && selectedProvider.availability_note) {
    if (!warnings.some((w) => w.includes("not available"))) {
      warnings.push(
        `Selected provider is not available: ${selectedProvider.availability_note}`
      );
    }
  }

  // --- Policy effects ---
  const policyEffects: string[] = policy
    ? collectPolicyEffects(policy, selectedProvider, dryRunEstimate)
    : [];

  const cloudConfirmationRequired = !!(
    policy &&
    policy.require_cloud_confirmation &&
    selectedProvider.locality === "cloud"
  );

  // Add policy warnings to the warnings array
  for (const effect of policyEffects) {
    if (
      (effect.includes("exceeds") || effect.includes("confirmation required")) &&
      !warnings.includes(effect)
    ) {
      warnings.push(effect);
    }
  }

  if (cloudConfirmationRequired && !warnings.some((w) => w.includes("confirmation"))) {
    warnings.push(
      "Cloud execution selected — confirmation required by policy before proceeding."
    );
  }

  return {
    selected_provider: selectedProvider,
    preference_applied: effectivePreference,
    route_mode: routeMode,
    explanation_bullets: [...policyEffects, ...explanationBullets],
    confidence,
    estimated_cost_impact: estimatedCostImpact,
    decomposition_recommended: decompositionRecommended,
    decomposition_note: decompositionNote,
    alternative_provider: alternativeProvider,
    warnings,
    cloud_confirmation_required: cloudConfirmationRequired,
    policy_effects: policyEffects,
  };
}

/**
 * Produces a compact single-line routing summary for display in output channels.
 *
 * Example:
 *   "Routing: local-first → Local model (Ollama) · low complexity · $0.00 (local)"
 */
export function formatRoutingDecisionSummary(
  decision: ExecutionRoutingDecision
): string {
  const parts = [
    `Routing: ${decision.route_mode} → ${decision.selected_provider.label}`,
    `${decision.confidence} confidence`,
    decision.estimated_cost_impact,
  ];
  if (decision.decomposition_recommended) {
    parts.push("decomposition suggested");
  }
  if (decision.warnings.length > 0) {
    parts.push(`${decision.warnings.length} warning(s)`);
  }
  return parts.join(" · ");
}

/**
 * Summarizes routing decisions across multiple tasks.
 * Returns counts by provider class and a compact display string.
 */
export interface RoutingSummary {
  total: number;
  by_provider: Partial<Record<ProviderClassId, number>>;
  decomposition_candidates: number;
  summary_line: string;
}

export function summarizeRoutingDecisions(
  decisions: ExecutionRoutingDecision[]
): RoutingSummary {
  const by_provider: Partial<Record<ProviderClassId, number>> = {};
  let decomposition_candidates = 0;

  for (const d of decisions) {
    const id = d.selected_provider.id;
    by_provider[id] = (by_provider[id] ?? 0) + 1;
    if (d.decomposition_recommended) decomposition_candidates++;
  }

  const parts: string[] = [];
  const localCount =
    (by_provider["deterministic"] ?? 0) + (by_provider["local_ollama"] ?? 0);
  const cloudCount = by_provider["cloud_premium"] ?? 0;

  if (localCount > 0) parts.push(`${localCount} local`);
  if (cloudCount > 0) parts.push(`${cloudCount} cloud`);
  if (decomposition_candidates > 0)
    parts.push(`${decomposition_candidates} need decomposition`);

  const summary_line =
    decisions.length === 0
      ? "No tasks to route."
      : `${decisions.length} task(s): ${parts.join(", ")}.`;

  return {
    total: decisions.length,
    by_provider,
    decomposition_candidates,
    summary_line,
  };
}
