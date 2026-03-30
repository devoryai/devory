import type { ExecutionPolicyManifest } from "./execution-policy.ts";

export const UNATTENDED_CHECKPOINT_VERSION =
  "unattended-checkpoint-v1" as const;

export const UNATTENDED_CHECKPOINT_TRIGGERS = [
  "recovery_sensitive_transition",
  "significant_progress",
  "retry_boundary",
  "compaction_boundary",
] as const;

export type UnattendedCheckpointTrigger =
  (typeof UNATTENDED_CHECKPOINT_TRIGGERS)[number];

export interface UnattendedCheckpointPolicySnapshot {
  policy: ExecutionPolicyManifest | null;
  injection_source: "agent-context" | "checkpoint-writer";
  applied_layers: string[];
  workspace_config_path: string | null;
}

export interface UnattendedCheckpointArtifactReferences {
  heartbeat_snapshot: string | null;
  task_snapshot: string | null;
  execution_plan: string | null;
  staging_manifest: string | null;
  agent_context: string | null;
  routing_manifest: string | null;
  execution_result: string | null;
  retry_context: string | null;
  review_package: string | null;
  changed_files: string | null;
}

export interface UnattendedCheckpointArtifact {
  version: typeof UNATTENDED_CHECKPOINT_VERSION;
  checkpoint_id: string;
  run_id: string;
  task_id: string | null;
  created_at: string;
  trigger: UnattendedCheckpointTrigger;
  current_phase: string;
  current_adapter: string | null;
  current_attempt: number | null;
  recent_progress_summary: string | null;
  pending_actions: string[];
  policy_snapshot: UnattendedCheckpointPolicySnapshot;
  artifact_references: UnattendedCheckpointArtifactReferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function normalizeTrigger(value: unknown): UnattendedCheckpointTrigger {
  return typeof value === "string" &&
    (UNATTENDED_CHECKPOINT_TRIGGERS as readonly string[]).includes(value)
    ? (value as UnattendedCheckpointTrigger)
    : "significant_progress";
}

function normalizePolicySnapshot(value: unknown): UnattendedCheckpointPolicySnapshot {
  const record = isRecord(value) ? value : {};
  return {
    policy: isRecord(record.policy)
      ? (record.policy as unknown as ExecutionPolicyManifest)
      : null,
    injection_source:
      record.injection_source === "agent-context"
        ? "agent-context"
        : "checkpoint-writer",
    applied_layers: asStringArray(record.applied_layers),
    workspace_config_path: asString(record.workspace_config_path),
  };
}

function normalizeArtifactReferences(
  value: unknown
): UnattendedCheckpointArtifactReferences {
  const record = isRecord(value) ? value : {};
  return {
    heartbeat_snapshot: asString(record.heartbeat_snapshot),
    task_snapshot: asString(record.task_snapshot),
    execution_plan: asString(record.execution_plan),
    staging_manifest: asString(record.staging_manifest),
    agent_context: asString(record.agent_context),
    routing_manifest: asString(record.routing_manifest),
    execution_result: asString(record.execution_result),
    retry_context: asString(record.retry_context),
    review_package: asString(record.review_package),
    changed_files: asString(record.changed_files),
  };
}

export function normalizeUnattendedCheckpointArtifact(
  value: unknown
): UnattendedCheckpointArtifact | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const checkpointId = asString(record.checkpoint_id);
  const runId = asString(record.run_id);
  const createdAt = asString(record.created_at);
  const currentPhase = asString(record.current_phase);
  if (!checkpointId || !runId || !createdAt || !currentPhase) return null;

  return {
    version: UNATTENDED_CHECKPOINT_VERSION,
    checkpoint_id: checkpointId,
    run_id: runId,
    task_id: asString(record.task_id),
    created_at: createdAt,
    trigger: normalizeTrigger(record.trigger),
    current_phase: currentPhase,
    current_adapter: asString(record.current_adapter),
    current_attempt: asNumber(record.current_attempt),
    recent_progress_summary: asString(record.recent_progress_summary),
    pending_actions: asStringArray(record.pending_actions),
    policy_snapshot: normalizePolicySnapshot(record.policy_snapshot),
    artifact_references: normalizeArtifactReferences(record.artifact_references),
  };
}
