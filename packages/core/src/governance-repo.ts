/**
 * packages/core/src/governance-repo.ts
 *
 * Governance repo domain model — pure types, no I/O.
 *
 * These types describe the Git-backed governance repo that serves as the
 * durable, auditable system of record for Devory's AI engineering runtime.
 *
 * Filesystem layout and protocol decisions are specified in:
 *   docs/adr/0010-governance-repo-structure.md
 *   docs/adr/0011-cloud-commit-on-behalf.md
 *   docs/adr/0012-command-channel-protocol.md
 *   docs/adr/0013-runtime-reload-apply-model.md
 */

// ---------------------------------------------------------------------------
// Governance repo binding and config
// ---------------------------------------------------------------------------

/**
 * Written to `.devory/governance.json` in each working repo.
 * Maps a working repo to its governance repo.
 */
export interface GovernanceRepoBinding {
  schema_version: "1";
  /** Absolute path to the governance repo on the local machine. */
  governance_repo_path: string;
  workspace_id: string;
  /** Absolute path of the working repo that owns this binding. */
  bound_working_repo: string;
  bound_at: string; // ISO 8601
}

/**
 * Written to `<governance-root>/.devory-governance/config.json`.
 * Marks a directory as a valid, initialized Devory governance repo.
 */
export interface GovernanceRepoConfig {
  schema_version: "1";
  workspace_id: string;
  display_name?: string;
  created_at: string; // ISO 8601
  owner_user_id?: string;
}

// ---------------------------------------------------------------------------
// Task stage
// ---------------------------------------------------------------------------

export const TASK_STAGES = [
  "backlog",
  "ready",
  "doing",
  "review",
  "blocked",
  "archived",
  "done",
] as const;

export type TaskStage = (typeof TASK_STAGES)[number];

// ---------------------------------------------------------------------------
// Governance command channel (ADR-0012)
// ---------------------------------------------------------------------------

export {
  COMMAND_OUTCOME_STATUSES,
  GOVERNANCE_COMMAND_TYPES,
  isOverrideCommand,
  isRunScopedCommand,
  isTaskScopedCommand,
} from "./command-channel.ts";
export type {
  ApproveTaskCommand,
  ApproveTaskPayload,
  AssignReviewerCommand,
  AssignReviewerPayload,
  BaseCommandFields,
  BlockTaskCommand,
  BlockTaskPayload,
  CommandOutcome,
  CommandOutcomeStatus,
  GovernanceCommandEnvelope,
  GovernanceCommandType,
  OverrideModelCommand,
  OverrideModelPayload,
  OverrideProfileCommand,
  OverrideProfilePayload,
  PauseRunCommand,
  PauseRunPayload,
  RequeueTaskCommand,
  RequeueTaskPayload,
  ResumeRunCommand,
  ResumeRunPayload,
  SendBackTaskCommand,
  SendBackTaskPayload,
} from "./command-channel.ts";

// ---------------------------------------------------------------------------
// Run lineage (written to governance repo as compliance record)
// ---------------------------------------------------------------------------

/**
 * Written to `<governance-root>/runs/<run_id>/lineage.json`.
 * Captures the exact governance state that applied during a factory run.
 */
export interface RunLineage {
  run_id: string;
  workspace_id: string;
  started_at: string; // ISO 8601
  /**
   * Git commit SHA of the governance repo at run start.
   * Proves which doctrine version, profiles, and standards applied.
   * Must never be null — fail loudly if this cannot be captured.
   */
  governance_sha: string;
  /**
   * Git commit SHA of the doctrine directory at run start.
   * Derived from the governance repo HEAD; may differ from governance_sha
   * if doctrine was last changed in an earlier commit.
   */
  doctrine_snapshot_sha: string;
  profile_id: string;
  /** Full copy of the EngineeringProfile at run start — not just the ID. */
  profile_snapshot: Record<string, unknown>;
  model_selected: string;
  /** Human-readable explanation of why this model was selected. */
  model_selection_reason: string;
  task_ids: string[];
  override_applied: boolean;
  /** command_id of the override command that was applied, if any. */
  override_command_id?: string;
  completed_at?: string; // ISO 8601
  final_status?: string;
  tasks_completed?: number;
  tasks_failed?: number;
  /** command_ids of all override commands applied during the run. */
  override_commands_applied?: string[];
}

// ---------------------------------------------------------------------------
// Audit events (written to governance repo as compliance record)
// ---------------------------------------------------------------------------

export const AUDIT_ACTOR_TYPES = [
  "runtime",
  "cloud-user",
  "cli-user",
  "system",
] as const;

export type AuditActor = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_EVENT_TYPES = [
  "task-moved",
  "command-accepted",
  "command-rejected",
  "override-applied",
  "override-rejected",
  "doctrine-edited",
  "governance-reload-applied",
  "run-started",
  "run-completed",
  "conflict-detected",
  "conflict-resolved",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Written to `<governance-root>/audit/<YYYY-MM>/<event_id>.json`.
 * One file per event — never appended to or updated after initial write.
 * This is the compliance audit trail.
 */
export interface AuditEvent {
  event_id: string; // UUID v4
  event_type: AuditEventType | string; // string allows extension without schema change
  occurred_at: string; // ISO 8601
  actor: AuditActor;
  actor_user_id?: string;
  workspace_id: string;
  subject_type: string; // e.g. "task", "doctrine", "run", "command"
  subject_id: string;
  change_summary: string; // human-readable one-liner
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Commit attribution (ADR-0011)
// ---------------------------------------------------------------------------

export const GOVERNANCE_COMMIT_SOURCES = [
  "cloud-editor",
  "runtime",
  "cli-user",
  "migration-tool",
] as const;

export type GovernanceCommitSource = (typeof GOVERNANCE_COMMIT_SOURCES)[number];

export const GOVERNANCE_COMMIT_TYPES = [
  "task-edit",
  "task-move",
  "doctrine-edit",
  "standards-edit",
  "profile-write",
  "run-manifest",
  "run-lineage",
  "command-outcome",
  "audit-event",
  "migration",
] as const;

export type GovernanceCommitType = (typeof GOVERNANCE_COMMIT_TYPES)[number];

/** Attribution fields for a governance repo commit. */
export interface CommitAttribution {
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
}
