/**
 * packages/core/src/run-ledger.ts
 *
 * Shared durable run ledger contract for routing evidence and execution history.
 * Readers use normalizeRunRecord() so older run files remain readable while new
 * writes can persist a stable schema with explicit placeholders.
 */

import type { NormalizedRoutingInput } from "./routing-input.ts";
import type { UnifiedRoutingDecision } from "./routing-decision.ts";
import type { RoutingOutcomeEvaluation } from "./routing-evaluation.ts";
import type {
  HumanInterruptionLevel,
  HumanQuestionFallbackBehavior,
} from "./human-question.ts";
import {
  normalizeUnattendedExecutionSnapshot,
  PROGRESS_EVENT_CATEGORIES,
  UNATTENDED_RUN_STATUSES,
  type ProgressEventCategory,
  type UnattendedExecutionSnapshot,
  type UnattendedRunStatus,
} from "./unattended-execution.ts";

export const RUN_LEDGER_VERSION = "routing-evidence-v1" as const;

export type ResumableRunStatus = "failed" | "paused_for_review";

export const RESUMABLE_RUN_STATUSES: readonly ResumableRunStatus[] = [
  "failed",
  "paused_for_review",
] as const;

export interface FailureRecord {
  task_id: string;
  reason: string;
  timestamp: string;
}

export interface CostEventRecord {
  task_id: string;
  model_id: string | null;
  status: "warn" | "block";
  reasons: string[];
  spend_units: number;
  timestamp: string;
}

export interface RoutingInputSnapshot {
  routing_decision_id: string | null;
  related_routing_decision_ids: string[];
  requested_role: string | null;
  requested_engine: string | null;
  requested_pipeline: string | null;
  task_branch: string | null;
  normalized_summary: string | null;
  normalized_input: NormalizedRoutingInput | null;
}

export interface RoutingSelectionEvidence {
  selected_engine: string | null;
  selected_provider: string | null;
  selected_model: string | null;
  rationale: string[];
}

export interface RoutingFallbackEvidence {
  taken: boolean;
  reason: string | null;
  attempted_path: string[];
}

export interface RoutingRetryEvidence {
  attempts: number;
  resumed_from_run_id: string | null;
  history: string[];
}

export interface RoutingTimingEvidence {
  queued_at: string | null;
  routing_started_at: string | null;
  routing_completed_at: string | null;
  execution_started_at: string | null;
  execution_completed_at: string | null;
}

export interface RoutingUsageEvidence {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  spend_units: number | null;
  estimated_cost_usd: number | null;
  cost_tier: string | null;
}

export interface OutcomeEvidence {
  final_stage: string | null;
  verification_state: string | null;
  outcome_label: string | null;
  operator_summary: string | null;
  evaluation: RoutingOutcomeEvaluation | null;
}

export interface RoutingEvidenceRecord {
  routing_decision: UnifiedRoutingDecision | null;
  requested_role: string | null;
  input_snapshot: RoutingInputSnapshot;
  selection: RoutingSelectionEvidence;
  fallback: RoutingFallbackEvidence;
  retries: RoutingRetryEvidence;
  timing: RoutingTimingEvidence;
  usage: RoutingUsageEvidence;
  outcome: OutcomeEvidence;
}

export type TaskBlockKind =
  | "human-question"
  | "execution-failure"
  | "dependency-wait";

export interface TaskBlockState {
  kind: TaskBlockKind | null;
  question_id: string | null;
  dependency_task_id: string | null;
  reason: string | null;
  since: string | null;
  interruption_level: HumanInterruptionLevel | null;
  fallback_behavior: HumanQuestionFallbackBehavior | null;
}

export interface RunInterruptionState {
  active: boolean;
  question_id: string | null;
  blocking_task_id: string | null;
  lane_id: string | null;
  interruption_level: HumanInterruptionLevel | null;
  fallback_behavior: HumanQuestionFallbackBehavior | null;
  run_disposition: "continue" | "pause" | "halt" | null;
  lane_state: "running" | "paused" | null;
  updated_at: string | null;
}

