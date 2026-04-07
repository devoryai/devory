/**
 * packages/cli/src/lib/workspace.ts
 *
 * Shared workspace mutation APIs for task creation, lifecycle movement,
 * and review actions.
 *
 * This module is the authoritative implementation of task lifecycle operations.
 * Both the CLI commands and the VS Code extension call these functions directly
 * — no spawning of tsx scripts or child processes.
 *
 * The public functions are:
 *   createTask()   — create a new task skeleton in tasks/backlog/
 *   moveTask()     — validate and move a task to a new lifecycle stage
 *
 * Pure helpers (checkTransition, buildTaskSkeleton, buildTaskFilename,
 * rewriteStatus) are also exported for testing.
 */

import * as fs from "fs";
import * as path from "path";
import {
  TASK_REVIEW_ACTIONS,
  TASK_REVIEW_ACTION_STAGE_MAP,
  parseFrontmatter,
  validateTask,
  type TaskMeta,
} from "@devory/core";

// ---------------------------------------------------------------------------
// Lifecycle constants
// (Kept here so this module is self-contained and editor-agnostic)
// ---------------------------------------------------------------------------

export const LIFECYCLE_STAGES = [
  "backlog",
  "ready",
  "doing",
  "review",
  "blocked",
  "archived",
  "done",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Maps each lifecycle stage to the tasks/ subdirectory that holds it. */
export const LIFECYCLE_DIR_MAP: Record<LifecycleStage, string> = {
  backlog: "tasks/backlog",
  ready: "tasks/ready",
  doing: "tasks/doing",
  review: "tasks/review",
  blocked: "tasks/blocked",
  archived: "tasks/archived",
  done: "tasks/done",
};

// ---------------------------------------------------------------------------
// Status rewriter (inlined from workers/lib/task-utils.ts)
// ---------------------------------------------------------------------------

/** Patch only the `status:` line inside the YAML frontmatter block. */
export function rewriteStatus(content: string, newStatus: string): string {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch) return content;
  const updatedFm = fmMatch[1].replace(/^(status:\s*).*$/m, `$1${newStatus}`);
  return content.replace(fmMatch[1], updatedFm);
}

// ---------------------------------------------------------------------------
// Transition log renderer (inlined from workers/lib/workflow-helpers.ts)
// ---------------------------------------------------------------------------

interface TransitionLogOpts {
  taskId: string;
  filename: string;
  fromStatus: LifecycleStage;
  toStatus: LifecycleStage;
  timestamp: string;
  validationErrors: string[];
}

function renderTransitionLog(opts: TransitionLogOpts): string {
  const { taskId, filename, fromStatus, toStatus, timestamp, validationErrors } = opts;
  const success = validationErrors.length === 0;
  const resultLabel = success ? "moved" : "validation-failed";

  const lines: string[] = [
    "---",
    `task_id: ${taskId}`,
    `source_file: ${filename}`,
    `timestamp: ${timestamp}`,
    `from_status: ${fromStatus}`,
    `to_status: ${toStatus}`,
    `result: ${resultLabel}`,
    "---",
    "",
    `# Transition Log — ${taskId}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Task ID | ${taskId} |`,
    `| Timestamp | ${timestamp} |`,
    `| From | \`${fromStatus}\` |`,
    `| To | \`${toStatus}\` |`,
    `| Result | ${resultLabel} |`,
    "",
  ];

  if (!success) {
    lines.push(
      "## Validation Errors",
      "",
      "Task was **not** moved. Fix the errors below and retry.",
      "",
      ...validationErrors.map((e) => `- ${e}`)
    );
  } else {
    lines.push(
      "## Transition Complete",
      "",
      `Task \`${taskId}\` moved from \`${fromStatus}\` to \`${toStatus}\`.`,
      "",
    );
  }

  return lines.join("\n") + "\n";
}

export const VALID_TRANSITIONS = {
  backlog: ["ready", "blocked", "archived"],
  ready: ["doing", "blocked", "backlog", "archived"],
  doing: ["review", "blocked", "ready", "archived"],
  review: ["done", "doing", "blocked", "archived"],
  blocked: ["backlog", "ready", "archived"],
  archived: ["backlog", "ready"],
  done: [],
} as const satisfies Record<LifecycleStage, readonly LifecycleStage[]>;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

