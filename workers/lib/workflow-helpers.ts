/**
 * workers/lib/workflow-helpers.ts
 *
 * Factory-030: Workflow automation helpers — pure functions.
 *
 * No filesystem access — all I/O is handled by CLI scripts.
 *
 * Exports:
 *  - LIFECYCLE_STAGES       ordered list of valid task lifecycle stages
 *  - VALID_TRANSITIONS      allowed moves between stages
 *  - LIFECYCLE_DIR_MAP      stage → tasks/ subdirectory name
 *  - checkTransition()      validate a proposed lifecycle move
 *  - buildTaskSkeleton()    generate markdown content for a new task file
 *  - buildTaskFilename()    derive a safe filename from id + title
 *  - renderTransitionLog()  produce a human-readable transition record
 */

// ---------------------------------------------------------------------------
// Types
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

/**
 * Allowed transitions per stage.
 * Based on doctrine/workflow-rules.md:
 *   backlog → ready → doing → review → done
 *   any stage (except done) → blocked
 *   blocked → backlog | ready
 *   review → doing (rework loop)
 */
export const VALID_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  backlog: ["ready", "blocked", "archived"],
  ready: ["doing", "blocked", "backlog", "archived"],
  doing: ["review", "blocked", "ready", "archived"],
  review: ["done", "doing", "blocked", "archived"],
  blocked: ["backlog", "ready", "archived"],
  archived: ["backlog", "ready"],
  done: [],
};

export interface TransitionResult {
  allowed: boolean;
  /** Populated only when allowed is false. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Transition check
// ---------------------------------------------------------------------------

/**
 * Determine whether a lifecycle move from `from` to `to` is permitted.
 * Pure — no side effects.
 */
export function checkTransition(
  from: string,
  to: string
): TransitionResult {
  if (!isLifecycleStage(from)) {
    return { allowed: false, reason: `Unknown stage: "${from}"` };
  }
  if (!isLifecycleStage(to)) {
    return { allowed: false, reason: `Unknown stage: "${to}"` };
  }
  if (from === to) {
    return { allowed: false, reason: `Task is already in "${from}"` };
  }
  const targets = VALID_TRANSITIONS[from];
  if (!targets.includes(to)) {
    return {
      allowed: false,
      reason: `Transition "${from}" → "${to}" is not allowed. Valid targets: ${targets.length ? targets.join(", ") : "(none)"}`,
    };
  }
  return { allowed: true };
}

function isLifecycleStage(value: string): value is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Task skeleton builder
// ---------------------------------------------------------------------------

export interface TaskSkeletonOpts {
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
  /** Bundle/epic identifier, e.g. "epic-auth". */
  bundle_id?: string;
  /** Human-readable bundle title for display. */
  bundle_title?: string;
  /** Execution phase within the bundle, e.g. "setup" | "implement" | "test". */
  bundle_phase?: string;
}

/**
 * Generate markdown content for a new task skeleton in `backlog` status.
 * The result is ready to write directly to a task file.
 */
export function buildTaskSkeleton(opts: TaskSkeletonOpts): string {
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
    bundle_id,
    bundle_title,
    bundle_phase,
  } = opts;

  const optionalLines: string[] = [];
  if (lane) optionalLines.push(`lane: ${lane}`);
  if (repo_area) optionalLines.push(`repo_area: ${repo_area}`);
  if (bundle_id) optionalLines.push(`bundle_id: ${bundle_id}`);
  if (bundle_title) optionalLines.push(`bundle_title: ${bundle_title}`);
  if (bundle_phase) optionalLines.push(`bundle_phase: ${bundle_phase}`);

  const lines: string[] = [
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
    "Relevant background, constraints, and assumptions the agent needs to know. Include links to related tasks, PRs, or decisions. If this depends on something not yet built, say so here.",
    "",
    "## Acceptance Criteria",
    "",
    "- Criterion 1 — specific, verifiable outcome",
    "- Criterion 2 — another specific outcome",
    "",
    "## Expected Artifacts",
    "",
    "- List files that will be created or modified",
    "- Note any migrations, config changes, or docs required",
    "",
    "## Failure Conditions",
    "",
    "- What would cause this task to be rejected?",
    "- build fails",
    "- tests fail",
    "- acceptance criteria not fully met",
    "",
    "## Reviewer Checklist",
    "",
    "- [ ] All acceptance criteria satisfied",
    "- [ ] No unintended scope changes",
    "- [ ] Build and test output clean",
    "- [ ] Code is readable and reviewable",
    "",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Filename builder
// ---------------------------------------------------------------------------

/**
 * Derive a filesystem-safe filename from a task id and title.
 * Example: ("factory-030", "Add retry logic") → "factory-030-add-retry-logic.md"
 */
export function buildTaskFilename(id: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${id}-${slug}.md`;
}

// ---------------------------------------------------------------------------
// Transition log renderer
// ---------------------------------------------------------------------------

export interface TransitionLogOpts {
  taskId: string;
  filename: string;
  fromStatus: LifecycleStage;
  toStatus: LifecycleStage;
  timestamp: string;
  validationErrors: string[];
}

/**
 * Render a human-readable transition log entry as a markdown string.
 * Used by the task-move CLI to write run artifacts.
 */
export function renderTransitionLog(opts: TransitionLogOpts): string {
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
      `File: \`${filename}\``
    );
  }

  return lines.join("\n") + "\n";
}
