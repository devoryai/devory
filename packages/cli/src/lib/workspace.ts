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
import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import {
  TASK_REVIEW_ACTIONS,
  TASK_REVIEW_ACTION_STAGE_MAP,
  loadFeatureFlags,
  parseFrontmatter,
  validateGovernanceCommandEnvelope,
  type GovernanceCommandEnvelope,
  type GovernanceRepoBinding,
  type TaskMeta,
} from "@devory/core";
import {
  checkTransition as checkWorkflowTransition,
  LIFECYCLE_DIR_MAP as WORKFLOW_LIFECYCLE_DIR_MAP,
  LIFECYCLE_STAGES as WORKFLOW_LIFECYCLE_STAGES,
  renderTransitionLog,
  type LifecycleStage as WorkflowLifecycleStage,
} from "../../../../workers/lib/workflow-helpers.ts";
import { rewriteStatus, validateTask } from "../../../../workers/lib/task-utils.ts";

export { rewriteStatus };

/**
 * Inject `agent: <value>` into the YAML frontmatter block of a task file's
 * raw content.  Operates only within the opening `---` … `---` block so body
 * text is never touched.
 *
 * - If `agent:` is already present the content is returned unchanged.
 * - The line is inserted after `priority:` when that field exists, otherwise
 *   just before the closing `---`.
 */
export function insertAgentIntoFrontmatter(content: string, agent: string): string {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch) return content;

  const fm = fmMatch[1];

  // Already has an agent — leave unchanged.
  if (/^agent:\s*/m.test(fm)) return content;

  const agentLine = `agent: ${agent}`;

  // Prefer to insert after the `priority:` line for consistent field ordering.
  const priorityMatch = fm.match(/^(priority:[^\n]*\n)/m);
  let updatedFm: string;
  if (priorityMatch?.index !== undefined) {
    const insertAt = (priorityMatch.index ?? 0) + priorityMatch[1].length;
    updatedFm = fm.slice(0, insertAt) + agentLine + "\n" + fm.slice(insertAt);
  } else {
    // Fall back: insert before closing `---`.
    updatedFm = fm.replace(/\n---\n$/, `\n${agentLine}\n---\n`);
  }

  return content.replace(fm, updatedFm);
}

// ---------------------------------------------------------------------------
// Lifecycle constants
// (Kept here so this module is self-contained and editor-agnostic)
// ---------------------------------------------------------------------------

