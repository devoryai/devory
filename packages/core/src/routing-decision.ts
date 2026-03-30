import type { NormalizedRoutingInput } from "./routing-input.ts";

export const ROUTING_DECISION_VERSION = "routing-decision-v1" as const;

export type RoutingDecisionStatus = "selected" | "fallback" | "blocked" | "no-route";

export interface RoutingDecisionRejectedCandidate {
  model_id: string;
  reasons: string[];
}

export interface RoutingDecisionFallbackPath {
  taken: boolean;
  selected_model_id: string | null;
  candidate_model_ids: string[];
  rejected_primary_candidates: RoutingDecisionRejectedCandidate[];
  reasons: string[];
}

export interface RoutingDecisionLinkage {
  decision_id: string | null;
  task_id: string | null;
  run_id: string | null;
  pipeline_run_id: string | null;
  stage_name: string | null;
  attempt_number: number | null;
}

export interface UnifiedRoutingDecision {
  version: typeof ROUTING_DECISION_VERSION;
  policy: "deterministic-rule-based";
  deterministic: true;
  status: RoutingDecisionStatus;
  linkage: RoutingDecisionLinkage;
  normalized_input: NormalizedRoutingInput | null;
  engine: string;
  provider: string | null;
  model_id: string | null;
  model_display_name: string | null;
  rationale: string[];
  failure_reasons: string[];
  fallback_path: RoutingDecisionFallbackPath;
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function buildRoutingDecisionId(linkage: {
  task_id?: string | null;
  run_id?: string | null;
  pipeline_run_id?: string | null;
  stage_name?: string | null;
  attempt_number?: number | null;
}): string {
  const parts = [
    "route",
    linkage.task_id ? slug(linkage.task_id) : "task",
    linkage.run_id ? slug(linkage.run_id) : "run",
    linkage.pipeline_run_id ? slug(linkage.pipeline_run_id) : "pipeline",
    linkage.stage_name ? slug(linkage.stage_name) : "stage",
    linkage.attempt_number === null || linkage.attempt_number === undefined
      ? "attempt-na"
      : `attempt-${linkage.attempt_number}`,
  ];
  return parts.join("-");
}

export function attachRoutingDecisionLinkage(
  decision: Omit<UnifiedRoutingDecision, "version" | "linkage" | "normalized_input">,
  linkage: Partial<RoutingDecisionLinkage> = {},
  normalizedInput: NormalizedRoutingInput | null = null
): UnifiedRoutingDecision {
  const resolvedLinkage: RoutingDecisionLinkage = {
    decision_id:
      typeof linkage.decision_id === "string" && linkage.decision_id !== ""
        ? linkage.decision_id
        : buildRoutingDecisionId(linkage),
    task_id: linkage.task_id ?? null,
    run_id: linkage.run_id ?? null,
    pipeline_run_id: linkage.pipeline_run_id ?? null,
    stage_name: linkage.stage_name ?? null,
    attempt_number: linkage.attempt_number ?? null,
  };

  return {
    ...decision,
    version: ROUTING_DECISION_VERSION,
    linkage: resolvedLinkage,
    normalized_input: normalizedInput,
  };
}
