import * as fs from "fs";
import * as path from "path";
import type {
  DryRunEstimate,
  ExecutionBindingResult,
  ExecutionPreference,
  RunRecord,
  TaskProfile,
} from "@devory/core";

export const EXECUTION_OUTCOME_VERSION = "execution-outcome-v1" as const;
export const EXECUTION_OUTCOME_ARTIFACT = path.join(
  "artifacts",
  "routing-outcomes",
  "execution-outcomes.jsonl"
);

export type ExecutionOutcomeResultStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked"
  | "no-op";

export interface TaskProfileSummaryRecord {
  total_tasks: number;
  dominant_complexity_tier: TaskProfile["complexity_tier"] | null;
  dominant_local_viability: TaskProfile["local_viability"] | null;
  decomposition_candidates: number;
  recommended_provider_mix: {
    deterministic: number;
    local: number;
    cloud: number;
  };
}

export interface ExecutionOutcomeRecord {
  version: typeof EXECUTION_OUTCOME_VERSION;
  outcome_id: string;
  sequence: number;
  recorded_at: string;
  run_id: string | null;
  task_ids: string[];
  task_profile_summary: TaskProfileSummaryRecord | null;
  selected_provider_class: string | null;
  selected_target_id: string | null;
  selected_adapter_id: string | null;
  actual_provider_class: string | null;
  actual_target_id: string | null;
  actual_adapter_id: string | null;
  preference_used: ExecutionPreference | null;
  fallback_taken: boolean;
  fallback_reason: string | null;
  readiness_state: string | null;
  execution_path: string | null;
  estimated_cost_usd_min: number | null;
  estimated_cost_usd_max: number | null;
  run_result_status: ExecutionOutcomeResultStatus | null;
  failure_reason: string | null;
  learnable: boolean | null;
  decomposition_recommended: boolean | null;
}

export interface ExecutionOutcomeSession {
  outcome_id: string;
  next_sequence: number;
}

export interface ExecutionOutcomeBaseInput {
  timestamp: string;
  task_ids: string[];
  task_profiles: TaskProfile[];
  binding: ExecutionBindingResult;
  estimate?: DryRunEstimate | null;
  preference_used: ExecutionPreference;
}

export interface FinalizeExecutionOutcomeInput {
  timestamp: string;
  run_id?: string | null;
  run_record?: RunRecord | null;
  exit_code?: number | null;
  signal?: string | null;
  no_output?: boolean;
  failure_reason?: string | null;
}

function createOutcomeId(timestamp: string): string {
  const safe = timestamp.replace(/[:.]/g, "-");
  return `routing-outcome-${safe}`;
}

function countBy<T extends string>(values: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function dominantValue<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = countBy(values);
  let winner: T | null = null;
  let winnerCount = -1;
  for (const value of values) {
    const nextCount = counts.get(value) ?? 0;
    if (nextCount > winnerCount) {
      winner = value;
      winnerCount = nextCount;
    }
  }
  return winner;
}

export function summarizeTaskProfiles(
  taskProfiles: TaskProfile[]
): TaskProfileSummaryRecord | null {
  if (taskProfiles.length === 0) {
    return null;
  }

  return {
    total_tasks: taskProfiles.length,
    dominant_complexity_tier: dominantValue(
      taskProfiles.map((profile) => profile.complexity_tier)
    ),
    dominant_local_viability: dominantValue(
      taskProfiles.map((profile) => profile.local_viability)
    ),
    decomposition_candidates: taskProfiles.filter(
      (profile) => profile.decomposition_candidate
    ).length,
    recommended_provider_mix: {
      deterministic: taskProfiles.filter(
        (profile) => profile.recommended_provider_class === "deterministic"
      ).length,
      local: taskProfiles.filter(
        (profile) => profile.recommended_provider_class === "local"
      ).length,
      cloud: taskProfiles.filter(
        (profile) => profile.recommended_provider_class === "cloud"
      ).length,
    },
  };
}

function resolveSelectedProviderClass(binding: ExecutionBindingResult): string | null {
  return binding.originally_targeted_class ?? binding.selected_provider_class ?? null;
}

function resolveActualProviderClass(binding: ExecutionBindingResult): string | null {
  return binding.selected_provider_class ?? null;
}

function resolveFallbackReason(binding: ExecutionBindingResult): string | null {
  return (
    binding.fallback_reason ??
    binding.target_fallback_reason ??
    binding.adapter_fallback_reason ??
    null
  );
}

function resolveLearnable(
  runRecord: RunRecord | null | undefined,
  runResultStatus: ExecutionOutcomeResultStatus,
  failureReason: string | null,
): boolean | null {
  if (runResultStatus === "cancelled") {
    return null;
  }

  if (runRecord) {
    const executedAny = runRecord.tasks_executed.length > 0;
    const failedAny = runRecord.tasks_executed.some(
      (record) => record.outcome === "failure"
    );
    if (executedAny && !failedAny) {
      return true;
    }
    if (failedAny) {
      return false;
    }
  }

  if (runResultStatus === "completed") {
    return true;
  }
  if (runResultStatus === "failed" || runResultStatus === "blocked" || runResultStatus === "no-op") {
    return false;
  }
  if (
    runResultStatus === "cancelled" &&
    failureReason &&
    failureReason.toLowerCase().includes("stopped by operator")
  ) {
    return null;
  }
  return null;
}

