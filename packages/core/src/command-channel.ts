/**
 * packages/core/src/command-channel.ts
 *
 * Shared governance command channel types for cloud issuance, transport,
 * runtime handling, and durable command outcome records.
 *
 * Task: factory-371
 */

export const GOVERNANCE_COMMAND_TYPES = [
  "pause-run",
  "resume-run",
  "requeue-task",
  "approve-task",
  "send-back-task",
  "block-task",
  "assign-reviewer",
  "override-model",
  "override-profile",
] as const;

export type GovernanceCommandType = (typeof GOVERNANCE_COMMAND_TYPES)[number];

export interface BaseCommandFields {
  command_id: string;
  issued_by: string;
  issued_at: string;
  workspace_id: string;
  target_run_id?: string;
  target_task_id?: string;
  governance_repo_ref?: string;
  expires_at: string;
}

export type PauseRunPayload = Record<string, never>;
export type ResumeRunPayload = Record<string, never>;

export interface RequeueTaskPayload {
  task_id: string;
  reason?: string;
}

export interface ApproveTaskPayload {
  task_id: string;
  reviewer_note?: string;
}

export interface SendBackTaskPayload {
  task_id: string;
  reason: string;
}

export interface BlockTaskPayload {
  task_id: string;
  blocker_description: string;
}

export interface AssignReviewerPayload {
  task_id: string;
  reviewer_user_id: string;
}

export interface OverrideModelPayload {
  task_id: string;
  requested_model: string;
  justification: string;
}

export interface OverrideProfilePayload {
  requested_profile_id: string;
  justification: string;
}

export type PauseRunCommand =
  { command_type: "pause-run"; payload: PauseRunPayload } & BaseCommandFields;
export type ResumeRunCommand =
  { command_type: "resume-run"; payload: ResumeRunPayload } & BaseCommandFields;
export type RequeueTaskCommand =
  { command_type: "requeue-task"; payload: RequeueTaskPayload } & BaseCommandFields;
export type ApproveTaskCommand =
  { command_type: "approve-task"; payload: ApproveTaskPayload } & BaseCommandFields;
export type SendBackTaskCommand =
  { command_type: "send-back-task"; payload: SendBackTaskPayload } & BaseCommandFields;
export type BlockTaskCommand =
  { command_type: "block-task"; payload: BlockTaskPayload } & BaseCommandFields;
export type AssignReviewerCommand =
  { command_type: "assign-reviewer"; payload: AssignReviewerPayload } & BaseCommandFields;
export type OverrideModelCommand =
  { command_type: "override-model"; payload: OverrideModelPayload } & BaseCommandFields;
export type OverrideProfileCommand =
  { command_type: "override-profile"; payload: OverrideProfilePayload } & BaseCommandFields;

export type GovernanceCommandEnvelope =
  | PauseRunCommand
  | ResumeRunCommand
  | RequeueTaskCommand
  | ApproveTaskCommand
  | SendBackTaskCommand
  | BlockTaskCommand
  | AssignReviewerCommand
  | OverrideModelCommand
  | OverrideProfileCommand;

export const COMMAND_OUTCOME_STATUSES = [
  "accepted",
  "rejected",
  "deferred",
] as const;

export type CommandOutcomeStatus = (typeof COMMAND_OUTCOME_STATUSES)[number];

export interface CommandOutcome {
  command_id: string;
  command_type: GovernanceCommandType;
  issued_by: string;
  workspace_id: string;
  target_task_id?: string;
  target_run_id?: string;
  status: CommandOutcomeStatus;
  ack_at: string;
  applied_at?: string;
  rejection_reason?: string;
  deferred_reason?: string;
  runtime_version?: string;
  metadata?: Record<string, unknown>;
}

