import { RESUMABLE_RUN_STATUSES, type ResumableRunStatus } from "./run-ledger.ts";

export const REVIEW_CONTROL_CONTRACT_VERSION =
  "review-control-surface-v1" as const;

export const TASK_REVIEW_ACTIONS = ["approve", "send-back", "block"] as const;
export type TaskReviewAction = (typeof TASK_REVIEW_ACTIONS)[number];

export const REVIEW_CONTROL_ACTIONS = [
  ...TASK_REVIEW_ACTIONS,
  "resume-run",
] as const;
export type ReviewControlAction = (typeof REVIEW_CONTROL_ACTIONS)[number];

export const REVIEW_QUEUE_ITEM_KINDS = [
  "task-review",
  "run-attention",
  "task-triage",
] as const;
export type ReviewQueueItemKind = (typeof REVIEW_QUEUE_ITEM_KINDS)[number];

export const REVIEW_QUEUE_TASK_STAGES = ["review"] as const;
export const REVIEW_QUEUE_TRIAGE_STAGES = ["blocked"] as const;
export const REVIEW_QUEUE_RUN_STATUSES = RESUMABLE_RUN_STATUSES;

export const TASK_REVIEW_ACTION_STAGE_MAP: Record<
  TaskReviewAction,
  "done" | "doing" | "blocked"
> = {
  approve: "done",
  "send-back": "doing",
  block: "blocked",
};

export interface ReviewQueueTaskSource {
  authority: "tasks-folder";
  stage: "review" | "blocked";
}

export interface ReviewQueueRunSource {
  authority: "run-ledger";
  status: ResumableRunStatus;
}

export interface ReviewQueueBaseItem {
  version: typeof REVIEW_CONTROL_CONTRACT_VERSION;
  item_id: string;
  kind: ReviewQueueItemKind;
  title: string;
  summary: string;
  task_id: string | null;
  run_id: string | null;
  attention_state: string;
  supported_actions: readonly ReviewControlAction[];
}

export interface TaskReviewQueueItem extends ReviewQueueBaseItem {
  kind: "task-review";
  task_id: string;
  run_id: string | null;
  attention_state: "review";
  supported_actions: readonly TaskReviewAction[];
  source: ReviewQueueTaskSource;
}

export interface RunAttentionQueueItem extends ReviewQueueBaseItem {
  kind: "run-attention";
  task_id: string | null;
  run_id: string;
  attention_state: ResumableRunStatus;
  supported_actions: readonly ["resume-run"];
  source: ReviewQueueRunSource;
}

export interface TaskTriageQueueItem extends ReviewQueueBaseItem {
  kind: "task-triage";
  task_id: string;
  run_id: string | null;
  attention_state: "blocked";
  supported_actions: readonly [];
  source: ReviewQueueTaskSource;
}

export type ReviewQueueItem =
  | TaskReviewQueueItem
  | RunAttentionQueueItem
  | TaskTriageQueueItem;

export interface ReviewControlMechanism {
  action: ReviewControlAction;
  supported_item_kinds: readonly ReviewQueueItemKind[];
  workflow_mechanism:
    | "task-review-action"
    | "run-resume"
    | "question-answer-resume";
  api_route: string | null;
  cli_equivalent: string | null;
  resulting_state: string;
  audit_artifacts: readonly string[];
}

export const REVIEW_CONTROL_MECHANISMS: Record<
  ReviewControlAction,
  ReviewControlMechanism
> = {
  approve: {
    action: "approve",
    supported_item_kinds: ["task-review"],
    workflow_mechanism: "task-review-action",
    api_route: "/api/task/review-action",
    cli_equivalent: "devory task move <task> --to done",
    resulting_state: "task stage review -> done",
    audit_artifacts: ["artifacts/runs/*-review.md", "runs/<run-id>.json"],
  },
  "send-back": {
    action: "send-back",
    supported_item_kinds: ["task-review"],
    workflow_mechanism: "task-review-action",
    api_route: "/api/task/review-action",
    cli_equivalent: "devory task move <task> --to doing",
    resulting_state: "task stage review -> doing",
    audit_artifacts: ["artifacts/runs/*-review.md", "runs/<run-id>.json"],
  },
  block: {
    action: "block",
    supported_item_kinds: ["task-review"],
    workflow_mechanism: "task-review-action",
    api_route: "/api/task/review-action",
    cli_equivalent: "devory task move <task> --to blocked",
    resulting_state: "task stage review -> blocked",
    audit_artifacts: ["artifacts/runs/*-review.md", "runs/<run-id>.json"],
  },
  "resume-run": {
    action: "resume-run",
    supported_item_kinds: ["run-attention"],
    workflow_mechanism: "run-resume",
    api_route: "/api/run/resume",
    cli_equivalent: "devory run --resume <run-id>",
    resulting_state: "run status failed|paused_for_review -> running",
    audit_artifacts: [
      "runs/<run-id>.json",
      "artifacts/execution/<task>/checkpoints/*.json",
      "artifacts/runs/*-resume.md when mediated by a human question",
    ],
  },
};

export const REVIEW_SUPPORTED_ACTIONS_BY_KIND: Record<
  ReviewQueueItemKind,
  readonly ReviewControlAction[]
