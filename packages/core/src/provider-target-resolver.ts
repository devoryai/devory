/**
 * packages/core/src/provider-target-resolver.ts
 *
 * Concrete provider target registry and resolver.
 *
 * Extends provider-class routing with a thin, inspectable target-selection
 * layer that resolves:
 *   provider class -> concrete target -> adapter/invocation path
 *
 * The resolver is pure and deterministic. It does not probe remote systems.
 * Availability is derived from explicit configuration, environment hints, and
 * the provider-class availability already established by the routing layer.
 */

import type { TaskMeta } from "./parse.ts";
import type { TaskProfile } from "./task-profiler.ts";
import type { ProviderClassEntry, ProviderClassId } from "./provider-registry.ts";
import type { RoutingPolicy } from "./routing-policy.ts";
import {
  isReadinessSelectable,
  type TargetReadinessRecord,
  type TargetReadinessSnapshot,
  type TargetReadinessState,
} from "./target-readiness.ts";

export type ProviderTargetAdapterId =
  | "deterministic"
  | "ollama"
  | "cloud_api";

export interface ProviderTargetEntry {
  id: string;
  provider_class: ProviderClassId;
  adapter_id: ProviderTargetAdapterId;
  model_id: string | null;
  label: string;
  configured: boolean;
  available: boolean;
  adapter_available: boolean;
  relative_cost: "free" | "low" | "medium" | "high";
  capability_hint: "basic" | "coding" | "balanced" | "planning";
  suitable_task_patterns: string[];
  availability_note: string | null;
  readiness_state: TargetReadinessState;
  readiness_detail: string | null;
}

export interface ProviderTargetRegistryOptions {
  provider_registry?: ProviderClassEntry[];
  policy?: RoutingPolicy;
  env?: Record<string, string | undefined>;
  readiness?: TargetReadinessSnapshot;
}

export interface ResolveProviderTargetOptions
  extends ProviderTargetRegistryOptions {
  task_profile?: TaskProfile;
  task_meta?: Partial<TaskMeta> | null;
}

export interface ResolvedProviderTarget {
  provider_class: ProviderClassId;
  preferred_target: ProviderTargetEntry | null;
  actual_target: ProviderTargetEntry | null;
  adapter_id: ProviderTargetAdapterId | null;
  preferred_target_unavailable: boolean;
  fallback_taken: boolean;
  resolution_notes: string[];
  warnings: string[];
  summary_label: string;
  readiness_state: TargetReadinessState;
  readiness_detail: string | null;
}

const BASE_PROVIDER_TARGETS: Omit<
  ProviderTargetEntry,
  | "configured"
  | "available"
  | "adapter_available"
  | "availability_note"
  | "readiness_state"
  | "readiness_detail"
