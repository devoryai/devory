export type RoutingEvaluationStatus = "successful" | "unsuccessful" | "inconclusive";
export type RoutingValidationOutcome = "passed" | "failed" | "not-run" | null;
export type RoutingReviewOutcome =
  | "approved"
  | "send-back"
  | "blocked"
  | "needs-human-edits"
  | null;
export type RoutingManualIntervention = "required" | "performed" | null;
export type RoutingEvidenceStatus = "complete" | "partial" | "missing";

export interface RoutingOutcomeEvaluation {
  evaluation_status: RoutingEvaluationStatus;
  evidence_status: RoutingEvidenceStatus;
  validation_outcome: RoutingValidationOutcome;
  review_outcome: RoutingReviewOutcome;
  manual_intervention: RoutingManualIntervention;
  retry_count: number | null;
  runtime_ms: number | null;
  spend_units: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  review_artifact_path: string | null;
  promotion_decision_path: string | null;
  source_artifacts: string[];
  updated_at: string | null;
}

export interface BuildRoutingOutcomeEvaluationInput {
  validation_outcome?: RoutingValidationOutcome;
  review_outcome?: RoutingReviewOutcome;
  manual_intervention?: RoutingManualIntervention;
  retry_count?: number | null;
  runtime_ms?: number | null;
  spend_units?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  review_artifact_path?: string | null;
  promotion_decision_path?: string | null;
  source_artifacts?: string[];
  updated_at?: string | null;
}

export function buildRoutingOutcomeEvaluation(
  input: BuildRoutingOutcomeEvaluationInput
): RoutingOutcomeEvaluation {
  const validationOutcome = input.validation_outcome ?? null;
  const reviewOutcome = input.review_outcome ?? null;
  const manualIntervention = input.manual_intervention ?? null;
  const evidenceCount = [validationOutcome, reviewOutcome, manualIntervention].filter(
    (value) => value !== null
  ).length;
  const evidenceStatus: RoutingEvidenceStatus =
    evidenceCount === 0 ? "missing" : evidenceCount === 3 ? "complete" : "partial";

  let evaluationStatus: RoutingEvaluationStatus = "inconclusive";
  if (reviewOutcome === "approved") {
    evaluationStatus = "successful";
  } else if (
    reviewOutcome === "send-back" ||
    reviewOutcome === "blocked" ||
    reviewOutcome === "needs-human-edits" ||
    validationOutcome === "failed"
  ) {
    evaluationStatus = "unsuccessful";
  } else if (validationOutcome === "passed" && manualIntervention === "performed") {
    evaluationStatus = "successful";
  }

  return {
    evaluation_status: evaluationStatus,
    evidence_status: evidenceStatus,
    validation_outcome: validationOutcome,
    review_outcome: reviewOutcome,
    manual_intervention: manualIntervention,
    retry_count: input.retry_count ?? null,
    runtime_ms: input.runtime_ms ?? null,
    spend_units: input.spend_units ?? null,
    total_tokens: input.total_tokens ?? null,
    estimated_cost_usd: input.estimated_cost_usd ?? null,
    review_artifact_path: input.review_artifact_path ?? null,
    promotion_decision_path: input.promotion_decision_path ?? null,
    source_artifacts: input.source_artifacts ?? [],
    updated_at: input.updated_at ?? null,
  };
}
