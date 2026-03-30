import type { TaskMeta } from "./parse.ts";

export const VALID_ROUTING_EXECUTION_PROFILES = [
  "balanced",
  "implementation",
  "analysis",
  "review",
  "documentation",
] as const;
export type RoutingExecutionProfile =
  (typeof VALID_ROUTING_EXECUTION_PROFILES)[number];

export const VALID_ROUTING_CONTEXT_INTENSITIES = [
  "low",
  "medium",
  "high",
] as const;
export type RoutingContextIntensity =
  (typeof VALID_ROUTING_CONTEXT_INTENSITIES)[number];

export const VALID_ROUTING_PRIORITY_LEVELS = ["low", "medium", "high"] as const;
export type RoutingPriorityLevel =
  (typeof VALID_ROUTING_PRIORITY_LEVELS)[number];

export interface RoutingRuntimeContext {
  work_role?: string | null;
  execution_mode?: string | null;
  stage?: string | null;
  cost_environment?: string | null;
  fallback_only?: boolean | null;
  retry_attempt?: number | null;
  resumed_from_run_id?: string | null;
  factory_read_only?: boolean | null;
}

export interface NormalizedRoutingInput {
  task_id: string | null;
  task_title: string | null;
  task_type: string | null;
  project: string | null;
  work_role: string | null;
  execution_profile: RoutingExecutionProfile | null;
  execution_mode: string | null;
  stage: string | null;
  cost_environment: string | null;
  required_capabilities: string[];
  preferred_capabilities: string[];
  preferred_models: string[];
  disallowed_models: string[];
  context_intensity: RoutingContextIntensity | null;
  quality_priority: RoutingPriorityLevel | null;
  speed_priority: RoutingPriorityLevel | null;
  max_cost_tier: string | null;
  lane: string | null;
  repo_area: string | null;
  repo: string | null;
  branch: string | null;
  decomposition_hint: string | null;
  language: string | null;
  framework: string | null;
  complexity: string | null;
  risk_level: string | null;
  privacy_sensitivity: string | null;
  environment_constraints: {
    fallback_only: boolean;
    retry_attempt: number | null;
    resumed_from_run_id: string | null;
    factory_read_only: boolean;
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item !== "")
  )];
}

function normalizeEnumValue<T extends readonly string[]>(
  value: unknown,
  validValues: T
): T[number] | null {
  const normalized = normalizeString(value);
  if (normalized === null) return null;
  return (validValues as readonly string[]).includes(normalized)
    ? (normalized as T[number])
    : null;
}

export function normalizeRoutingInput(
  meta: Partial<TaskMeta>,
  context: RoutingRuntimeContext = {}
): NormalizedRoutingInput {
  const executionProfile = normalizeEnumValue(
    meta.execution_profile,
    VALID_ROUTING_EXECUTION_PROFILES
  );

  return {
    task_id: normalizeString(meta.id),
    task_title: normalizeString(meta.title),
    task_type: normalizeString(meta.type)?.toLowerCase() ?? null,
    project: normalizeString(meta.project),
    work_role:
      normalizeString(context.work_role) ??
      normalizeString(context.stage) ??
      executionProfile,
    execution_profile: executionProfile,
    execution_mode: normalizeString(context.execution_mode),
    stage: normalizeString(context.stage),
    cost_environment: normalizeString(context.cost_environment),
    required_capabilities: normalizeStringList(meta.required_capabilities),
    preferred_capabilities: normalizeStringList(meta.preferred_capabilities),
    preferred_models: normalizeStringList(meta.preferred_models),
    disallowed_models: normalizeStringList(meta.disallowed_models),
    context_intensity: normalizeEnumValue(
      meta.context_intensity,
      VALID_ROUTING_CONTEXT_INTENSITIES
    ),
    quality_priority: normalizeEnumValue(
      meta.quality_priority,
      VALID_ROUTING_PRIORITY_LEVELS
    ),
    speed_priority: normalizeEnumValue(
      meta.speed_priority,
      VALID_ROUTING_PRIORITY_LEVELS
    ),
    max_cost_tier: normalizeString(meta.max_cost_tier),
    lane: normalizeString(meta.lane),
    repo_area: normalizeString(meta.repo_area),
    repo: normalizeString(meta.repo),
    branch: normalizeString(meta.branch),
    decomposition_hint: normalizeString(meta.decomposition_hint),
    language: null,
    framework: null,
    complexity: null,
    risk_level: null,
    privacy_sensitivity: null,
    environment_constraints: {
      fallback_only: context.fallback_only === true,
      retry_attempt:
        typeof context.retry_attempt === "number" &&
        Number.isFinite(context.retry_attempt)
          ? context.retry_attempt
          : null,
      resumed_from_run_id: normalizeString(context.resumed_from_run_id),
      factory_read_only: context.factory_read_only === true,
    },
  };
}