export interface GovernanceCommandValidationResult {
  ok: boolean;
  errors: string[];
  command?: GovernanceCommandEnvelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function hasStringField(
  payload: Record<string, unknown>,
  field: string,
  errors: string[],
): payload is Record<string, string> {
  const value = payload[field];
  if (typeof value === "string" && value.trim() !== "") {
    return true;
  }
  errors.push(`payload.${field} must be a non-empty string`);
  return false;
}

function validatePayload(
  commandType: GovernanceCommandType,
  payload: Record<string, unknown>,
  errors: string[],
): void {
  switch (commandType) {
    case "pause-run":
    case "resume-run":
      return;
    case "requeue-task":
      hasStringField(payload, "task_id", errors);
      return;
    case "approve-task":
      hasStringField(payload, "task_id", errors);
      return;
    case "send-back-task":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "reason", errors);
      return;
    case "block-task":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "blocker_description", errors);
      return;
    case "assign-reviewer":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "reviewer_user_id", errors);
      return;
    case "override-model":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "requested_model", errors);
      hasStringField(payload, "justification", errors);
      return;
    case "override-profile":
      hasStringField(payload, "requested_profile_id", errors);
      hasStringField(payload, "justification", errors);
      return;
  }
}

export function validateGovernanceCommandEnvelope(
  value: unknown,
): GovernanceCommandValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["command must be an object"] };
  }

  if (typeof value.command_id !== "string" || value.command_id.trim() === "") {
    errors.push("command_id must be a non-empty string");
  }
  if (typeof value.issued_by !== "string" || value.issued_by.trim() === "") {
    errors.push("issued_by must be a non-empty string");
  }
  if (!isIsoTimestamp(value.issued_at)) {
    errors.push("issued_at must be a valid ISO timestamp");
  }
  if (typeof value.workspace_id !== "string" || value.workspace_id.trim() === "") {
    errors.push("workspace_id must be a non-empty string");
  }
  if (!isIsoTimestamp(value.expires_at)) {
    errors.push("expires_at must be a valid ISO timestamp");
  }
  if (value.target_run_id !== undefined && typeof value.target_run_id !== "string") {
    errors.push("target_run_id must be a string when present");
  }
  if (value.target_task_id !== undefined && typeof value.target_task_id !== "string") {
    errors.push("target_task_id must be a string when present");
  }
  if (value.governance_repo_ref !== undefined && typeof value.governance_repo_ref !== "string") {
    errors.push("governance_repo_ref must be a string when present");
  }

  const commandType = value.command_type;
  if (
    typeof commandType !== "string" ||
    !(GOVERNANCE_COMMAND_TYPES as readonly string[]).includes(commandType)
  ) {
    errors.push("command_type must be one of the supported governance command types");
  }

  if (!isRecord(value.payload)) {
    errors.push("payload must be an object");
  } else if (typeof commandType === "string" &&
    (GOVERNANCE_COMMAND_TYPES as readonly string[]).includes(commandType)) {
    validatePayload(commandType as GovernanceCommandType, value.payload, errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    command: value as unknown as GovernanceCommandEnvelope,
  };
}

export function parseGovernanceCommandEnvelope(value: unknown): GovernanceCommandEnvelope {
  const result = validateGovernanceCommandEnvelope(value);
  if (!result.ok || !result.command) {
    throw new Error(`invalid governance command envelope: ${result.errors.join("; ")}`);
  }
  return result.command;
}

export function isOverrideCommand(
  cmd: GovernanceCommandEnvelope,
): cmd is OverrideModelCommand | OverrideProfileCommand {
  return cmd.command_type === "override-model" || cmd.command_type === "override-profile";
}

export function isTaskScopedCommand(
  cmd: GovernanceCommandEnvelope,
): cmd is
  | RequeueTaskCommand
  | ApproveTaskCommand
  | SendBackTaskCommand
  | BlockTaskCommand
  | AssignReviewerCommand
  | OverrideModelCommand {
  return (
    cmd.command_type === "requeue-task" ||
    cmd.command_type === "approve-task" ||
    cmd.command_type === "send-back-task" ||
    cmd.command_type === "block-task" ||
    cmd.command_type === "assign-reviewer" ||
    cmd.command_type === "override-model"
  );
}

export function isRunScopedCommand(
  cmd: GovernanceCommandEnvelope,
): cmd is PauseRunCommand | ResumeRunCommand | OverrideProfileCommand {
  return (
    cmd.command_type === "pause-run" ||
    cmd.command_type === "resume-run" ||
    cmd.command_type === "override-profile"
  );
}
