/**
 * packages/core/src/execution-binding.ts
 *
 * Execution binding layer for routing decisions.
 *
 * Takes per-task ExecutionRoutingDecision[] (from the routing engine) and the
 * user's chosen preference, and produces an ExecutionBindingResult: the actual
 * execution path to use, honest fallback/stop behavior, warnings, and a compact
 * record of selected vs. actual provider.
 *
 * Responsibilities:
 *  - Map provider class → concrete execution path
 *  - Detect force_local violations (local forced but unavailable)
 *  - Carry decomposition recommendations forward into the run surface
 *  - Build env vars that communicate the binding to the runner subprocess
 *  - Record selected vs. actual provider honestly
 *
 * Does NOT:
 *  - Perform I/O
 *  - Pretend a provider executed when it did not
 *  - Replace or rewrite the orchestrator
 *
 * Entry points: bindExecution(), buildExecutionBindingEnv()
 */

import type { ExecutionRoutingDecision, ExecutionPreference } from "./execution-router.ts";
import {
  resolveExecutionAdapter,
  type AdapterExecutionPath,
} from "./execution-adapter-resolution.ts";
import type { ProviderClassId } from "./provider-registry.ts";
import type { RoutingPolicy } from "./routing-policy.ts";
import {
  resolveProviderTarget,
  type ResolvedProviderTarget,
} from "./provider-target-resolver.ts";
import type { TaskProfile } from "./task-profiler.ts";
import type {
  TargetReadinessSnapshot,
  TargetReadinessState,
} from "./target-readiness.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The concrete execution path that will be attempted for this run.
 *
 * "cloud_api"           — cloud_premium provider → cloud API call
 * "local_ollama"        — local_ollama provider → Ollama HTTP endpoint
 * "deterministic"       — deterministic provider → no model, scripted path
 * "unavailable_fallback" — intended provider unavailable; fell back to alternative
 * "unavailable_stopped"  — force_local with no local provider; run cannot proceed locally
 */
export type ExecutionPath =
  | "cloud_api"
  | "local_ollama"
  | "deterministic"
  | "unavailable_fallback"
  | "unavailable_stopped";

/**
 * Per-task execution binding, parallel to the input routing decisions.
 *
 * When the run architecture supports per-task routing, each task gets its own
 * binding entry. Currently the run-level binding dominates, but this structure
 * allows per-task expansion without a larger refactor.
 */
export interface PerTaskBinding {
  /** Zero-based index into the input routing decisions array. */
  task_index: number;
  /** Provider class selected for this task. */
  selected_provider_class: ProviderClassId;
  /** Concrete execution path for this task. */
  execution_path: ExecutionPath;
  /** True if a fallback was taken from the routing decision. */
  fallback_taken: boolean;
  /** True if decomposition was recommended for this task. */
  decomposition_recommended: boolean;
  /** Route mode string from the routing decision. */
  route_mode: string;
  /** Preferred concrete target beneath the selected provider class, if known. */
  selected_target_id: string | null;
  /** Actual concrete target that will be invoked, if known. */
  actual_target_id: string | null;
  /** Adapter selected for the preferred target, if known. */
  selected_adapter_id: string | null;
  /** Adapter actually used for invocation, if known. */
  actual_adapter_id: string | null;
  /** Backward-compatible alias for actual_adapter_id. */
  adapter_id: string | null;
  /** Preferred execution path for the selected adapter. */
  selected_execution_path: AdapterExecutionPath | null;
  /** Actual execution path used for the task. */
  actual_execution_path: AdapterExecutionPath | null;
  /** True when adapter selection changed between selected and actual. */
  adapter_fallback_taken: boolean;
  /** Why adapter fallback or stop occurred for this task. */
  adapter_fallback_reason: string | null;
  /** Compact note about adapter resolution. */
  adapter_resolution_note: string | null;
  /** True when target resolution fell back within the selected provider class. */
  target_fallback_taken: boolean;
  /** Readiness state of the actual target if one was resolved. */
  target_readiness_state: TargetReadinessState;
  /** Compact readiness explanation for the actual or preferred target. */
  target_readiness_detail: string | null;
  /** Why fallback occurred for this task. */
  fallback_cause: "none" | "readiness" | "policy" | "config";
}

/**
 * Complete execution binding result for a run.
 *
 * Captures the selected provider, the actual execution path, fallback/stop
 * conditions, warnings, and decomposition signals. Use buildExecutionBindingEnv()
 * to convert this into env vars for the runner subprocess.
 */