export function checkTransition(from: string, to: string): TransitionCheck {
  if (!(LIFECYCLE_STAGES as readonly string[]).includes(from)) {
    return { allowed: false, reason: `Unknown stage: "${from}"` };
  }
  if (!(LIFECYCLE_STAGES as readonly string[]).includes(to)) {
    return { allowed: false, reason: `Unknown target stage: "${to}"` };
  }
  const allowed = (VALID_TRANSITIONS as Record<string, readonly string[]>)[from]?.includes(to) ?? false;
  if (!allowed) {
    return { allowed: false, reason: `Transition from "${from}" to "${to}" is not allowed` };
  }
  return { allowed: true };
}

function isStage(value: string): value is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

/** Derive a filesystem-safe filename from a task id and title. */
export function buildTaskFilename(id: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${id}-${slug}.md`;
}

/** Generate markdown content for a new task skeleton in `backlog` status. */
export function buildTaskSkeleton(opts: {
  id: string;
  title: string;
  project: string;
  repo?: string;
  branch?: string;
  type?: string;
  priority?: string;
  agent?: string;
  lane?: string;
  repo_area?: string;
}): string {
  const {
    id,
    title,
    project,
    repo = ".",
    branch = `task/${id}`,
    type = "feature",
    priority = "medium",
    agent = "fullstack-builder",
    lane,
    repo_area,
  } = opts;

  const optionalLines: string[] = [];
  if (lane) optionalLines.push(`lane: ${lane}`);
  if (repo_area) optionalLines.push(`repo_area: ${repo_area}`);

  return [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    `project: ${project}`,
    `repo: ${repo}`,
    `branch: ${branch}`,
    `type: ${type}`,
    `priority: ${priority}`,
    `status: backlog`,
    `agent: ${agent}`,
    ...optionalLines,
    `depends_on: []`,
    `files_likely_affected: []`,
    `verification:`,
    `  - npm test`,
    "---",
    "",
    "## Goal",
    "",
    "Describe the business outcome in plain English. What problem does this solve and why does it matter? One to three sentences.",
    "",
    "## Context",
    "",
    "Relevant background, constraints, and assumptions the agent needs to know.",
    "",
    "## Acceptance Criteria",
    "",
    "- Criterion 1 — specific, verifiable outcome",
    "",
    "## Expected Artifacts",
    "",
    "- List files that will be created or modified",
    "",
    "## Failure Conditions",
    "",
    "- What would cause this task to be rejected?",
    "",
    "## Reviewer Checklist",
    "",
    "- [ ] All acceptance criteria satisfied",
    "- [ ] Build and test output clean",
    "",
  ].join("\n");
}

/** Return error messages for any missing required frontmatter fields. */
export function validateRequiredFields(meta: Partial<TaskMeta>, expectedStatus = String(meta.status ?? "")): string[] {
  return validateTask(meta, expectedStatus).errors;
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

export interface CreateTaskArgs {
  id: string;
  title: string;
  project: string;
  repo?: string;
  branch?: string;
  type?: string;
  priority?: string;
  agent?: string;
  lane?: string;
  repoArea?: string;
}

export type CreateTaskResult =
  | { ok: true; filePath: string; content: string }
  | { ok: false; error: string };

/**
 * Create a new task skeleton file in `{factoryRoot}/tasks/backlog/`.
 *
 * Returns `{ ok: true, filePath, content }` on success.
 * Returns `{ ok: false, error }` if the file already exists or a write fails.
 * When `dryRun` is true, returns success with the content but writes nothing.
 */
export function createTask(
  args: CreateTaskArgs,
  options: { factoryRoot: string; dryRun?: boolean }
): CreateTaskResult {
  const { factoryRoot, dryRun = false } = options;
  const content = buildTaskSkeleton({
    ...args,
    repo_area: args.repoArea,
  });
  const filename = buildTaskFilename(args.id, args.title);
  const targetDir = path.join(factoryRoot, "tasks", "backlog");
  const filePath = path.join(targetDir, filename);

  if (!dryRun) {
    if (fs.existsSync(filePath)) {
      return {
        ok: false,
        error: `File already exists: ${path.relative(factoryRoot, filePath)}. Choose a different --id or remove the existing file.`,
      };
    }
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
    } catch (err) {
      return { ok: false, error: `Write failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return { ok: true, filePath, content };
}

// ---------------------------------------------------------------------------
// moveTask
// ---------------------------------------------------------------------------

export interface MoveTaskArgs {
  /** Path to the task file — absolute or relative to factoryRoot. */
  task: string;
  /** Target lifecycle stage. */
  to: string;
}