>[] = [
  {
    id: "deterministic:factory-default",
    provider_class: "deterministic",
    adapter_id: "deterministic",
    model_id: null,
    label: "Deterministic execution",
    relative_cost: "free",
    capability_hint: "basic",
    suitable_task_patterns: ["dry-run", "validation", "simple-script", "lint"],
  },
  {
    id: "ollama:qwen2.5-coder:14b",
    provider_class: "local_ollama",
    adapter_id: "ollama",
    model_id: "qwen2.5-coder:14b",
    label: "Qwen 2.5 Coder 14B (Ollama)",
    relative_cost: "free",
    capability_hint: "coding",
    suitable_task_patterns: ["feature", "bugfix", "refactor", "test"],
  },
  {
    id: "ollama:deepseek-coder:6.7b",
    provider_class: "local_ollama",
    adapter_id: "ollama",
    model_id: "deepseek-coder:6.7b",
    label: "DeepSeek Coder 6.7B (Ollama)",
    relative_cost: "free",
    capability_hint: "coding",
    suitable_task_patterns: ["bugfix", "test", "documentation"],
  },
  {
    id: "cloud:claude-sonnet-4-6",
    provider_class: "cloud_premium",
    adapter_id: "cloud_api",
    model_id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    relative_cost: "high",
    capability_hint: "planning",
    suitable_task_patterns: ["feature", "architecture", "review", "epic"],
  },
  {
    id: "cloud:gpt-5-mini",
    provider_class: "cloud_premium",
    adapter_id: "cloud_api",
    model_id: "gpt-5-mini",
    label: "GPT-5 Mini",
    relative_cost: "medium",
    capability_hint: "balanced",
    suitable_task_patterns: ["feature", "bugfix", "test", "documentation"],
  },
];

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function titleCaseModelId(value: string): string {
  return value
    .split(/[:/-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDynamicTarget(
  id: string,
  providerClass: ProviderClassId,
  adapterId: ProviderTargetAdapterId
): ProviderTargetEntry {
  const modelId = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const defaultLabel =
    providerClass === "local_ollama"
      ? `${titleCaseModelId(modelId)} (Ollama)`
      : providerClass === "cloud_premium"
      ? titleCaseModelId(modelId)
      : "Deterministic execution";

  return {
    id,
    provider_class: providerClass,
    adapter_id: adapterId,
    model_id: providerClass === "deterministic" ? null : modelId,
    label: defaultLabel,
    configured: true,
    available: true,
    adapter_available: true,
    relative_cost: providerClass === "cloud_premium" ? "medium" : "free",
    capability_hint:
      providerClass === "cloud_premium" ? "balanced" : "coding",
    suitable_task_patterns: [],
    availability_note: null,
    readiness_state: "configured_but_unverified",
    readiness_detail: null,
  };
}

function collectConfiguredTargetIds(
  providerClass: ProviderClassId,
  policy: RoutingPolicy | undefined,
  env: Record<string, string | undefined>
): string[] {
  const configured = new Set<string>();
  const enabledTargets = policy?.enabled_targets ?? [];
  for (const entry of enabledTargets) configured.add(entry);

  if (providerClass === "local_ollama") {
    for (const entry of policy?.preferred_local_targets ?? []) configured.add(entry);
    for (const model of splitCsv(env.DEVORY_LOCAL_MODEL_IDS)) {
      configured.add(model.startsWith("ollama:") ? model : `ollama:${model}`);
    }
    if (env.OLLAMA_MODEL) {
      configured.add(
        env.OLLAMA_MODEL.startsWith("ollama:")
          ? env.OLLAMA_MODEL
          : `ollama:${env.OLLAMA_MODEL}`
      );
    }
  }

  if (providerClass === "cloud_premium") {
    for (const entry of policy?.preferred_cloud_targets ?? []) configured.add(entry);
    for (const model of splitCsv(env.DEVORY_CLOUD_MODEL_IDS)) {
      configured.add(model.startsWith("cloud:") ? model : `cloud:${model}`);
    }
    if (env.DEVORY_CLOUD_MODEL) {
      configured.add(
        env.DEVORY_CLOUD_MODEL.startsWith("cloud:")
          ? env.DEVORY_CLOUD_MODEL
          : `cloud:${env.DEVORY_CLOUD_MODEL}`
      );
    }
  }

  return Array.from(configured);
}

function isCloudBlockedByPolicy(policy: RoutingPolicy | undefined): boolean {
  return Boolean(policy && (policy.local_only || !policy.cloud_allowed));
}

function inferFallbackReadiness(
  targetId: string,
  providerClass: ProviderClassId,
  configured: boolean,
  provider: ProviderClassEntry | undefined,
  policy: RoutingPolicy | undefined
): TargetReadinessRecord {
  if (providerClass === "deterministic") {
    return {
      state: "ready",
      detail: "Deterministic execution requires no external runtime.",
    };
  }

  if (
    (providerClass === "cloud_premium" && isCloudBlockedByPolicy(policy)) ||
    (policy?.disabled_targets ?? []).includes(targetId)
  ) {
    return {
      state: "blocked_by_policy",
      detail:
        (policy?.disabled_targets ?? []).includes(targetId)
          ? "Target disabled by routing policy."
          : provider?.availability_note ??
            "Cloud execution is blocked by routing policy.",
    };
  }

  if (!configured) {
    return {
      state: "unavailable",
      detail: "Target not configured for this workspace.",
    };
  }

  if (provider && !provider.available) {
    return {
      state: "unavailable",
      detail: provider.availability_note ?? "Provider class unavailable.",
    };
  }

  return {
    state: "configured_but_unverified",
    detail: providerClass === "local_ollama"
      ? "Ollama target is configured but current readiness was not verified."
      : "Cloud target is configured but current readiness was not verified.",
  };
}

function resolveTargetReadiness(
  targetId: string,
  providerClass: ProviderClassId,
  configured: boolean,
  provider: ProviderClassEntry | undefined,
  options: ProviderTargetRegistryOptions
): TargetReadinessRecord {
  const snapshotTarget = options.readiness?.targets[targetId];
  if (snapshotTarget) return snapshotTarget;

  return inferFallbackReadiness(
    targetId,
    providerClass,
    configured,
    provider,
    options.policy
  );
}

function readinessAvailability(record: TargetReadinessRecord): {
  available: boolean;
  adapter_available: boolean;
} {
  return {
    available: isReadinessSelectable(record.state),
    adapter_available: isReadinessSelectable(record.state),
  };
}

export function buildProviderTargetRegistry(
  options: ProviderTargetRegistryOptions = {}
): ProviderTargetEntry[] {
  const providerRegistry = options.provider_registry ?? [];
  const policy = options.policy;
  const env =
    options.env ??
    (process.env as Record<string, string | undefined>);
  const disabled = new Set(policy?.disabled_targets ?? []);
  const entries: ProviderTargetEntry[] = [];

  const providerAvailability = new Map<ProviderClassId, ProviderClassEntry>();
  for (const provider of providerRegistry) {
    providerAvailability.set(provider.id, provider);
  }

  for (const base of BASE_PROVIDER_TARGETS) {
    const provider = providerAvailability.get(base.provider_class);
    const configured =
      base.provider_class === "deterministic" ||
      collectConfiguredTargetIds(base.provider_class, policy, env).includes(base.id);
    const readiness = resolveTargetReadiness(
      base.id,
      base.provider_class,
      configured,
      provider,
      options
    );
    const availability = readinessAvailability(readiness);

    entries.push({
      ...base,
      configured,
      available: availability.available,
      adapter_available: availability.adapter_available,
      availability_note: readiness.detail,
      readiness_state: readiness.state,
      readiness_detail: readiness.detail,
    });
  }

  for (const providerClass of ["local_ollama", "cloud_premium"] as const) {
    for (const configuredId of collectConfiguredTargetIds(providerClass, policy, env)) {
      if (entries.some((entry) => entry.id === configuredId)) continue;
      if (disabled.has(configuredId)) continue;
      const provider = providerAvailability.get(providerClass);
      const adapterId: ProviderTargetAdapterId =
        providerClass === "local_ollama" ? "ollama" : "cloud_api";
      const dynamic = buildDynamicTarget(configuredId, providerClass, adapterId);
      const readiness = resolveTargetReadiness(
        configuredId,
        providerClass,
        true,
        provider,
        options
      );
      const availability = readinessAvailability(readiness);
      entries.push({
        ...dynamic,
        available: availability.available,
        adapter_available: availability.adapter_available,
        availability_note: readiness.detail,
        readiness_state: readiness.state,
        readiness_detail: readiness.detail,
      });
    }
  }

  return entries;
}

function preferredTargetIdsForClass(
  providerClass: ProviderClassId,
  policy: RoutingPolicy | undefined
): string[] {
  if (providerClass === "local_ollama") {
    return policy?.preferred_local_targets ?? [];
  }
  if (providerClass === "cloud_premium") {
    return policy?.preferred_cloud_targets ?? [];
  }
  return [];
}

function isPreferredByTaskHints(
  target: ProviderTargetEntry,
  taskMeta: Partial<TaskMeta> | null | undefined
): boolean {
  const preferredModels = Array.isArray(taskMeta?.preferred_models)
    ? taskMeta.preferred_models.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  return preferredModels.some(
    (entry) => entry === target.id || entry === target.model_id
  );
}

function isDisallowedByTaskHints(
  target: ProviderTargetEntry,
  taskMeta: Partial<TaskMeta> | null | undefined
): boolean {
  const disallowedModels = Array.isArray(taskMeta?.disallowed_models)
    ? taskMeta.disallowed_models.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  return disallowedModels.some(
    (entry) => entry === target.id || entry === target.model_id
  );
}

function scoreTarget(
  target: ProviderTargetEntry,
  options: ResolveProviderTargetOptions,
  includeAvailability: boolean
): number {
  const profile = options.task_profile;
  const taskMeta = options.task_meta;
  const policy = options.policy;
  let score = 0;

  if (includeAvailability) {
    if (target.readiness_state === "ready") score += 140;
    else if (target.readiness_state === "configured_but_unverified") score += 110;
    else if (target.readiness_state === "unknown") score += 20;
  }
  if (target.configured) score += 20;

  const preferredIds = preferredTargetIdsForClass(target.provider_class, policy);
  const preferredIndex = preferredIds.indexOf(target.id);
  if (preferredIndex !== -1) {
    score += 60 - preferredIndex * 5;
  }

  if (isPreferredByTaskHints(target, taskMeta)) {
    score += 70;
  }

  if (profile) {
    if (
      profile.complexity_tier === "high" ||
      profile.context_size_tier === "large" ||
      profile.decomposition_candidate
    ) {
      if (
        target.provider_class === "local_ollama" &&
        target.model_id === "qwen2.5-coder:14b"
      ) {
        score += 25;
      }
      if (
        target.provider_class === "cloud_premium" &&
        target.model_id === "claude-sonnet-4-6"
      ) {
        score += 25;
      }
    } else if (profile.complexity_tier === "low") {
      if (
        target.provider_class === "local_ollama" &&
        target.model_id === "deepseek-coder:6.7b"
      ) {
        score += 20;
      }
      if (
        target.provider_class === "cloud_premium" &&
        target.model_id === "gpt-5-mini"
      ) {
        score += 15;
      }
    }

    if (
      profile.output_size_tier === "large" &&
      target.capability_hint === "planning"
    ) {
      score += 10;
    }
  }

  if (target.relative_cost === "free") score += 4;
  if (target.relative_cost === "high") score -= 2;

  return score;
}

function formatSummaryLabel(
  providerClass: ProviderClassId,
  target: ProviderTargetEntry | null
): string {
  if (!target) return providerClass;
  return `${providerClass} -> ${target.model_id ?? target.id}`;
}

export function resolveProviderTarget(
  providerClass: ProviderClassId,
  options: ResolveProviderTargetOptions = {}
): ResolvedProviderTarget {
  const registry = buildProviderTargetRegistry(options).filter(
    (entry) => entry.provider_class === providerClass
  );
  const taskMeta = options.task_meta;
  const warnings: string[] = [];
  const resolutionNotes: string[] = [];

  const filtered = registry.filter((entry) => !isDisallowedByTaskHints(entry, taskMeta));
  const preferredSorted = [...filtered].sort((left, right) => {
    const scoreDiff =
      scoreTarget(right, options, false) - scoreTarget(left, options, false);
    if (scoreDiff !== 0) return scoreDiff;
    return left.id.localeCompare(right.id);
  });
  const actualSorted = [...filtered].sort((left, right) => {
    const scoreDiff =
      scoreTarget(right, options, true) - scoreTarget(left, options, true);
    if (scoreDiff !== 0) return scoreDiff;
    return left.id.localeCompare(right.id);
  });

  const preferredTarget = preferredSorted[0] ?? null;
  const actualTarget = actualSorted.find(
    (entry) => entry.available && entry.adapter_available
  ) ?? null;

  const preferredTargetUnavailable = !!(
    preferredTarget &&
    actualTarget &&
    preferredTarget.id !== actualTarget.id
  );
  const fallbackTaken = preferredTargetUnavailable;

  if (preferredTarget) {
    resolutionNotes.push(`Preferred target candidate: ${preferredTarget.id}.`);
    resolutionNotes.push(
      `Preferred target readiness: ${preferredTarget.readiness_state}` +
        (preferredTarget.readiness_detail ? ` (${preferredTarget.readiness_detail})` : ".")
    );
  }
  if (actualTarget) {
    resolutionNotes.push(`Resolved concrete target: ${actualTarget.id}.`);
    resolutionNotes.push(
      `Actual target readiness: ${actualTarget.readiness_state}` +
        (actualTarget.readiness_detail ? ` (${actualTarget.readiness_detail})` : ".")
    );
  }

  if (preferredTarget && !actualTarget) {
    warnings.push(
      preferredTarget.readiness_detail ??
        "No concrete target is currently executable for the selected provider class."
    );
  } else if (preferredTargetUnavailable && actualTarget) {
    warnings.push(
      `Preferred target ${preferredTarget.id} is ${preferredTarget.readiness_state}; using ${actualTarget.model_id ?? actualTarget.id} (${actualTarget.readiness_state}).`
    );
  } else if (
    actualTarget &&
    actualTarget.readiness_state === "configured_but_unverified"
  ) {
    warnings.push(
      actualTarget.readiness_detail ??
        "Concrete target is configured but readiness could not be verified."
    );
  }

  return {
    provider_class: providerClass,
    preferred_target: preferredTarget,
    actual_target: actualTarget,
    adapter_id: actualTarget?.adapter_id ?? null,
    preferred_target_unavailable: preferredTargetUnavailable,
    fallback_taken: fallbackTaken,
    resolution_notes: resolutionNotes,
    warnings,
    summary_label: formatSummaryLabel(providerClass, actualTarget ?? preferredTarget),
    readiness_state: actualTarget?.readiness_state ?? preferredTarget?.readiness_state ?? "unknown",
    readiness_detail: actualTarget?.readiness_detail ?? preferredTarget?.readiness_detail ?? null,
  };
}