export interface ExecutionBindingResult {
  /**
   * The dominant provider class for this run.
   * Derived from the majority of per-task routing decisions.
   */
  selected_provider_class: ProviderClassId;
  /**
   * The concrete execution path to use.
   * Honest about what is actually possible given provider availability.
   */
  execution_path: ExecutionPath;
  /** The preference that was in effect when this binding was computed. */
  preference_applied: ExecutionPreference;
  /**
   * True when any task's routing decision took a fallback from the intended provider.
   * Indicates actual ≠ selected.
   */
  fallback_taken: boolean;
  /**
   * The provider class that was originally targeted before fallback, or null.
   * Set when fallback_taken is true.
   */
  originally_targeted_class: ProviderClassId | null;
  /** Human-readable reason for the fallback, or null. */
  fallback_reason: string | null;
  /**
   * True when the user selected force_local but no local provider was available.
   * When true, the run should be stopped or the user warned before proceeding.
   */
  force_local_violated: boolean;
  /** Warnings to surface to the user before or during run start. */
  warnings: string[];
  /**
   * True when any task flagged decomposition as recommended.
   * Carries the signal forward into the run surface (advisory only).
   */
  decomposition_recommended: boolean;
  /** Human-readable decomposition note if recommended; null otherwise. */
  decomposition_note: string | null;
  /** Route mode string from the dominant routing decision. */
  route_mode: string;
  /** Compact single-line summary for display in output channels. */
  binding_summary: string;
  /** Per-task bindings, parallel to the input routing decisions array. */
  per_task_bindings: PerTaskBinding[];
  /**
   * True when any task routed to cloud requires explicit confirmation per policy.
   * The run surface should pause and prompt the user before proceeding.
   */
  cloud_confirmation_required: boolean;
  /**
   * True when a routing policy constraint blocked the execution path that
   * would otherwise have been selected.
   * Examples: cloud_allowed=false forced a stop; allow_fallback_to_cloud=false
   * prevented cloud escalation when local was unavailable.
   */
  blocked_by_policy: boolean;
  /** Human-readable reason when blocked_by_policy is true; null otherwise. */
  policy_block_reason: string | null;
  /**
   * Deduplicated list of policy effects that influenced routing/binding.
   * Empty when the default policy is in effect with no notable constraints.
   */
  policy_effects: string[];
  /** Preferred concrete target beneath the selected provider class, if known. */
  selected_target_id: string | null;
  /** Actual concrete target that will be invoked, if known. */
  actual_target_id: string | null;
  /** Adapter selected for invocation, if known. */
  selected_adapter_id: string | null;
  /** Adapter actually used for invocation, if known. */
  actual_adapter_id: string | null;
  /** Backward-compatible alias for actual_adapter_id. */
  adapter_id: string | null;
  /** Preferred execution path for the selected adapter. */
  selected_execution_path: AdapterExecutionPath | null;
  /** Actual execution path used for invocation. */
  actual_execution_path: AdapterExecutionPath | null;
  /** True when adapter resolution took a fallback. */
  adapter_fallback_taken: boolean;
  /** Human-readable reason when adapter resolution fell back or stopped. */
  adapter_fallback_reason: string | null;
  /** Compact note about adapter resolution. */
  adapter_resolution_note: string | null;
  /** True when target resolution fell back within the selected provider class. */
  target_fallback_taken: boolean;
  /** Human-readable reason when target selection fell back, or null. */
  target_fallback_reason: string | null;
  /** Full concrete target resolution for the dominant provider class. */
  target_resolution: ResolvedProviderTarget | null;
  /** Readiness state for the selected concrete target. */
  target_readiness_state: TargetReadinessState;
  /** Readiness explanation for the selected concrete target. */
  target_readiness_detail: string | null;
  /** Why the dominant fallback happened. */
  fallback_cause: "none" | "readiness" | "policy" | "config";
  /** Why the dominant target fallback happened. */
  target_fallback_cause: "none" | "readiness" | "policy" | "config";
}