export const LIFECYCLE_STAGES = WORKFLOW_LIFECYCLE_STAGES;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_DIR_MAP = WORKFLOW_LIFECYCLE_DIR_MAP;

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
  return checkWorkflowTransition(from, to);
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
  type?: string;
  priority?: string;
  /** When provided, written to frontmatter. Omitted when absent (deferred to promotion time). */
  agent?: string;
  lane?: string;
  repo_area?: string;
  /** Optional one-sentence goal to pre-populate the Goal section. */
  goal?: string;
  // Kept for backwards compatibility but no longer written to the template.
  repo?: string;
  branch?: string;
}): string {
  const {
    id,
    title,
    project,
    type = "feature",
    priority = "medium",
    agent,
    lane,
    repo_area,
    goal = "",
  } = opts;

  const optionalLines: string[] = [];
  if (agent) optionalLines.push(`agent: ${agent}`);
  if (lane) optionalLines.push(`lane: ${lane}`);
  if (repo_area) optionalLines.push(`repo_area: ${repo_area}`);

  return [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    `project: ${project}`,
    `status: backlog`,
    `type: ${type}`,
    `priority: ${priority}`,
    ...optionalLines,
    "---",
    "",
    "## Goal",
    "",
    goal || "",
    "",
    "## Notes",
    "",
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
  /** Optional one-sentence goal to pre-populate the Goal section. */
  goal?: string;
}

export type CreateTaskResult =
  | { ok: true; filePath: string; content: string }
  | { ok: false; error: string };

function resolveTaskMutationRoot(factoryRoot: string): string {
  const { flags } = loadFeatureFlags(factoryRoot);
  if (!flags.governance_repo_enabled) {
    return factoryRoot;
  }

  const bindingPath = path.join(factoryRoot, ".devory", "governance.json");
  if (!fs.existsSync(bindingPath)) {
    return factoryRoot;
  }

  try {
    const binding = JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
    const governanceRepoPath =
      typeof binding.governance_repo_path === "string"
        ? binding.governance_repo_path.trim()
        : "";
    return governanceRepoPath.length > 0 ? governanceRepoPath : factoryRoot;
  } catch {
    return factoryRoot;
  }
}

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
  const taskMutationRoot = resolveTaskMutationRoot(factoryRoot);
  const content = buildTaskSkeleton({
    ...args,
    repo_area: args.repoArea,
    goal: args.goal,
  });
  const filename = buildTaskFilename(args.id, args.title);
  const targetDir = path.join(taskMutationRoot, "tasks", "backlog");
  const filePath = path.join(targetDir, filename);

  if (!dryRun) {
    if (fs.existsSync(filePath)) {
      return {
        ok: false,
        error: `File already exists: ${path.relative(taskMutationRoot, filePath)}. Choose a different --id or remove the existing file.`,
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
  const taskMutationRoot = resolveTaskMutationRoot(factoryRoot);
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
  const destDir = path.join(taskMutationRoot, LIFECYCLE_DIR_MAP[args.to as LifecycleStage]);
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
      executionMode: "direct" | "governance-queued";
      transitionArtifactPath: string | null;
      reviewArtifactPath: string | null;
      governanceCommandPath?: string | null;
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

  const taskId = String(meta.id ?? path.basename(resolvedTask, ".md"));
  const toStage = reviewActionToStage(args.action);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";

  const governanceQueue = enqueueGovernanceReviewAction({
    factoryRoot,
    taskId,
    action: args.action,
    reason: args.reason ?? "",
  });

  if (governanceQueue.queued) {
    const reviewArtifactPath = _writeReviewArtifact(factoryRoot, {
      taskId,
      action: args.action,
      fromStage: "review",
      toStage,
      timestamp,
      runId: options.runId ?? null,
      routingDecisionId: options.routingDecisionId ?? null,
      reason: args.reason ?? "",
    });

    return {
      ok: true,
      taskId,
      fromPath: resolvedTask,
      toPath: resolvedTask,
      fromStatus: "review",
      toStatus: toStage,
      executionMode: "governance-queued",
      transitionArtifactPath: null,
      reviewArtifactPath,
      governanceCommandPath: governanceQueue.commandPath,
    };
  }

  const transition = moveTask(
    { task: resolvedTask, to: toStage },
    { factoryRoot }
  );
  if (!transition.ok) {
    return transition;
  }

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
    executionMode: "direct",
    transitionArtifactPath: transition.artifactPath,
    reviewArtifactPath,
  };
}

interface GovernanceReviewEnqueueResult {
  queued: boolean;
  commandPath: string | null;
}

function enqueueGovernanceReviewAction(opts: {
  factoryRoot: string;
  taskId: string;
  action: ReviewAction;
  reason: string;
}): GovernanceReviewEnqueueResult {
  const { factoryRoot } = opts;
  const { flags } = loadFeatureFlags(factoryRoot);
  if (!flags.governance_repo_enabled) {
    return { queued: false, commandPath: null };
  }

  const bindingPath = path.join(factoryRoot, ".devory", "governance.json");
  if (!fs.existsSync(bindingPath)) {
    return { queued: false, commandPath: null };
  }

  let binding: GovernanceRepoBinding;
  try {
    binding = JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
  } catch {
    return { queued: false, commandPath: null };
  }

  const governanceConfigPath = path.join(
    binding.governance_repo_path,
    ".devory-governance",
    "config.json",
  );
  if (!fs.existsSync(governanceConfigPath)) {
    return { queued: false, commandPath: null };
  }

  const commandType =
    opts.action === "approve"
      ? "approve-task"
      : opts.action === "send-back"
        ? "send-back-task"
        : "block-task";
  const commandId = `local-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const pendingDir = path.join(factoryRoot, ".devory", "commands", "pending");
  fs.mkdirSync(pendingDir, { recursive: true });

  const command: GovernanceCommandEnvelope = {
    command_id: commandId,
    command_type: commandType,
    issued_by: process.env.USER ?? "local-user",
    issued_at: new Date().toISOString(),
    workspace_id: binding.workspace_id,
    target_task_id: opts.taskId,
    target_run_id: undefined,
    governance_repo_ref: binding.governance_repo_path,
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    payload: {
      task_id: opts.taskId,
      ...(opts.reason.trim() ? { reason: opts.reason.trim() } : {}),
    },
  } as GovernanceCommandEnvelope;

  const validation = validateGovernanceCommandEnvelope(command);
  if (!validation.ok) {
    throw new Error(`Invalid governance review command: ${validation.errors.join("; ")}`);
  }

  const commandPath = path.join(pendingDir, `${command.command_id}.json`);
  fs.writeFileSync(commandPath, `${JSON.stringify(command, null, 2)}\n`, {
    encoding: "utf-8",
    flag: "wx",
  });

  return { queued: true, commandPath };
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
      fromStatus: opts.fromStatus as WorkflowLifecycleStage,
      toStatus: opts.toStatus as WorkflowLifecycleStage,
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

// ---------------------------------------------------------------------------
// applyLocalGovernanceCommand
// ---------------------------------------------------------------------------

const REVIEW_COMMAND_STAGE_MAP = {
  "approve-task": "done",
  "send-back-task": "doing",
  "block-task": "blocked",
} as const satisfies Partial<Record<string, LifecycleStage>>;

/**
 * Immediately applies a queued local governance command (approve / send-back / block)
 * by moving the task file directly within the governance repo.
 *
 * This is called right after enqueueGovernanceReviewAction so that VS Code users
 * don't need a running factory worker for their manual review actions to take effect.
 * The command file is moved to the processed dir after a successful apply.
 */
export function applyLocalGovernanceCommand(
  commandPath: string,
  factoryRoot: string,
): { ok: true; taskId: string; toStatus: LifecycleStage } | { ok: false; error: string } {
  // Read the command envelope
  let command: GovernanceCommandEnvelope;
  try {
    command = JSON.parse(fs.readFileSync(commandPath, "utf-8")) as GovernanceCommandEnvelope;
  } catch (err) {
    return { ok: false, error: `Cannot read command: ${err instanceof Error ? err.message : String(err)}` };
  }

  const toStatus = REVIEW_COMMAND_STAGE_MAP[command.command_type as keyof typeof REVIEW_COMMAND_STAGE_MAP];
  if (!toStatus) {
    return { ok: false, error: `Unsupported command type: ${command.command_type}` };
  }

  const taskId = command.target_task_id ?? ((command.payload as Record<string, unknown>)?.task_id as string | undefined);
  if (!taskId) {
    return { ok: false, error: "Command has no target_task_id" };
  }

  // Resolve governance repo path from binding
  const bindingPath = path.join(factoryRoot, ".devory", "governance.json");
  if (!fs.existsSync(bindingPath)) {
    return { ok: false, error: "Governance binding not found" };
  }
  let binding: GovernanceRepoBinding;
  try {
    binding = JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
  } catch (err) {
    return { ok: false, error: `Cannot read governance binding: ${err instanceof Error ? err.message : String(err)}` };
  }

  const govTasksRoot = path.join(binding.governance_repo_path, "tasks");

  // Find the task file in any stage directory
  const stages: LifecycleStage[] = ["backlog", "ready", "doing", "review", "blocked", "done", "archived"];
  let taskFilePath: string | null = null;
  for (const stage of stages) {
    const candidate = path.join(govTasksRoot, stage, `${taskId}.md`);
    if (fs.existsSync(candidate)) {
      taskFilePath = candidate;
      break;
    }
  }

  if (!taskFilePath) {
    return { ok: false, error: `Task ${taskId} not found in governance repo tasks/` };
  }

  // Read, update frontmatter, move to new stage directory
  let raw: string;
  try {
    raw = fs.readFileSync(taskFilePath, "utf-8");
  } catch (err) {
    return { ok: false, error: `Cannot read task file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const updated = rewriteStatus(raw, toStatus);
  const destDir = path.join(govTasksRoot, toStatus);
  const filename = path.basename(taskFilePath);
  const destPath = path.join(destDir, filename);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(taskFilePath, updated, "utf-8");
    if (destPath !== taskFilePath) {
      fs.renameSync(taskFilePath, destPath);
    }
  } catch (err) {
    return { ok: false, error: `Move failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Move command file to processed (best-effort)
  try {
    const processedDir = path.join(factoryRoot, ".devory", "commands", "processed");
    fs.mkdirSync(processedDir, { recursive: true });
    fs.renameSync(commandPath, path.join(processedDir, path.basename(commandPath)));
  } catch { /* non-fatal */ }

  // Commit the move to the governance repo so the change is persisted in git.
  try {
    execFileSync("git", ["add", "--all"], { cwd: binding.governance_repo_path, stdio: "pipe" });
    execFileSync(
      "git",
      ["commit", "--message", `chore: ${command.command_type} ${taskId} → ${toStatus} [local]`],
      { cwd: binding.governance_repo_path, stdio: "pipe" },
    );
  } catch (err) {
    // Non-fatal — the task is already moved on disk; a failed commit just means
    // the user will need to commit manually (or the next sync will pick it up).
    console.warn(
      `[governance] git commit failed after ${command.command_type}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { ok: true, taskId, toStatus };
}