export interface TaskRecord {
  task_id: string;
  outcome: string;
  engine: string;
  fallback_taken: boolean;
  start_time: string;
  end_time: string;
  notes: string[];
  model_id: string | null;
  cost_tier: string | null;
  spend_units: number | null;
  cost_guardrail_status: "allow" | "warn" | "block" | null;
  cost_guardrail_notes: string[];
  routing_evidence: RoutingEvidenceRecord;
  block_state?: TaskBlockState | null;
}

export interface RunLedgerSummary {
  total_tasks: number;
  tasks_executed_count: number;
  tasks_remaining_count: number;
  success_count: number;
  failure_count: number;
  review_count: number;
  fallback_count: number;
  retry_count: number;
  engines_used: string[];
  providers_used: string[];
  models_used: string[];
  spend_units_consumed: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export interface ProgressEventRecord {
  event_id: string;
  sequence: number;
  category: ProgressEventCategory;
  status: UnattendedRunStatus | null;
  task_id: string | null;
  created_at: string;
  summary: string;
  details: string[];
}

export interface RoutingLedger {
  version: typeof RUN_LEDGER_VERSION;
  compatibility_mode: "native" | "legacy-normalized";
  run_summary: RunLedgerSummary;
  outcome_placeholders: {
    requested_by: string | null;
    operator_summary: string | null;
    post_run_review: string | null;
  };
}

export interface RunRecord {
  run_id: string;
  status: string;
  task_queue: string[];
  tasks_executed: TaskRecord[];
  failure: FailureRecord | null;
  spend_units_consumed: number;
  cost_events: CostEventRecord[];
  start_time: string;
  end_time: string | null;
  routing_ledger: RoutingLedger;
  unattended_execution: UnattendedExecutionSnapshot | null;
  progress_events: ProgressEventRecord[];
  interruption_state?: RunInterruptionState | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeFailureRecord(value: unknown): FailureRecord | null {
  const record = asObject(value);
  if (!record) return null;
  const taskId = asString(record.task_id);
  const reason = asString(record.reason);
  const timestamp = asString(record.timestamp);
  if (!taskId || !reason || !timestamp) return null;
  return {
    task_id: taskId,
    reason,
    timestamp,
  };
}

function normalizeCostEventRecord(value: unknown): CostEventRecord | null {
  const record = asObject(value);
  if (!record) return null;
  const status = record.status === "warn" || record.status === "block" ? record.status : null;
  const taskId = asString(record.task_id);
  const timestamp = asString(record.timestamp);
  if (!status || !taskId || !timestamp) return null;
  return {
    task_id: taskId,
    model_id: asNullableString(record.model_id),
    status,
    reasons: asStringArray(record.reasons),
    spend_units: asNumber(record.spend_units, 0),
    timestamp,
  };
}

function normalizeProgressEventRecord(value: unknown): ProgressEventRecord | null {
  const record = asObject(value);
  if (!record) return null;
  const eventId = asString(record.event_id);
  const sequence = asNumber(record.sequence, Number.NaN);
  const createdAt = asString(record.created_at);
  const summary = asString(record.summary);
  const category =
    typeof record.category === "string" &&
    (PROGRESS_EVENT_CATEGORIES as readonly string[]).includes(record.category)
      ? (record.category as ProgressEventCategory)
      : null;
  const status =
    typeof record.status === "string" &&
    (UNATTENDED_RUN_STATUSES as readonly string[]).includes(record.status)
      ? (record.status as UnattendedRunStatus)
      : null;
  if (!eventId || !Number.isFinite(sequence) || !createdAt || !summary || !category) {
    return null;
  }
  return {
    event_id: eventId,
    sequence,
    category,
    status,
    task_id: asNullableString(record.task_id),
    created_at: createdAt,
    summary,
    details: asStringArray(record.details),
  };
}

function normalizeTaskBlockState(value: unknown): TaskBlockState | null {
  const record = asObject(value);
  if (!record) return null;
  const kind =
    record.kind === "human-question" ||
    record.kind === "execution-failure" ||
    record.kind === "dependency-wait"
      ? record.kind
      : null;
  const interruptionLevel =
    record.interruption_level === "level_1" ||
    record.interruption_level === "level_2" ||
    record.interruption_level === "level_3"
      ? record.interruption_level
      : null;
  const fallbackBehavior =
    record.fallback_behavior === "continue-other-work" ||
    record.fallback_behavior === "pause-affected-lane" ||
    record.fallback_behavior === "halt-run" ||
    record.fallback_behavior === "assume-default" ||
    record.fallback_behavior === "skip-task"
      ? record.fallback_behavior
      : null;

  return {
    kind,
    question_id: asNullableString(record.question_id),
    dependency_task_id: asNullableString(record.dependency_task_id),
    reason: asNullableString(record.reason),
    since: asNullableString(record.since),
    interruption_level: interruptionLevel,
    fallback_behavior: fallbackBehavior,
  };
}

function normalizeRunInterruptionState(value: unknown): RunInterruptionState | null {
  const record = asObject(value);
  if (!record) return null;
  const interruptionLevel =
    record.interruption_level === "level_1" ||
    record.interruption_level === "level_2" ||
    record.interruption_level === "level_3"
      ? record.interruption_level
      : null;
  const fallbackBehavior =
    record.fallback_behavior === "continue-other-work" ||
    record.fallback_behavior === "pause-affected-lane" ||
    record.fallback_behavior === "halt-run" ||
    record.fallback_behavior === "assume-default" ||
    record.fallback_behavior === "skip-task"
      ? record.fallback_behavior
      : null;
  const runDisposition =
    record.run_disposition === "continue" ||
    record.run_disposition === "pause" ||
    record.run_disposition === "halt"
      ? record.run_disposition
      : null;
  const laneState =
    record.lane_state === "running" || record.lane_state === "paused"
      ? record.lane_state
      : null;

  return {
    active: asBoolean(record.active),
    question_id: asNullableString(record.question_id),
    blocking_task_id: asNullableString(record.blocking_task_id),
    lane_id: asNullableString(record.lane_id),
    interruption_level: interruptionLevel,
    fallback_behavior: fallbackBehavior,
    run_disposition: runDisposition,
    lane_state: laneState,
    updated_at: asNullableString(record.updated_at),
  };
}

function buildRoutingEvidence(record: Record<string, unknown>): RoutingEvidenceRecord {
  const existing = asObject(record.routing_evidence);
  const decision = asObject(existing?.routing_decision);
  const selection = asObject(existing?.selection);
  const fallback = asObject(existing?.fallback);
  const retries = asObject(existing?.retries);
  const timing = asObject(existing?.timing);
  const usage = asObject(existing?.usage);
  const outcome = asObject(existing?.outcome);
  const inputSnapshot = asObject(existing?.input_snapshot);
  const normalizedInput =
    inputSnapshot?.normalized_input && typeof inputSnapshot.normalized_input === "object"
      ? (inputSnapshot.normalized_input as unknown as NormalizedRoutingInput)
      : null;
  const routingDecision =
    decision && typeof decision === "object"
      ? (decision as unknown as UnifiedRoutingDecision)
      : null;

  const selectedEngine = asNullableString(selection?.selected_engine) ?? asString(record.engine);
  const selectedModel = asNullableString(selection?.selected_model) ?? asNullableString(record.model_id);
  const fallbackTaken = asBoolean(fallback?.taken, asBoolean(record.fallback_taken));
  const spendUnits = asNullableNumber(usage?.spend_units) ?? asNullableNumber(record.spend_units);
  const costTier = asNullableString(usage?.cost_tier) ?? asNullableString(record.cost_tier);
  const outcomeLabel = asNullableString(outcome?.outcome_label) ?? asString(record.outcome);

  return {
    routing_decision: routingDecision,
    requested_role: asNullableString(existing?.requested_role),
    input_snapshot: {
      routing_decision_id:
        asNullableString(inputSnapshot?.routing_decision_id) ??
        asNullableString(asObject(routingDecision?.linkage)?.decision_id),
      related_routing_decision_ids: asStringArray(inputSnapshot?.related_routing_decision_ids),
      requested_role: asNullableString(inputSnapshot?.requested_role),
      requested_engine: asNullableString(inputSnapshot?.requested_engine),
      requested_pipeline: asNullableString(inputSnapshot?.requested_pipeline),
      task_branch: asNullableString(inputSnapshot?.task_branch),
      normalized_summary: asNullableString(inputSnapshot?.normalized_summary),
      normalized_input: normalizedInput,
    },
    selection: {
      selected_engine:
        selectedEngine || asNullableString(routingDecision?.engine) || null,
      selected_provider:
        asNullableString(selection?.selected_provider) ?? asNullableString(routingDecision?.provider),
      selected_model: selectedModel ?? asNullableString(routingDecision?.model_id),
      rationale:
        asStringArray(selection?.rationale).length > 0
          ? asStringArray(selection?.rationale)
          : asStringArray(routingDecision?.rationale),
    },
    fallback: {
      taken: fallbackTaken,
      reason:
        asNullableString(fallback?.reason) ??
        (asStringArray(asObject(routingDecision?.fallback_path)?.reasons)[0] ?? null),
      attempted_path:
        asStringArray(fallback?.attempted_path).length > 0
          ? asStringArray(fallback?.attempted_path)
          : asStringArray(asObject(routingDecision?.fallback_path)?.candidate_model_ids),
    },
    retries: {
      attempts: asNumber(retries?.attempts, 0),
      resumed_from_run_id: asNullableString(retries?.resumed_from_run_id),
      history: asStringArray(retries?.history),
    },
    timing: {
      queued_at: asNullableString(timing?.queued_at),
      routing_started_at: asNullableString(timing?.routing_started_at),
      routing_completed_at: asNullableString(timing?.routing_completed_at),
      execution_started_at: asNullableString(timing?.execution_started_at) ?? asString(record.start_time),
      execution_completed_at: asNullableString(timing?.execution_completed_at) ?? asString(record.end_time),
    },
    usage: {
      prompt_tokens: asNullableNumber(usage?.prompt_tokens),
      completion_tokens: asNullableNumber(usage?.completion_tokens),
      total_tokens: asNullableNumber(usage?.total_tokens),
      spend_units: spendUnits,
      estimated_cost_usd: asNullableNumber(usage?.estimated_cost_usd),
      cost_tier: costTier,
    },
    outcome: {
      final_stage: asNullableString(outcome?.final_stage),
      verification_state: asNullableString(outcome?.verification_state),
      outcome_label: outcomeLabel || null,
      operator_summary: asNullableString(outcome?.operator_summary),
      evaluation:
        outcome?.evaluation && typeof outcome.evaluation === "object"
          ? (outcome.evaluation as unknown as RoutingOutcomeEvaluation)
          : null,
    },
  };
}

export function normalizeTaskRecord(value: unknown): TaskRecord | null {
  const record = asObject(value);
  if (!record) return null;
  const taskId = asString(record.task_id);
  const outcome = asString(record.outcome);
  const engine = asString(record.engine);
  const startTime = asString(record.start_time);
  const endTime = asString(record.end_time);
  if (!taskId || !outcome || !engine || !startTime || !endTime) {
    return null;
  }

  return {
    task_id: taskId,
    outcome,
    engine,
    fallback_taken: asBoolean(record.fallback_taken),
    start_time: startTime,
    end_time: endTime,
    notes: asStringArray(record.notes),
    model_id: asNullableString(record.model_id),
    cost_tier: asNullableString(record.cost_tier),
    spend_units: asNullableNumber(record.spend_units),
    cost_guardrail_status:
      record.cost_guardrail_status === "allow" ||
      record.cost_guardrail_status === "warn" ||
      record.cost_guardrail_status === "block"
        ? record.cost_guardrail_status
        : null,
    cost_guardrail_notes: asStringArray(record.cost_guardrail_notes),
    routing_evidence: buildRoutingEvidence(record),
    block_state: normalizeTaskBlockState(record.block_state),
  };
}

function buildRunLedgerSummary(
  taskQueue: string[],
  tasksExecuted: TaskRecord[],
  spendUnitsConsumed: number
): RunLedgerSummary {
  const fallbackCount = tasksExecuted.filter((task) => task.routing_evidence.fallback.taken).length;
  const retryCount = tasksExecuted.reduce(
    (sum, task) => sum + task.routing_evidence.retries.attempts,
    0
  );
  const providers = new Set(
    tasksExecuted
      .map((task) => task.routing_evidence.selection.selected_provider)
      .filter((value): value is string => typeof value === "string" && value !== "")
  );
  const models = new Set(
    tasksExecuted
      .map((task) => task.routing_evidence.selection.selected_model)
      .filter((value): value is string => typeof value === "string" && value !== "")
  );
  const promptTokens = tasksExecuted.reduce<number | null>((sum, task) => {
    const value = task.routing_evidence.usage.prompt_tokens;
    return value === null ? sum : (sum ?? 0) + value;
  }, null);
  const completionTokens = tasksExecuted.reduce<number | null>((sum, task) => {
    const value = task.routing_evidence.usage.completion_tokens;
    return value === null ? sum : (sum ?? 0) + value;
  }, null);
  const totalTokens = tasksExecuted.reduce<number | null>((sum, task) => {
    const value = task.routing_evidence.usage.total_tokens;
    return value === null ? sum : (sum ?? 0) + value;
  }, null);

  return {
    total_tasks: taskQueue.length,
    tasks_executed_count: tasksExecuted.length,
    tasks_remaining_count: Math.max(taskQueue.length - tasksExecuted.length, 0),
    success_count: tasksExecuted.filter((task) => task.outcome === "success").length,
    failure_count: tasksExecuted.filter((task) => task.outcome === "failure").length,
    review_count: tasksExecuted.filter((task) => task.outcome === "skipped_for_review").length,
    fallback_count: fallbackCount,
    retry_count: retryCount,
    engines_used: [...new Set(tasksExecuted.map((task) => task.engine))],
    providers_used: [...providers],
    models_used: [...models],
    spend_units_consumed: spendUnitsConsumed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

export function normalizeRunRecord(
  value: unknown,
  options: { compatibilityMode?: "native" | "legacy-normalized" } = {}
): RunRecord | null {
  const record = asObject(value);
  if (!record) return null;
  const runId = asString(record.run_id);
  const status = asString(record.status);
  const startTime = asString(record.start_time);
  if (!runId || !status || !startTime) {
    return null;
  }

  const taskQueue = asStringArray(record.task_queue);
  const tasksExecuted = Array.isArray(record.tasks_executed)
    ? record.tasks_executed
        .map((task) => normalizeTaskRecord(task))
        .filter((task): task is TaskRecord => task !== null)
    : [];
  const spendUnitsConsumed = asNumber(record.spend_units_consumed, 0);
  const existingLedger = asObject(record.routing_ledger);
  const existingSummary = asObject(existingLedger?.run_summary);
  const compatibilityMode =
    options.compatibilityMode ??
    (asString(existingLedger?.version) === RUN_LEDGER_VERSION ? "native" : "legacy-normalized");

  return {
    run_id: runId,
    status,
    task_queue: taskQueue,
    tasks_executed: tasksExecuted,
    failure: normalizeFailureRecord(record.failure),
    spend_units_consumed: spendUnitsConsumed,
    cost_events: Array.isArray(record.cost_events)
      ? record.cost_events
          .map((event) => normalizeCostEventRecord(event))
          .filter((event): event is CostEventRecord => event !== null)
      : [],
    start_time: startTime,
    end_time: asNullableString(record.end_time),
    unattended_execution: normalizeUnattendedExecutionSnapshot(record.unattended_execution),
    progress_events: Array.isArray(record.progress_events)
      ? record.progress_events
          .map((event) => normalizeProgressEventRecord(event))
          .filter((event): event is ProgressEventRecord => event !== null)
      : [],
    interruption_state: normalizeRunInterruptionState(record.interruption_state),
    routing_ledger: {
      version: RUN_LEDGER_VERSION,
      compatibility_mode: compatibilityMode,
      run_summary: {
        ...buildRunLedgerSummary(taskQueue, tasksExecuted, spendUnitsConsumed),
        total_tasks: asNumber(existingSummary?.total_tasks, taskQueue.length),
        tasks_executed_count: asNumber(existingSummary?.tasks_executed_count, tasksExecuted.length),
        tasks_remaining_count: asNumber(
          existingSummary?.tasks_remaining_count,
          Math.max(taskQueue.length - tasksExecuted.length, 0)
        ),
        success_count: asNumber(
          existingSummary?.success_count,
          tasksExecuted.filter((task) => task.outcome === "success").length
        ),
        failure_count: asNumber(
          existingSummary?.failure_count,
          tasksExecuted.filter((task) => task.outcome === "failure").length
        ),
        review_count: asNumber(
          existingSummary?.review_count,
          tasksExecuted.filter((task) => task.outcome === "skipped_for_review").length
        ),
        fallback_count: asNumber(
          existingSummary?.fallback_count,
          tasksExecuted.filter((task) => task.routing_evidence.fallback.taken).length
        ),
        retry_count: asNumber(
          existingSummary?.retry_count,
          tasksExecuted.reduce((sum, task) => sum + task.routing_evidence.retries.attempts, 0)
        ),
        engines_used: asStringArray(existingSummary?.engines_used).length > 0
          ? asStringArray(existingSummary?.engines_used)
          : [...new Set(tasksExecuted.map((task) => task.engine))],
        providers_used: asStringArray(existingSummary?.providers_used),
        models_used: asStringArray(existingSummary?.models_used),
        spend_units_consumed: asNullableNumber(existingSummary?.spend_units_consumed) ?? spendUnitsConsumed,
        prompt_tokens: asNullableNumber(existingSummary?.prompt_tokens),
        completion_tokens: asNullableNumber(existingSummary?.completion_tokens),
        total_tokens: asNullableNumber(existingSummary?.total_tokens),
      },
      outcome_placeholders: {
        requested_by: asNullableString(asObject(existingLedger?.outcome_placeholders)?.requested_by),
        operator_summary: asNullableString(
          asObject(existingLedger?.outcome_placeholders)?.operator_summary
        ),
        post_run_review: asNullableString(
          asObject(existingLedger?.outcome_placeholders)?.post_run_review
        ),
      },
    },
  };
}

export function applyTaskRoutingOutcomeEvaluation(
  run: RunRecord,
  taskId: string,
  evaluation: RoutingOutcomeEvaluation,
  outcomePatch: Partial<OutcomeEvidence> = {}
): RunRecord {
  const targetIndex = [...run.tasks_executed]
    .map((task, index) => ({ task, index }))
    .reverse()
    .find(({ task }) => task.task_id === taskId)?.index;

  if (targetIndex === undefined) {
    return run;
  }

  const tasksExecuted = run.tasks_executed.map((task, index) =>
    index !== targetIndex
      ? task
      : {
          ...task,
          routing_evidence: {
            ...task.routing_evidence,
            outcome: {
              ...task.routing_evidence.outcome,
              ...outcomePatch,
              evaluation,
            },
          },
        }
  );

  return normalizeRunRecord(
    {
      ...run,
      tasks_executed: tasksExecuted,
    },
    { compatibilityMode: "native" }
  )!;
}
