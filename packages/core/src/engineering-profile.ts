export const RISK_TOLERANCES = ["fast", "balanced", "safe"] as const;
export type RiskTolerance = (typeof RISK_TOLERANCES)[number];

export const PLANNING_DEPTHS = ["shallow", "standard", "deep"] as const;
export type PlanningDepth = (typeof PLANNING_DEPTHS)[number];

export const VALIDATION_STRICTNESSES = ["minimal", "standard", "strict"] as const;
export type ValidationStrictness = (typeof VALIDATION_STRICTNESSES)[number];

export const PROFILE_COST_TIERS = ["standard", "premium"] as const;
export type ProfileCostTier = (typeof PROFILE_COST_TIERS)[number];

export interface EngineeringProfile {
  profile_id: string;
  workspace_id: string | null;
  name: string;
  description: string;
  is_preset: boolean;
  risk_tolerance: RiskTolerance;
  planning_depth: PlanningDepth;
  validation_strictness: ValidationStrictness;
  required_artifacts: string[];
  enabled_skills: string[];
  stack_assumptions: string[];
  max_cost_tier: ProfileCostTier;
  created_at: string;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function normalizeRiskTolerance(value: unknown): RiskTolerance | null {
  if (value === undefined) return "balanced";
  return (RISK_TOLERANCES as readonly string[]).includes(String(value))
    ? (value as RiskTolerance)
    : null;
}

function normalizePlanningDepth(value: unknown): PlanningDepth | null {
  if (value === undefined) return "standard";
  return (PLANNING_DEPTHS as readonly string[]).includes(String(value))
    ? (value as PlanningDepth)
    : null;
}

function normalizeValidationStrictness(value: unknown): ValidationStrictness | null {
  if (value === undefined) return "standard";
  return (VALIDATION_STRICTNESSES as readonly string[]).includes(String(value))
    ? (value as ValidationStrictness)
    : null;
}

function normalizeProfileCostTier(value: unknown): ProfileCostTier | null {
  if (value === undefined) return "standard";
  return (PROFILE_COST_TIERS as readonly string[]).includes(String(value))
    ? (value as ProfileCostTier)
    : null;
}

export function normalizeEngineeringProfile(value: unknown): EngineeringProfile | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const profileId = asString(record.profile_id);
  const name = asString(record.name);
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const createdAt = asString(record.created_at);
  const updatedAt = asString(record.updated_at);
  const isPreset = typeof record.is_preset === "boolean" ? record.is_preset : null;
  const workspaceId = asOptionalString(record.workspace_id);

  const riskTolerance = normalizeRiskTolerance(record.risk_tolerance);
  const planningDepth = normalizePlanningDepth(record.planning_depth);
  const validationStrictness = normalizeValidationStrictness(record.validation_strictness);
  const maxCostTier = normalizeProfileCostTier(record.max_cost_tier);

  if (!profileId || !name || !createdAt || !updatedAt || isPreset === null) return null;
  if (!riskTolerance || !planningDepth || !validationStrictness || !maxCostTier) return null;

  if (isPreset && workspaceId !== null) return null;
  if (!isPreset && workspaceId === null) return null;

  return {
    profile_id: profileId,
    workspace_id: workspaceId,
    name,
    description,
    is_preset: isPreset,
    risk_tolerance: riskTolerance,
    planning_depth: planningDepth,
    validation_strictness: validationStrictness,
    required_artifacts: asStringArray(record.required_artifacts),
    enabled_skills: asStringArray(record.enabled_skills),
    stack_assumptions: asStringArray(record.stack_assumptions),
    max_cost_tier: maxCostTier,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function buildEngineeringProfileFixture(
  overrides: Partial<EngineeringProfile> = {}
): EngineeringProfile {
  return {
    profile_id: overrides.profile_id ?? "balanced-default",
    workspace_id: overrides.workspace_id ?? null,
    name: overrides.name ?? "Balanced Default",
    description: overrides.description ?? "Balanced profile for day-to-day engineering execution.",
    is_preset: overrides.is_preset ?? true,
    risk_tolerance: overrides.risk_tolerance ?? "balanced",
    planning_depth: overrides.planning_depth ?? "standard",
    validation_strictness: overrides.validation_strictness ?? "standard",
    required_artifacts: overrides.required_artifacts ?? ["tests", "validation-report"],
    enabled_skills: overrides.enabled_skills ?? ["default"],
    stack_assumptions: overrides.stack_assumptions ?? ["TypeScript monorepo"],
    max_cost_tier: overrides.max_cost_tier ?? "standard",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}