export type MoveTaskResult =
  | {
      ok: true;
      fromPath: string;
      toPath: string;
      fromStatus: string;
      toStatus: string;
      artifactPath: string | null;
    }
  | { ok: false; error: string; validationErrors?: string[] };

/**
 * Validate and move a task file to a new lifecycle stage.
 *
 * Steps:
 *  1. Read and parse the task file
 *  2. Check the transition is allowed
 *  3. Validate required frontmatter fields
 *  4. Rewrite the status field in-place
 *  5. Move the file to the correct tasks/ subdirectory
 *  6. Write a transition artifact to runs/
 *
 * Returns `{ ok: true, fromPath, toPath }` on success.
 * Returns `{ ok: false, error, validationErrors? }` on any failure.
 */
export function moveTask(
  args: MoveTaskArgs,
  options: { factoryRoot: string }
): MoveTaskResult {
  const { factoryRoot } = options;
  const resolvedTask = path.isAbsolute(args.task)
    ? args.task
    : path.resolve(factoryRoot, args.task);

  if (!fs.existsSync(resolvedTask)) {
    return { ok: false, error: `File not found: ${resolvedTask}` };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedTask, "utf-8");
  } catch (err) {
    return { ok: false, error: `Cannot read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { meta } = parseFrontmatter(raw);
  const fromStatus = (meta.status ?? "") as string;
  const taskId = (meta.id ?? path.basename(resolvedTask, ".md")) as string;

  const transition = checkTransition(fromStatus, args.to);
  if (!transition.allowed) {
    return { ok: false, error: transition.reason! };
  }

  const validation = validateTask(meta, fromStatus);
  if (!validation.valid) {
    const artifactPath = _writeTransitionArtifact(factoryRoot, {
      taskId,
      filename: path.basename(resolvedTask),
      fromStatus,
      toStatus: args.to,
      validationErrors: validation.errors,
    });
    void artifactPath;
    return { ok: false, error: "Validation failed", validationErrors: validation.errors };
  }

  if (!isStage(args.to)) {
    return { ok: false, error: `Unknown target stage: "${args.to}"` };
  }

  const updated = rewriteStatus(raw, args.to);
  const destDir = path.join(factoryRoot, LIFECYCLE_DIR_MAP[args.to as LifecycleStage]);
  const filename = path.basename(resolvedTask);
  const destPath = path.join(destDir, filename);

  if (fs.existsSync(destPath) && destPath !== resolvedTask) {
    return {
      ok: false,
      error: `Destination already exists: ${path.relative(factoryRoot, destPath)}`,
    };
  }

  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(resolvedTask, updated, "utf-8");
    if (destPath !== resolvedTask) {
      fs.renameSync(resolvedTask, destPath);
    }
  } catch (err) {
    return { ok: false, error: `Move failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Write transition artifact to runs/
  const artifactPath = _writeTransitionArtifact(factoryRoot, {
    taskId,
    filename,
    fromStatus,
    toStatus: args.to,
    validationErrors: [],
  });

  return {
    ok: true,
    fromPath: resolvedTask,
    toPath: destPath,
    fromStatus,
    toStatus: args.to,
    artifactPath,
  };
}

// ---------------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------------

export const REVIEW_ACTIONS = TASK_REVIEW_ACTIONS;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const ACTION_STAGE_MAP = TASK_REVIEW_ACTION_STAGE_MAP;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateReviewAction(
  action: string,
  reason: string
): ValidationResult {
  if (!REVIEW_ACTIONS.includes(action as ReviewAction)) {
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${REVIEW_ACTIONS.join(", ")}`,
    };
  }
  if (action === "block" && !reason.trim()) {
    return {
      valid: false,
      error: "reason is required for block action",
    };
  }
  return { valid: true };
}

export function reviewActionToStage(action: ReviewAction): LifecycleStage {
  return TASK_REVIEW_ACTION_STAGE_MAP[action];
}

export interface ReviewArtifactOpts {
  taskId: string;
  action: ReviewAction;
  fromStage: string;
  toStage: string;
  timestamp: string;
  runId?: string | null;
  routingDecisionId?: string | null;
  reason: string;
}

export function buildReviewArtifact(opts: ReviewArtifactOpts): string {
  const { taskId, action, fromStage, toStage, timestamp, reason } = opts;

  const lines: string[] = [
    "---",
    `task_id: ${taskId}`,
    `action: ${action}`,
    `from_status: ${fromStage}`,
    `to_status: ${toStage}`,
    `timestamp: ${timestamp}`,
    `run_id: ${opts.runId ?? ""}`,
    `routing_decision_id: ${opts.routingDecisionId ?? ""}`,
    reason.trim() ? `reason: ${reason.trim()}` : "reason:",
    "---",
    "",
    `# Review Decision — ${taskId}`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Task ID | ${taskId} |`,
    `| Action | **${action}** |`,
    `| From | \`${fromStage}\` |`,
    `| To | \`${toStage}\` |`,
    `| Timestamp | ${timestamp} |`,
    `| Run ID | ${opts.runId ?? "—"} |`,
    `| Routing Decision | ${opts.routingDecisionId ?? "—"} |`,
    `| Reason | ${reason.trim() || "—"} |`,
    "",
  ];

  return lines.join("\n") + "\n";
}

export interface ApplyReviewActionArgs {
  task: string;
  action: ReviewAction;
  reason?: string;
}

export type ApplyReviewActionResult =
  | {
      ok: true;
      taskId: string;
      fromPath: string;
      toPath: string;
      fromStatus: "review";
      toStatus: LifecycleStage;
      transitionArtifactPath: string | null;
      reviewArtifactPath: string | null;
    }
  | {
      ok: false;
      error: string;
      validationErrors?: string[];
    };

export function applyReviewAction(
  args: ApplyReviewActionArgs,
  options: {
    factoryRoot: string;
    runId?: string | null;
    routingDecisionId?: string | null;
  }
): ApplyReviewActionResult {
  const validation = validateReviewAction(args.action, args.reason ?? "");
  if (!validation.valid) {
    return { ok: false, error: validation.error ?? "Invalid review action" };
  }

  const { factoryRoot } = options;
  const resolvedTask = path.isAbsolute(args.task)
    ? args.task
    : path.resolve(factoryRoot, args.task);

  if (!fs.existsSync(resolvedTask)) {
    return { ok: false, error: `File not found: ${resolvedTask}` };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedTask, "utf-8");
  } catch (err) {
    return { ok: false, error: `Cannot read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { meta } = parseFrontmatter(raw);
  const fromStatus = String(meta.status ?? "");
  if (fromStatus !== "review") {
    return {
      ok: false,
      error: `Task ${String(meta.id ?? path.basename(resolvedTask, ".md"))} must be in review before review actions can run`,
    };
  }

  const transition = moveTask(
    { task: resolvedTask, to: reviewActionToStage(args.action) },
    { factoryRoot }
  );
  if (!transition.ok) {
    return transition;
  }

  const taskId = String(meta.id ?? path.basename(resolvedTask, ".md"));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const reviewArtifactPath = _writeReviewArtifact(factoryRoot, {
    taskId,
    action: args.action,
    fromStage: "review",
    toStage: transition.toStatus,
    timestamp,
    runId: options.runId ?? null,
    routingDecisionId: options.routingDecisionId ?? null,
    reason: args.reason ?? "",
  });

  return {
    ok: true,
    taskId,
    fromPath: transition.fromPath,
    toPath: transition.toPath,
    fromStatus: "review",
    toStatus: transition.toStatus as LifecycleStage,
    transitionArtifactPath: transition.artifactPath,
    reviewArtifactPath,
  };
}

// ---------------------------------------------------------------------------
// Internal: transition artifact writer
// ---------------------------------------------------------------------------

function _writeTransitionArtifact(
  factoryRoot: string,
  opts: {
    taskId: string;
    filename: string;
    fromStatus: string;
    toStatus: string;
    validationErrors: string[];
  }
): string | null {
  try {
    const runsDir = path.join(factoryRoot, "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
    const name = `${ts}-${opts.taskId}-move.md`;
    const artifactPath = path.join(runsDir, name);
    const content = renderTransitionLog({
      taskId: opts.taskId,
      filename: opts.filename,
      fromStatus: opts.fromStatus as LifecycleStage,
      toStatus: opts.toStatus as LifecycleStage,
      timestamp: ts,
      validationErrors: opts.validationErrors,
    });
    fs.writeFileSync(artifactPath, content, "utf-8");
    return artifactPath;
  } catch {
    return null;
  }
}

function _writeReviewArtifact(
  factoryRoot: string,
  opts: ReviewArtifactOpts
): string | null {
  try {
    const runsDir = path.join(factoryRoot, "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const artifactPath = path.join(runsDir, `${opts.timestamp}-${opts.taskId}-review.md`);
    fs.writeFileSync(artifactPath, buildReviewArtifact(opts), "utf-8");
    return artifactPath;
  } catch {
    return null;
  }
}