> = {
  "task-review": TASK_REVIEW_ACTIONS,
  "run-attention": ["resume-run"],
  "task-triage": [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asActionList(value: unknown): ReviewControlAction[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is ReviewControlAction =>
          typeof entry === "string" &&
          (REVIEW_CONTROL_ACTIONS as readonly string[]).includes(entry)
      )
    : [];
}

function normalizeTaskSource(
  value: unknown,
  expectedStage: "review" | "blocked"
): ReviewQueueTaskSource | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.authority !== "tasks-folder") return null;
  if (record.stage !== expectedStage) return null;
  return { authority: "tasks-folder", stage: expectedStage };
}

function normalizeRunSource(value: unknown): ReviewQueueRunSource | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.authority !== "run-ledger") return null;
  if (
    typeof record.status !== "string" ||
    !(REVIEW_QUEUE_RUN_STATUSES as readonly string[]).includes(record.status)
  ) {
    return null;
  }
  return {
    authority: "run-ledger",
    status: record.status as ResumableRunStatus,
  };
}

export function getSupportedReviewActions(
  kind: ReviewQueueItemKind
): readonly ReviewControlAction[] {
  return REVIEW_SUPPORTED_ACTIONS_BY_KIND[kind];
}

export function buildTaskReviewQueueItem(input: {
  task_id: string;
  title: string;
  summary: string;
  run_id?: string | null;
}): TaskReviewQueueItem {
  return {
    version: REVIEW_CONTROL_CONTRACT_VERSION,
    item_id: `task-review:${input.task_id}`,
    kind: "task-review",
    title: input.title,
    summary: input.summary,
    task_id: input.task_id,
    run_id: input.run_id ?? null,
    attention_state: "review",
    supported_actions: TASK_REVIEW_ACTIONS,
    source: {
      authority: "tasks-folder",
      stage: "review",
    },
  };
}

export function buildRunAttentionQueueItem(input: {
  run_id: string;
  title: string;
  summary: string;
  status: ResumableRunStatus;
  task_id?: string | null;
}): RunAttentionQueueItem {
  return {
    version: REVIEW_CONTROL_CONTRACT_VERSION,
    item_id: `run-attention:${input.run_id}`,
    kind: "run-attention",
    title: input.title,
    summary: input.summary,
    task_id: input.task_id ?? null,
    run_id: input.run_id,
    attention_state: input.status,
    supported_actions: ["resume-run"],
    source: {
      authority: "run-ledger",
      status: input.status,
    },
  };
}

export function buildTaskTriageQueueItem(input: {
  task_id: string;
  title: string;
  summary: string;
  run_id?: string | null;
}): TaskTriageQueueItem {
  return {
    version: REVIEW_CONTROL_CONTRACT_VERSION,
    item_id: `task-triage:${input.task_id}`,
    kind: "task-triage",
    title: input.title,
    summary: input.summary,
    task_id: input.task_id,
    run_id: input.run_id ?? null,
    attention_state: "blocked",
    supported_actions: [],
    source: {
      authority: "tasks-folder",
      stage: "blocked",
    },
  };
}

export function normalizeReviewQueueItem(value: unknown): ReviewQueueItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const itemId = asString(record.item_id);
  const kind = asString(record.kind);
  const title = asString(record.title);
  const summary = asString(record.summary);
  const attentionState = asString(record.attention_state);

  if (!itemId || !kind || !title || !summary || !attentionState) {
    return null;
  }

  if (kind === "task-review") {
    const taskId = asString(record.task_id);
    const source = normalizeTaskSource(record.source, "review");
    const supportedActions = asActionList(record.supported_actions);
    if (
      !taskId ||
      attentionState !== "review" ||
      !source ||
      supportedActions.length !== TASK_REVIEW_ACTIONS.length
    ) {
      return null;
    }
    return {
      version: REVIEW_CONTROL_CONTRACT_VERSION,
      item_id: itemId,
      kind,
      title,
      summary,
      task_id: taskId,
      run_id: asString(record.run_id),
      attention_state: "review",
      supported_actions: TASK_REVIEW_ACTIONS,
      source,
    };
  }

  if (kind === "run-attention") {
    const runId = asString(record.run_id);
    const source = normalizeRunSource(record.source);
    const supportedActions = asActionList(record.supported_actions);
    if (
      !runId ||
      !source ||
      attentionState !== source.status ||
      supportedActions.length !== 1 ||
      supportedActions[0] !== "resume-run"
    ) {
      return null;
    }
    return {
      version: REVIEW_CONTROL_CONTRACT_VERSION,
      item_id: itemId,
      kind,
      title,
      summary,
      task_id: asString(record.task_id),
      run_id: runId,
      attention_state: source.status,
      supported_actions: ["resume-run"],
      source,
    };
  }

  if (kind === "task-triage") {
    const taskId = asString(record.task_id);
    const source = normalizeTaskSource(record.source, "blocked");
    const supportedActions = asActionList(record.supported_actions);
    if (
      !taskId ||
      attentionState !== "blocked" ||
      !source ||
      supportedActions.length !== 0
    ) {
      return null;
    }
    return {
      version: REVIEW_CONTROL_CONTRACT_VERSION,
      item_id: itemId,
      kind,
      title,
      summary,
      task_id: taskId,
      run_id: asString(record.run_id),
      attention_state: "blocked",
      supported_actions: [],
      source,
    };
  }

  return null;
}
