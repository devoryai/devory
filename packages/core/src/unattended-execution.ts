export const UNATTENDED_EXECUTION_CONTRACT_VERSION =
  "unattended-execution-v1" as const;

export const UNATTENDED_RUN_STATUSES = [
  "starting",
  "active",
  "waiting_on_tool",
  "waiting_on_model",
  "checkpointing",
  "stalled",
  "blocked_on_human",
  "failed",
  "completed",
  "cancelled",
] as const;

export type UnattendedRunStatus = (typeof UNATTENDED_RUN_STATUSES)[number];

export const WORKER_HEALTH_STATUSES = [
  "healthy",
  "lagging",
  "stalled",
  "recovering",
  "offline",
] as const;

export type WorkerHealthStatus = (typeof WORKER_HEALTH_STATUSES)[number];

export const PROGRESS_EVENT_CATEGORIES = [
  "session_started",
  "tool_activity",
  "file_mutation",
  "test_activity",
  "checkpoint_write",
  "compaction",
  "retry",
  "failover",
  "escalation",
  "status",
] as const;

export type ProgressEventCategory = (typeof PROGRESS_EVENT_CATEGORIES)[number];

export const ESCALATION_REASONS = [
  "policy_blocked",
  "checkpoint_unavailable",
  "retry_exhausted",
  "stall_detected",
  "human_required",
  "fatal_error",
] as const;

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export interface WorkerHeartbeatRecord {
  captured_at: string | null;
  age_ms: number | null;
  progress_sequence: number | null;
  active_task_id: string | null;
  lane_id: string | null;
  tool_name: string | null;
  adapter_session_id: string | null;
}

export interface ProgressPointerRecord {
  latest_event_id: string | null;
  latest_event_at: string | null;
  sequence: number | null;
  category: ProgressEventCategory | null;
  summary: string | null;
}

export interface CheckpointReferenceRecord {
  artifact_path: string | null;
  checkpoint_id: string | null;
  captured_at: string | null;
  source_run_id: string | null;
  resumed_from_run_id: string | null;
}

export interface RecoveryAttemptRecord {
  state: "not_attempted" | "succeeded" | "failed";
  attempts: number;
  last_attempt_at: string | null;
  resumed_run_id: string | null;
  failover_run_id: string | null;
  reason: string | null;
}

export interface EscalationRecord {
  required: boolean;
  reason: EscalationReason | null;
  summary: string | null;
  triggered_at: string | null;
}

export interface UnattendedExecutionSnapshot {
  version: typeof UNATTENDED_EXECUTION_CONTRACT_VERSION;
  run_id: string;
  status: UnattendedRunStatus;
  worker_health: WorkerHealthStatus;
  durable_source: "run_record" | "artifact";
  transient_adapter_state: string | null;
  heartbeat: WorkerHeartbeatRecord;
  progress: ProgressPointerRecord;
  checkpoint: CheckpointReferenceRecord;
  recovery: RecoveryAttemptRecord;
  escalation: EscalationRecord;
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

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProgressCategory(value: unknown): ProgressEventCategory | null {
  return typeof value === "string" &&
    (PROGRESS_EVENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as ProgressEventCategory)
    : null;
}

function normalizeUnattendedStatus(value: unknown): UnattendedRunStatus {
  return typeof value === "string" &&
    (UNATTENDED_RUN_STATUSES as readonly string[]).includes(value)
    ? (value as UnattendedRunStatus)
    : "starting";
}

function normalizeWorkerHealth(value: unknown): WorkerHealthStatus {
  return typeof value === "string" &&
    (WORKER_HEALTH_STATUSES as readonly string[]).includes(value)
    ? (value as WorkerHealthStatus)
    : "healthy";
}

function normalizeEscalationReason(value: unknown): EscalationReason | null {
  return typeof value === "string" &&
    (ESCALATION_REASONS as readonly string[]).includes(value)
    ? (value as EscalationReason)
    : null;
}

function normalizeHeartbeat(value: unknown): WorkerHeartbeatRecord {
  const record = asObject(value);
  return {
    captured_at: asNullableString(record?.captured_at),
    age_ms: asNullableNumber(record?.age_ms),
    progress_sequence: asNullableNumber(record?.progress_sequence),
    active_task_id: asNullableString(record?.active_task_id),
    lane_id: asNullableString(record?.lane_id),
    tool_name: asNullableString(record?.tool_name),
    adapter_session_id: asNullableString(record?.adapter_session_id),
  };
}

function normalizeProgressPointer(value: unknown): ProgressPointerRecord {
  const record = asObject(value);
  return {
    latest_event_id: asNullableString(record?.latest_event_id),
    latest_event_at: asNullableString(record?.latest_event_at),
    sequence: asNullableNumber(record?.sequence),
    category: normalizeProgressCategory(record?.category),
    summary: asNullableString(record?.summary),
  };
}

function normalizeCheckpoint(value: unknown): CheckpointReferenceRecord {
  const record = asObject(value);
  return {
    artifact_path: asNullableString(record?.artifact_path),
    checkpoint_id: asNullableString(record?.checkpoint_id),
    captured_at: asNullableString(record?.captured_at),
    source_run_id: asNullableString(record?.source_run_id),
    resumed_from_run_id: asNullableString(record?.resumed_from_run_id),
  };
}

function normalizeRecovery(value: unknown): RecoveryAttemptRecord {
  const record = asObject(value);
  const state =
    record?.state === "not_attempted" ||
    record?.state === "succeeded" ||
    record?.state === "failed"
      ? record.state
      : "not_attempted";
  return {
    state,
    attempts: asNumber(record?.attempts, 0),
    last_attempt_at: asNullableString(record?.last_attempt_at),
    resumed_run_id: asNullableString(record?.resumed_run_id),
    failover_run_id: asNullableString(record?.failover_run_id),
    reason: asNullableString(record?.reason),
  };
}

function normalizeEscalation(value: unknown): EscalationRecord {
  const record = asObject(value);
  return {
    required: asBoolean(record?.required),
    reason: normalizeEscalationReason(record?.reason),
    summary: asNullableString(record?.summary),
    triggered_at: asNullableString(record?.triggered_at),
  };
}

export function normalizeUnattendedExecutionSnapshot(
  value: unknown
): UnattendedExecutionSnapshot | null {
  const record = asObject(value);
  if (!record) return null;

  const runId = asString(record.run_id);
  if (!runId) return null;

  const durableSource =
    record.durable_source === "artifact" ? "artifact" : "run_record";

  return {
    version: UNATTENDED_EXECUTION_CONTRACT_VERSION,
    run_id: runId,
    status: normalizeUnattendedStatus(record.status),
    worker_health: normalizeWorkerHealth(record.worker_health),
    durable_source: durableSource,
    transient_adapter_state: asNullableString(record.transient_adapter_state),
    heartbeat: normalizeHeartbeat(record.heartbeat),
    progress: normalizeProgressPointer(record.progress),
    checkpoint: normalizeCheckpoint(record.checkpoint),
    recovery: normalizeRecovery(record.recovery),
    escalation: normalizeEscalation(record.escalation),
  };
}