function mapRunResultStatus(input: {
  runRecord?: RunRecord | null;
  exitCode?: number | null;
  signal?: string | null;
  noOutput?: boolean;
  failureReason?: string | null;
}): ExecutionOutcomeResultStatus {
  const failureReason = input.failureReason?.trim() ?? "";
  const lowerReason = failureReason.toLowerCase();
  if (input.runRecord) {
    if (input.runRecord.status === "completed") {
      return "completed";
    }
    if (input.runRecord.status === "paused_for_review") {
      return "completed";
    }
    if (
      input.runRecord.status === "failed" &&
      (lowerReason.includes("stopped by operator") ||
        lowerReason.includes("stop requested"))
    ) {
      return "cancelled";
    }
    if (input.runRecord.status === "failed") {
      return "failed";
    }
  }

  if (input.signal) {
    return "cancelled";
  }
  if (input.noOutput) {
    return "no-op";
  }
  if ((input.exitCode ?? 0) !== 0) {
    return "failed";
  }
  return "completed";
}

function resolveFailureReason(input: {
  runRecord?: RunRecord | null;
  failureReason?: string | null;
  signal?: string | null;
  exitCode?: number | null;
}): string | null {
  if (input.runRecord?.failure?.reason) {
    return input.runRecord.failure.reason;
  }
  if (input.signal) {
    return `Process killed by signal ${input.signal}`;
  }
  if ((input.exitCode ?? 0) !== 0) {
    if (input.failureReason && input.failureReason.trim() !== "") {
      return input.failureReason.trim();
    }
    return `Process exited with code ${input.exitCode ?? 1}`;
  }
  if (
    input.runRecord &&
    (input.runRecord.status === "completed" ||
      input.runRecord.status === "paused_for_review")
  ) {
    return null;
  }
  if (input.failureReason && input.failureReason.trim() !== "") {
    return input.failureReason.trim();
  }
  return null;
}

export function createExecutionOutcomeSession(
  timestamp: string
): ExecutionOutcomeSession {
  return {
    outcome_id: createOutcomeId(timestamp),
    next_sequence: 1,
  };
}

export function buildRunStartOutcome(
  session: ExecutionOutcomeSession,
  input: ExecutionOutcomeBaseInput,
  runId: string | null
): ExecutionOutcomeRecord {
  return {
    version: EXECUTION_OUTCOME_VERSION,
    outcome_id: session.outcome_id,
    sequence: session.next_sequence,
    recorded_at: input.timestamp,
    run_id: runId,
    task_ids: [...input.task_ids],
    task_profile_summary: summarizeTaskProfiles(input.task_profiles),
    selected_provider_class: resolveSelectedProviderClass(input.binding),
    selected_target_id: input.binding.selected_target_id ?? null,
    selected_adapter_id: input.binding.selected_adapter_id ?? null,
    actual_provider_class: resolveActualProviderClass(input.binding),
    actual_target_id: input.binding.actual_target_id ?? null,
    actual_adapter_id: input.binding.actual_adapter_id ?? null,
    preference_used: input.preference_used,
    fallback_taken:
      input.binding.fallback_taken ||
      input.binding.target_fallback_taken ||
      input.binding.adapter_fallback_taken,
    fallback_reason: resolveFallbackReason(input.binding),
    readiness_state: input.binding.target_readiness_state ?? null,
    execution_path:
      input.binding.actual_execution_path ??
      input.binding.execution_path ??
      null,
    estimated_cost_usd_min: input.estimate?.estimated_cost_usd.min ?? null,
    estimated_cost_usd_max: input.estimate?.estimated_cost_usd.max ?? null,
    run_result_status: null,
    failure_reason: null,
    learnable: null,
    decomposition_recommended: input.binding.decomposition_recommended,
  };
}

export function finalizeExecutionOutcome(
  record: ExecutionOutcomeRecord,
  session: ExecutionOutcomeSession,
  input: FinalizeExecutionOutcomeInput
): ExecutionOutcomeRecord {
  const failureReason = resolveFailureReason({
    runRecord: input.run_record,
    failureReason: input.failure_reason,
    signal: input.signal,
    exitCode: input.exit_code,
  });
  const runResultStatus = mapRunResultStatus({
    runRecord: input.run_record,
    exitCode: input.exit_code,
    signal: input.signal,
    noOutput: input.no_output,
    failureReason,
  });

  return {
    ...record,
    sequence: session.next_sequence,
    recorded_at: input.timestamp,
    run_id: input.run_id ?? input.run_record?.run_id ?? record.run_id,
    run_result_status: runResultStatus,
    failure_reason: failureReason,
    learnable: resolveLearnable(input.run_record, runResultStatus, failureReason),
  };
}

export function appendExecutionOutcomeRecord(
  factoryRoot: string,
  record: ExecutionOutcomeRecord
): string {
  const artifactPath = path.join(factoryRoot, EXECUTION_OUTCOME_ARTIFACT);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.appendFileSync(artifactPath, `${JSON.stringify(record)}\n`, "utf-8");
  return artifactPath;
}