export interface BindExecutionOptions {
  policy?: RoutingPolicy;
  task_profiles?: TaskProfile[];
  task_metas?: Array<Record<string, unknown> | null | undefined>;
  readiness?: TargetReadinessSnapshot;
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Returns true when the routing decision indicates a fallback was taken,
 * and which provider was originally intended.
 *
 * The routing engine encodes fallback in two ways:
 *  - route_mode === "local-unavailable-fallback" | "fallback-selected" (auto/prefer_local)
 *  - route_mode === "forced-local" with selected_provider.id !== "local_ollama"
 *    (force_local preference, local unavailable → fell back to another provider)
 */
function isDecisionFallback(
  decision: ExecutionRoutingDecision,
  preference: ExecutionPreference
): boolean {
  if (
    decision.route_mode === "local-unavailable-fallback" ||
    decision.route_mode === "fallback-selected"
  ) {
    return true;
  }
  // force_local: the route_mode is always "forced-local", but a fallback occurred
  // when the selected provider is not local_ollama (routing fell through to another).
  if (
    preference === "force_local" &&
    decision.route_mode === "forced-local" &&
    decision.selected_provider.id !== "local_ollama"
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the provider class that was originally targeted before a fallback,
 * based on the routing decision's route_mode and the user's preference.
 * Returns null when no fallback occurred.
 */
function resolveOriginallyTargeted(
  decision: ExecutionRoutingDecision,
  preference: ExecutionPreference
): ProviderClassId | null {
  if (!isDecisionFallback(decision, preference)) return null;

  // force_local / prefer_local: always targeting local_ollama
  if (preference === "force_local" || preference === "prefer_local") {
    return "local_ollama";
  }
  if (preference === "force_cloud") {
    return "cloud_premium";
  }
  if (preference === "deterministic_only") {
    return "deterministic";
  }
  // auto / allow_cloud: fallback from local (route_mode encodes which)
  if (decision.route_mode === "local-unavailable-fallback") {
    return "local_ollama";
  }
  return null;
}

/**
 * Maps a provider class id to its concrete execution path,
 * taking fallback state and preference into account.
 */
function resolveExecutionPath(
  selectedId: ProviderClassId,
  taskFallbackTaken: boolean,
  originallyTargeted: ProviderClassId | null,
  preference: ExecutionPreference
): ExecutionPath {
  // force_local violated: local was forced but unavailable and we fell back to non-local
  if (
    preference === "force_local" &&
    taskFallbackTaken &&
    originallyTargeted === "local_ollama" &&
    selectedId !== "local_ollama"
  ) {
    return "unavailable_stopped";
  }

  // Any other fallback (prefer_local, auto, allow_cloud): label as unavailable_fallback
  if (taskFallbackTaken && originallyTargeted !== null && originallyTargeted !== selectedId) {
    return "unavailable_fallback";
  }

  switch (selectedId) {
    case "cloud_premium":
      return "cloud_api";
    case "local_ollama":
      return "local_ollama";
    case "deterministic":
      return "deterministic";
    default:
      return "cloud_api";
  }
}

/**
 * Determines the dominant provider class across a set of per-task decisions.
 * Uses a simple majority count; ties broken by local-first ordering.
 */
function dominantProviderClass(
  decisions: ExecutionRoutingDecision[]
): ProviderClassId {
  if (decisions.length === 0) return "cloud_premium";

  const counts: Partial<Record<ProviderClassId, number>> = {};
  for (const d of decisions) {
    const id = d.selected_provider.id;
    counts[id] = (counts[id] ?? 0) + 1;
  }

  // Local-first order for tie-breaking
  const order: ProviderClassId[] = ["deterministic", "local_ollama", "cloud_premium"];
  let maxCount = 0;
  let winner: ProviderClassId = decisions[0].selected_provider.id;

  for (const id of order) {
    const count = counts[id] ?? 0;
    if (count > maxCount) {
      maxCount = count;
      winner = id;
    }
  }

  return winner;
}

function buildBindingSummary(
  selectedClass: ProviderClassId,
  executionPath: ExecutionPath,
  preference: ExecutionPreference,
  fallbackTaken: boolean,
  originallyTargeted: ProviderClassId | null,
  actualTargetId: string | null,
  actualAdapterId: string | null,
  actualExecutionPath: AdapterExecutionPath | null,
  targetFallbackTaken: boolean,
  adapterFallbackTaken: boolean,
  decompositionRecommended: boolean,
  blockedByPolicy: boolean,
  cloudConfirmationRequired: boolean,
  targetReadinessState: TargetReadinessState
): string {
  const pathLabel: Record<ExecutionPath, string> = {
    cloud_api: "cloud API",
    local_ollama: "local Ollama",
    deterministic: "deterministic (no model)",
    unavailable_fallback: "fallback (intended unavailable)",
    unavailable_stopped: "STOPPED (force_local violated — no local provider)",
  };

  const parts: string[] = [
    `selected=${selectedClass}`,
    `path=${pathLabel[executionPath]}`,
    `preference=${preference}`,
  ];

  if (fallbackTaken && originallyTargeted) {
    parts.push(`fallback_from=${originallyTargeted}`);
  }

  if (actualTargetId) {
    parts.push(`target=${actualTargetId}`);
  }

  if (actualAdapterId) {
    parts.push(`adapter=${actualAdapterId}`);
  }

  if (actualExecutionPath) {
    parts.push(`lane=${actualExecutionPath}`);
  }

  parts.push(`target_readiness=${targetReadinessState}`);

  if (targetFallbackTaken) {
    parts.push("target_fallback=true");
  }

  if (adapterFallbackTaken) {
    parts.push("adapter_fallback=true");
  }

  if (blockedByPolicy) {
    parts.push("blocked_by_policy=true");
  }

  if (cloudConfirmationRequired) {
    parts.push("cloud_confirmation=required");
  }

  if (decompositionRecommended) {
    parts.push("decomposition=recommended");
  }

  return parts.join(" · ");
}

interface ProviderBindingResolution {
  target_resolution: ResolvedProviderTarget | null;
  selected_adapter: ReturnType<typeof resolveExecutionAdapter>;
  actual_adapter: ReturnType<typeof resolveExecutionAdapter>;
  adapter_fallback_taken: boolean;
  adapter_fallback_reason: string | null;
  adapter_resolution_note: string | null;
  adapter_blocked: boolean;
}

function canUseAdapterWithoutConcreteTarget(
  providerClass: ProviderClassId,
  resolution: ResolvedProviderTarget,
  options: BindExecutionOptions
): boolean {
  if (providerClass === "cloud_premium") {
    return (
      resolution.preferred_target?.readiness_state !== "blocked_by_policy" &&
      (resolution.preferred_target?.readiness_state !== "unavailable" ||
        resolution.preferred_target?.readiness_detail ===
          "Target not configured for this workspace.")
    );
  }

  if (providerClass === "local_ollama") {
    return !options.readiness;
  }

  return false;
}

function resolveProviderBindingResolution(
  providerClass: ProviderClassId,
  options: BindExecutionOptions,
  providerRegistry: ExecutionRoutingDecision[],
  taskProfile: TaskProfile | undefined,
  taskMeta: Record<string, unknown> | null | undefined
): ProviderBindingResolution {
  const targetResolution = resolveProviderTarget(providerClass, {
    policy: options.policy,
    task_profile: taskProfile,
    task_meta: taskMeta,
    provider_registry: providerRegistry.map((decision) => decision.selected_provider),
    readiness: options.readiness,
  });
  const selectedAdapter = resolveExecutionAdapter({
    target: targetResolution.preferred_target,
    readiness_state: targetResolution.preferred_target?.readiness_state,
    policy: options.policy,
  });
  const actualAdapterCandidate = resolveExecutionAdapter({
    target: targetResolution.actual_target,
    readiness_state: targetResolution.readiness_state,
    policy: options.policy,
  });
  const actualAdapter =
    actualAdapterCandidate ??
    (targetResolution.actual_target === null &&
    selectedAdapter !== null &&
    selectedAdapter.available &&
    canUseAdapterWithoutConcreteTarget(providerClass, targetResolution, options)
      ? selectedAdapter
      : null);
  const adapterFallbackTaken =
    selectedAdapter !== null &&
    actualAdapter !== null &&
    selectedAdapter.adapter_id !== actualAdapter.adapter_id;
  const adapterCanProceedWithoutConcreteTarget =
    targetResolution.actual_target === null &&
    canUseAdapterWithoutConcreteTarget(providerClass, targetResolution, options);
  const adapterTargetResolved =
    targetResolution.actual_target != null ||
    targetResolution.preferred_target != null;
  const adapterBlocked =
    adapterTargetResolved &&
    !adapterCanProceedWithoutConcreteTarget &&
    (actualAdapter === null || actualAdapter.available === false);
  const adapterFallbackReason =
    adapterBlocked
      ? actualAdapter?.reason ?? "No runnable execution adapter path exists."
      : adapterFallbackTaken
        ? `Selected adapter "${selectedAdapter?.adapter_id ?? "unknown"}" changed to "${actualAdapter?.adapter_id ?? "unknown"}".`
        : null;

  return {
    target_resolution: targetResolution,
    selected_adapter: selectedAdapter,
    actual_adapter: actualAdapter,
    adapter_fallback_taken: adapterFallbackTaken,
    adapter_fallback_reason: adapterFallbackReason,
    adapter_resolution_note: actualAdapter?.note ?? selectedAdapter?.note ?? null,
    adapter_blocked: adapterBlocked,
  };
}

function bindingResolutionRunnable(
  providerClass: ProviderClassId,
  resolution: ProviderBindingResolution,
  options: BindExecutionOptions
): boolean {
  if (resolution.actual_adapter?.available) return true;
  return (
    resolution.target_resolution !== null &&
    canUseAdapterWithoutConcreteTarget(
      providerClass,
      resolution.target_resolution,
      options
    ) &&
    resolution.target_resolution?.actual_target === null &&
    resolution.selected_adapter?.available === true
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produces an ExecutionBindingResult from a set of per-task routing decisions
 * and the user's chosen execution preference.
 *
 * Determines the actual execution path, detects force_local violations and
 * policy blocks, carries decomposition recommendations forward, and builds
 * per-task bindings.
 *
 * When a policy is supplied, the binding enforces policy constraints that may
 * not have been fully applied at the routing level (e.g., cloud selected
 * despite cloud_allowed=false).
 *
 * Deterministic — same inputs produce the same output.
 */
export function bindExecution(
  decisions: ExecutionRoutingDecision[],
  preference: ExecutionPreference,
  policyOrOptions?: RoutingPolicy | BindExecutionOptions,
  maybeTaskProfiles?: TaskProfile[]
): ExecutionBindingResult {
  const options: BindExecutionOptions =
    policyOrOptions &&
    ("policy" in policyOrOptions || "task_profiles" in policyOrOptions || "task_metas" in policyOrOptions)
      ? policyOrOptions
      : {
          policy: policyOrOptions as RoutingPolicy | undefined,
          task_profiles: maybeTaskProfiles,
        };
  const policy = options.policy;

  // Build per-task bindings
  const perTaskBindings: PerTaskBinding[] = decisions.map((d, i) => {
    // Use the routing decision's route_mode to detect fallbacks accurately.
    // This handles auto/allow_cloud fallbacks (where there's no fixed target)
    // as well as explicit preference fallbacks.
    const taskFallbackTaken = isDecisionFallback(d, preference);
    const originallyTargeted: ProviderClassId | null = resolveOriginallyTargeted(d, preference);

    const taskExecutionPath = resolveExecutionPath(
      d.selected_provider.id,
      taskFallbackTaken,
      originallyTargeted,
      preference
    );
    const providerResolution = resolveProviderBindingResolution(
      d.selected_provider.id,
      options,
      decisions,
      options.task_profiles?.[i],
      options.task_metas?.[i] as Record<string, unknown> | null | undefined
    );
    const targetResolution = providerResolution.target_resolution;
    const selectedAdapter = providerResolution.selected_adapter;
    const actualAdapter = providerResolution.actual_adapter;
    const adapterFallbackTaken = providerResolution.adapter_fallback_taken;
    const adapterFallbackReason = providerResolution.adapter_fallback_reason;

    return {
      task_index: i,
      selected_provider_class: d.selected_provider.id,
      execution_path: taskExecutionPath,
      fallback_taken: taskFallbackTaken,
      decomposition_recommended: d.decomposition_recommended,
      route_mode: d.route_mode,
      selected_target_id: targetResolution.preferred_target?.id ?? null,
      actual_target_id: targetResolution.actual_target?.id ?? null,
      selected_adapter_id: selectedAdapter?.adapter_id ?? null,
      actual_adapter_id: actualAdapter?.available ? actualAdapter.adapter_id : null,
      adapter_id: actualAdapter?.available ? actualAdapter.adapter_id : null,
      selected_execution_path: selectedAdapter?.execution_path ?? null,
      actual_execution_path: actualAdapter?.available
        ? actualAdapter.execution_path
        : null,
      adapter_fallback_taken: adapterFallbackTaken,
      adapter_fallback_reason: adapterFallbackReason,
      adapter_resolution_note: providerResolution.adapter_resolution_note,
      target_fallback_taken: targetResolution.fallback_taken,
      target_readiness_state: targetResolution.readiness_state,
      target_readiness_detail: targetResolution.readiness_detail,
      fallback_cause: taskFallbackTaken ? "readiness" : "none",
    };
  });

  // Determine run-level dominant provider class
  const dominantClass = dominantProviderClass(decisions);

  // Run-level fallback: check if any task took a fallback
  const anyFallback = perTaskBindings.some((t) => t.fallback_taken);

  // Determine originally targeted class at run level.
  // Use the first fallback task's per-task binding to find what was originally targeted.
  let runLevelOriginallyTargeted: ProviderClassId | null = null;
  if (anyFallback) {
    const firstFallbackTask = perTaskBindings.find((t) => t.fallback_taken);
    if (firstFallbackTask) {
      const firstFallbackDecision = decisions[firstFallbackTask.task_index] ?? decisions[0];
      runLevelOriginallyTargeted = resolveOriginallyTargeted(firstFallbackDecision, preference);
    }
  }

  // Decomposition: aggregate across tasks
  const anyDecomposition = decisions.some((d) => d.decomposition_recommended);
  const decompositionNote = anyDecomposition
    ? "One or more tasks appear broad for local execution. Consider splitting/refining before running locally."
    : null;

  // --- Policy-level checks ---
  // Aggregate cloud_confirmation_required across all decisions
  const cloudConfirmationRequired = decisions.some(
    (d) => d.cloud_confirmation_required
  );

  // Aggregate deduplicated policy_effects across all decisions
  const policyEffectsSet = new Set<string>();
  for (const d of decisions) {
    for (const e of d.policy_effects) {
      policyEffectsSet.add(e);
    }
  }
  const aggregatedPolicyEffects = Array.from(policyEffectsSet);

  // Detect policy blocks (defensive layer — routing should have handled these,
  // but we record the block explicitly if cloud ended up selected despite policy).
  let blockedByPolicy = false;
  let policyBlockReason: string | null = null;

  if (policy) {
    const cloudSelected = dominantClass === "cloud_premium";

    if (cloudSelected && (policy.local_only || !policy.cloud_allowed)) {
      blockedByPolicy = true;
      policyBlockReason = policy.local_only
        ? "Local-only mode is active — cloud execution is not permitted by policy."
        : "Cloud execution is disabled by policy (cloud_allowed=false).";
    } else if (
      anyFallback &&
      runLevelOriginallyTargeted !== null &&
      runLevelOriginallyTargeted !== "cloud_premium" &&
      cloudSelected &&
      !policy.allow_fallback_to_cloud
    ) {
      blockedByPolicy = true;
      policyBlockReason =
        "Cloud fallback is disabled by policy (allow_fallback_to_cloud=false). " +
        "Local provider is unavailable and cloud escalation is not permitted.";
    }
  }

  // Dominant route mode (from first decision, or synthetic)
  const dominantRouteMode = decisions[0]?.route_mode ?? "unbound";
  const dominantTaskIndex = decisions.findIndex(
    (decision) => decision.selected_provider.id === dominantClass
  );
  const dominantTaskProfile =
    dominantTaskIndex >= 0
      ? options.task_profiles?.[dominantTaskIndex]
      : options.task_profiles?.[0];
  const dominantTaskMeta =
    dominantTaskIndex >= 0
      ? (options.task_metas?.[dominantTaskIndex] as Record<string, unknown> | null | undefined)
      : (options.task_metas?.[0] as Record<string, unknown> | null | undefined);

  const dominantResolution =
    decisions.length > 0
      ? resolveProviderBindingResolution(
          dominantClass,
          options,
          decisions,
          dominantTaskProfile,
          dominantTaskMeta
        )
      : null;
  const dominantRunnable =
    dominantResolution !== null
      ? bindingResolutionRunnable(dominantClass, dominantResolution, options)
      : false;
  const cloudFallbackAllowed = Boolean(
    !policy?.local_only &&
      policy?.cloud_allowed !== false &&
      policy?.allow_fallback_to_cloud !== false
  );
  const cloudFallbackResolution =
    decisions.length > 0 &&
    dominantClass === "local_ollama" &&
    !dominantRunnable &&
    preference !== "force_local" &&
    cloudFallbackAllowed
      ? resolveProviderBindingResolution(
          "cloud_premium",
          options,
          decisions,
          dominantTaskProfile,
          dominantTaskMeta
        )
      : null;
  const cloudFallbackRunnable =
    cloudFallbackResolution !== null
      ? bindingResolutionRunnable("cloud_premium", cloudFallbackResolution, options)
      : false;
  const reboundToCloud = cloudFallbackRunnable;
  const effectiveProviderClass = reboundToCloud ? "cloud_premium" : dominantClass;
  const effectiveResolution =
    (reboundToCloud ? cloudFallbackResolution : dominantResolution) ?? null;
  const targetResolution = effectiveResolution?.target_resolution ?? null;
  const selectedAdapter = effectiveResolution?.selected_adapter ?? null;
  const actualAdapter = effectiveResolution?.actual_adapter ?? null;
  const adapterFallbackTaken = effectiveResolution?.adapter_fallback_taken ?? false;
  const adapterBlocked = effectiveResolution?.adapter_blocked ?? false;
  const adapterFallbackReason = effectiveResolution?.adapter_fallback_reason ?? null;
  const bindingLevelFallbackTaken = reboundToCloud;
  const fallbackTaken = anyFallback || bindingLevelFallbackTaken;
  const effectiveOriginallyTargeted =
    runLevelOriginallyTargeted ?? (bindingLevelFallbackTaken ? dominantClass : null);
  const warnings: string[] = [];

  if (targetResolution) {
    for (const warning of targetResolution.warnings) {
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    }
  }
  if (adapterFallbackReason && !warnings.includes(adapterFallbackReason)) {
    warnings.push(adapterFallbackReason);
  }

  const forceLocalViolated =
    preference === "force_local" &&
    (effectiveProviderClass !== "local_ollama" ||
      !bindingResolutionRunnable("local_ollama", dominantResolution ?? {
        target_resolution: null,
        selected_adapter: null,
        actual_adapter: null,
        adapter_fallback_taken: false,
        adapter_fallback_reason: null,
        adapter_resolution_note: null,
        adapter_blocked: true,
      }, options));

  if (
    !blockedByPolicy &&
    dominantClass === "local_ollama" &&
    !dominantRunnable &&
    !forceLocalViolated &&
    !cloudFallbackRunnable &&
    !cloudFallbackAllowed &&
    (policy?.cloud_allowed === false || policy?.allow_fallback_to_cloud === false || policy?.local_only)
  ) {
    blockedByPolicy = true;
    policyBlockReason =
      policy?.local_only || policy?.cloud_allowed === false
        ? "Local execution is unavailable and cloud execution is blocked by policy."
        : "Cloud fallback is disabled by policy (allow_fallback_to_cloud=false). Local execution is unavailable.";
  }

  const runExecutionPath = resolveExecutionPath(
    effectiveProviderClass,
    fallbackTaken,
    effectiveOriginallyTargeted,
    preference
  );
  if (forceLocalViolated) {
    warnings.push(
      "Force local was selected, but no local provider (Ollama) is available. " +
        "The run cannot proceed on a local path. " +
        "Start Ollama locally, or switch to a different execution preference."
    );
  } else if (blockedByPolicy && policyBlockReason) {
    warnings.push(`Blocked by routing policy: ${policyBlockReason}`);
  } else if (fallbackTaken && effectiveOriginallyTargeted === "local_ollama") {
    warnings.push(
      effectiveProviderClass === "cloud_premium"
        ? "Local model (Ollama) is unavailable; binding selected a viable cloud fallback."
        : "Local model (Ollama) is unavailable."
    );
  } else if (fallbackTaken && effectiveOriginallyTargeted !== null) {
    warnings.push(
      `Intended provider is unavailable; routing fell back to ${effectiveProviderClass}.`
    );
  }

  if (cloudConfirmationRequired) {
    warnings.push(
      "Cloud execution is selected and requires confirmation per routing policy " +
        "(require_cloud_confirmation=true). Confirm before proceeding."
    );
  }

  if (anyDecomposition) {
    warnings.push(
      "One or more tasks are flagged as decomposition candidates. " +
        "Consider splitting broad tasks before executing locally."
    );
  }

  for (const d of decisions) {
    for (const w of d.warnings) {
      if (!warnings.includes(w)) {
        warnings.push(w);
      }
    }
  }

  let fallbackReason: string | null = null;
  if (forceLocalViolated) {
    fallbackReason =
      "force_local preference active but local_ollama is not available";
  } else if (blockedByPolicy) {
    fallbackReason = policyBlockReason;
  } else if (fallbackTaken && effectiveOriginallyTargeted === "local_ollama") {
    fallbackReason = "Local model (Ollama) not available";
  } else if (fallbackTaken && effectiveOriginallyTargeted !== null) {
    fallbackReason = `Provider '${effectiveOriginallyTargeted}' not available`;
  }

  const bindingSummary = buildBindingSummary(
    effectiveProviderClass,
    adapterBlocked ? "unavailable_stopped" : runExecutionPath,
    preference,
    fallbackTaken,
    effectiveOriginallyTargeted,
    targetResolution?.actual_target?.id ?? null,
    actualAdapter?.available ? actualAdapter.adapter_id : null,
    actualAdapter?.available ? actualAdapter.execution_path : null,
    targetResolution?.fallback_taken ?? false,
    adapterFallbackTaken,
    anyDecomposition,
    blockedByPolicy,
    cloudConfirmationRequired,
    targetResolution?.readiness_state ?? "unknown"
  );

  const targetFallbackCause: "none" | "readiness" | "policy" | "config" =
    targetResolution?.fallback_taken
      ? targetResolution.preferred_target?.readiness_state === "blocked_by_policy"
        ? "policy"
        : targetResolution.preferred_target?.readiness_state === "unavailable" &&
            targetResolution.preferred_target.configured
          ? "readiness"
          : "config"
      : "none";

  const fallbackCause: "none" | "readiness" | "policy" | "config" =
    blockedByPolicy
      ? "policy"
      : fallbackTaken
        ? "readiness"
        : targetFallbackCause !== "none"
          ? targetFallbackCause
          : "none";

  return {
    selected_provider_class: effectiveProviderClass,
    execution_path: adapterBlocked ? "unavailable_stopped" : runExecutionPath,
    preference_applied: preference,
    fallback_taken: fallbackTaken,
    originally_targeted_class: effectiveOriginallyTargeted,
    fallback_reason: fallbackReason,
    force_local_violated: forceLocalViolated,
    warnings,
    decomposition_recommended: anyDecomposition,
    decomposition_note: decompositionNote,
    route_mode: dominantRouteMode,
    binding_summary: bindingSummary,
    per_task_bindings: perTaskBindings,
    cloud_confirmation_required: cloudConfirmationRequired,
    blocked_by_policy: blockedByPolicy,
    policy_block_reason: policyBlockReason,
    policy_effects: aggregatedPolicyEffects,
    selected_target_id: targetResolution?.preferred_target?.id ?? null,
    actual_target_id: targetResolution?.actual_target?.id ?? null,
    selected_adapter_id: selectedAdapter?.adapter_id ?? null,
    actual_adapter_id: actualAdapter?.available ? actualAdapter.adapter_id : null,
    adapter_id: actualAdapter?.available ? actualAdapter.adapter_id : null,
    selected_execution_path: selectedAdapter?.execution_path ?? null,
    actual_execution_path: actualAdapter?.available
      ? actualAdapter.execution_path
      : null,
    adapter_fallback_taken: adapterFallbackTaken,
    adapter_fallback_reason: adapterFallbackReason,
    adapter_resolution_note: actualAdapter?.note ?? selectedAdapter?.note ?? null,
    target_fallback_taken: targetResolution?.fallback_taken ?? false,
    target_fallback_reason:
      targetResolution?.fallback_taken && targetResolution.actual_target
        ? `Preferred target is ${targetResolution.preferred_target?.readiness_state ?? "unavailable"}; using ${targetResolution.actual_target.id}.`
        : null,
    target_resolution: targetResolution,
    target_readiness_state: targetResolution?.readiness_state ?? "unknown",
    target_readiness_detail: targetResolution?.readiness_detail ?? null,
    fallback_cause: fallbackCause,
    target_fallback_cause: targetFallbackCause,
  };
}


/**
 * Converts an ExecutionBindingResult into a flat Record<string, string> of env
 * vars for the runner subprocess.
 *
 * The runner/orchestrator can use these to select the appropriate execution path.
 * If the orchestrator ignores them, the run proceeds with its default behavior —
 * these vars are additive and non-breaking.
 *
 * Env var contract:
 *   DEVORY_PROVIDER_CLASS                — selected provider class id
 *   DEVORY_EXECUTION_PATH                — concrete execution path
 *   DEVORY_ROUTE_MODE                    — route mode string
 *   DEVORY_PREFERENCE_APPLIED            — user preference that drove binding
 *   DEVORY_FALLBACK_TAKEN                — "true" | "false"
 *   DEVORY_ORIGINALLY_TARGETED           — originally targeted class if fallback, else ""
 *   DEVORY_DECOMPOSITION_FLAG            — "true" | "false"
 *   DEVORY_FORCE_LOCAL_VIOLATED          — "true" | "false"
 *   DEVORY_CLOUD_CONFIRMATION_REQUIRED   — "true" | "false"
 *   DEVORY_BLOCKED_BY_POLICY             — "true" | "false"
 */
export function buildExecutionBindingEnv(
  binding: ExecutionBindingResult
): Record<string, string> {
  return {
    DEVORY_PROVIDER_CLASS: binding.selected_provider_class,
    DEVORY_EXECUTION_PATH: binding.execution_path,
    DEVORY_ROUTE_MODE: binding.route_mode,
    DEVORY_PREFERENCE_APPLIED: binding.preference_applied,
    DEVORY_FALLBACK_TAKEN: binding.fallback_taken ? "true" : "false",
    DEVORY_ORIGINALLY_TARGETED: binding.originally_targeted_class ?? "",
    DEVORY_DECOMPOSITION_FLAG: binding.decomposition_recommended ? "true" : "false",
    DEVORY_FORCE_LOCAL_VIOLATED: binding.force_local_violated ? "true" : "false",
    DEVORY_CLOUD_CONFIRMATION_REQUIRED: binding.cloud_confirmation_required
      ? "true"
      : "false",
    DEVORY_BLOCKED_BY_POLICY: binding.blocked_by_policy ? "true" : "false",
    DEVORY_SELECTED_TARGET_ID: binding.selected_target_id ?? "",
    DEVORY_ACTUAL_TARGET_ID: binding.actual_target_id ?? "",
    DEVORY_SELECTED_ADAPTER_ID: binding.selected_adapter_id ?? "",
    DEVORY_ACTUAL_ADAPTER_ID: binding.actual_adapter_id ?? "",
    DEVORY_TARGET_ADAPTER: binding.adapter_id ?? "",
    DEVORY_SELECTED_EXECUTION_PATH: binding.selected_execution_path ?? "",
    DEVORY_ACTUAL_EXECUTION_PATH: binding.actual_execution_path ?? "",
    DEVORY_ADAPTER_INVOCATION_MODE:
      binding.actual_execution_path === "packaged_runner:dry-run"
        ? "dry-run"
        : binding.actual_execution_path === "packaged_runner:ollama"
          ? "ollama"
          : binding.actual_execution_path === "packaged_runner:claude"
            ? "claude"
            : binding.actual_execution_path === "packaged_runner:openai"
              ? "openai"
              : "",
    DEVORY_ADAPTER_FALLBACK_TAKEN: binding.adapter_fallback_taken ? "true" : "false",
    DEVORY_ADAPTER_FALLBACK_REASON: binding.adapter_fallback_reason ?? "",
    DEVORY_ADAPTER_RESOLUTION_NOTE: binding.adapter_resolution_note ?? "",
    DEVORY_TARGET_FALLBACK_TAKEN: binding.target_fallback_taken ? "true" : "false",
    DEVORY_TARGET_READINESS_STATE: binding.target_readiness_state,
    DEVORY_TARGET_READINESS_DETAIL: binding.target_readiness_detail ?? "",
    DEVORY_FALLBACK_CAUSE: binding.fallback_cause,
    DEVORY_TARGET_FALLBACK_CAUSE: binding.target_fallback_cause,
  };
}

/**
 * Formats a compact routing record line for display in the output channel.
 *
 * Shows selected vs. actual provider, fallback status, and any mismatch
 * between what was intended and what will be used.
 *
 * Example:
 *   "Routing record: selected=local_ollama · path=local Ollama · preference=force_local · NO FALLBACK"
 *   "Routing record: selected=cloud_premium · path=fallback (intended unavailable) · fallback_from=local_ollama"
 */
export function formatBindingRecord(binding: ExecutionBindingResult): string {
  const pathLabel: Record<ExecutionPath, string> = {
    cloud_api: "cloud API",
    local_ollama: "local Ollama",
    deterministic: "deterministic (no model)",
    unavailable_fallback: "fallback (intended provider unavailable)",
    unavailable_stopped: "STOPPED — force_local violated",
  };

  const parts: string[] = [
    `selected=${binding.selected_provider_class}`,
    `path=${pathLabel[binding.execution_path]}`,
    `preference=${binding.preference_applied}`,
  ];

  if (binding.actual_target_id) {
    parts.push(`target=${binding.actual_target_id}`);
  }

  if (binding.actual_adapter_id) {
    parts.push(`adapter=${binding.actual_adapter_id}`);
  }

  if (binding.actual_execution_path) {
    parts.push(`lane=${binding.actual_execution_path}`);
  }

  parts.push(`target_readiness=${binding.target_readiness_state}`);

  if (binding.fallback_taken && binding.originally_targeted_class) {
    parts.push(`fallback_from=${binding.originally_targeted_class}`);
    if (binding.fallback_reason) {
      parts.push(`reason="${binding.fallback_reason}"`);
    }
  } else {
    parts.push("no-fallback");
  }

  if (binding.target_fallback_taken && binding.selected_target_id) {
    parts.push(`preferred_target=${binding.selected_target_id}`);
    parts.push(`target_fallback_cause=${binding.target_fallback_cause}`);
  }

  if (binding.adapter_fallback_taken) {
    parts.push("adapter_fallback=true");
  }

  if (binding.adapter_fallback_reason) {
    parts.push(`adapter_reason="${binding.adapter_fallback_reason}"`);
  }

  if (binding.decomposition_recommended) {
    parts.push("decomposition=recommended");
  }

  return `Routing record: ${parts.join(" · ")}`;
}
