import type { EngineeringProfile } from "./engineering-profile.ts";

const PRESET_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const FAST_PROTOTYPING_PRESET: EngineeringProfile = {
  profile_id: "fast-prototyping",
  workspace_id: null,
  name: "Fast Prototyping",
  description: "Rapid iteration profile optimized for learning and speed.",
  is_preset: true,
  risk_tolerance: "fast",
  planning_depth: "shallow",
  validation_strictness: "minimal",
  required_artifacts: [],
  enabled_skills: [],
  stack_assumptions: [],
  max_cost_tier: "standard",
  created_at: PRESET_TIMESTAMP,
  updated_at: PRESET_TIMESTAMP,
};

export const BALANCED_DEFAULT_PRESET: EngineeringProfile = {
  profile_id: "balanced-default",
  workspace_id: null,
  name: "Balanced Default",
  description: "Default profile for day-to-day engineering work.",
  is_preset: true,
  risk_tolerance: "balanced",
  planning_depth: "standard",
  validation_strictness: "standard",
  required_artifacts: ["working-brief"],
  enabled_skills: [],
  stack_assumptions: [],
  max_cost_tier: "standard",
  created_at: PRESET_TIMESTAMP,
  updated_at: PRESET_TIMESTAMP,
};

export const PRODUCTION_SAFE_PRESET: EngineeringProfile = {
  profile_id: "production-safe",
  workspace_id: null,
  name: "Production Safe",
  description: "Strict profile for high-confidence, production-critical work.",
  is_preset: true,
  risk_tolerance: "safe",
  planning_depth: "deep",
  validation_strictness: "strict",
  required_artifacts: ["working-brief", "implementation-plan", "validation-notes"],
  enabled_skills: [],
  stack_assumptions: [],
  max_cost_tier: "premium",
  created_at: PRESET_TIMESTAMP,
  updated_at: PRESET_TIMESTAMP,
};

export const PROFILE_PRESETS: readonly EngineeringProfile[] = [
  FAST_PROTOTYPING_PRESET,
  BALANCED_DEFAULT_PRESET,
  PRODUCTION_SAFE_PRESET,
];

export const DEFAULT_PROFILE_ID = "balanced-default" as const;

export function getPresetById(id: string): EngineeringProfile | null {
  return PROFILE_PRESETS.find((profile) => profile.profile_id === id) ?? null;
}