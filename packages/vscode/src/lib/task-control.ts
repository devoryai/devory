/**
 * packages/vscode/src/lib/task-control.ts
 *
 * Shared control workflows for the VS Code extension.
 * These helpers keep common lifecycle and review actions testable without
 * depending on VS Code APIs.
 */

import {
  applyReviewAction,
  applyLocalGovernanceCommand,
  moveTask,
  type ApplyReviewActionResult,
  type MoveTaskResult,
  type ReviewAction,
} from "@devory/cli";

export const PROMOTION_STAGE_MAP = {
  backlog: "ready",
  ready: "doing",
  doing: "review",
} as const;

export type PromotableStage = keyof typeof PROMOTION_STAGE_MAP;

export interface TaskControlWorkflowDeps {
  factoryRoot: string;
  moveTaskImpl?: typeof moveTask;
  applyReviewActionImpl?: typeof applyReviewAction;
  onChanged?: () => void;
}

export type TaskControlWorkflowResult =
  | { ok: false; error: string; validationErrors?: string[] }
  | { ok: true; message: string };

function formatValidationDetails(validationErrors?: string[]): string {
  return validationErrors?.length ? `\n${validationErrors.join("\n")}` : "";
}

export function formatTaskControlMoveError(
  result: Exclude<MoveTaskResult, { ok: true }>
): string {
  return `Devory: action failed\n${result.error}${formatValidationDetails(result.validationErrors)}`;
}

export function formatTaskReviewError(
  result: Exclude<ApplyReviewActionResult, { ok: true }>
): string {
  return `Devory: review action failed\n${result.error}${formatValidationDetails(result.validationErrors)}`;
}

export function runTaskPromoteWorkflow(
  args: { task: string; label: string; fromStage: string },
  deps: TaskControlWorkflowDeps
): TaskControlWorkflowResult {
  if (!(args.fromStage in PROMOTION_STAGE_MAP)) {
    return {
      ok: false,
      error:
        "Devory: only backlog, ready, or doing tasks can be promoted with this command.",
    };
  }

  const to = PROMOTION_STAGE_MAP[args.fromStage as PromotableStage];
  const moveTaskImpl = deps.moveTaskImpl ?? moveTask;
  const result = moveTaskImpl({ task: args.task, to }, { factoryRoot: deps.factoryRoot });

  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskControlMoveError(result),
      validationErrors: result.validationErrors,
    };
  }

  deps.onChanged?.();
  return {
    ok: true,
    message: `Devory: promoted ${args.label} → ${to}.`,
  };
}

export function runTaskRequeueWorkflow(
  args: { task: string; label: string; fromStage: string; toStage?: "backlog" | "ready" },
  deps: TaskControlWorkflowDeps
): TaskControlWorkflowResult {
  if (args.fromStage !== "blocked" && args.fromStage !== "archived") {
    return {
      ok: false,
      error: "Devory: only blocked or archived tasks can be requeued.",
    };
  }

  const targetStage = args.fromStage === "archived" ? (args.toStage ?? "backlog") : "ready";
  const moveTaskImpl = deps.moveTaskImpl ?? moveTask;
  const result = moveTaskImpl(
    { task: args.task, to: targetStage },
    { factoryRoot: deps.factoryRoot }
  );

  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskControlMoveError(result),
      validationErrors: result.validationErrors,
    };
  }

  deps.onChanged?.();
  return {
    ok: true,
    message: `Devory: requeued ${args.label} → ${targetStage}.`,
  };
}

export function runTaskReviewWorkflow(
  args: { task: string; label: string; action: ReviewAction; reason?: string },
  deps: TaskControlWorkflowDeps
): TaskControlWorkflowResult {
  const applyReviewActionImpl = deps.applyReviewActionImpl ?? applyReviewAction;
  const result = applyReviewActionImpl(
    { task: args.task, action: args.action, reason: args.reason },
    { factoryRoot: deps.factoryRoot }
  );

  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskReviewError(result),
      validationErrors: result.validationErrors,
    };
  }

  // When governance is active the review action is first written as a command file
  // for audit purposes, but the task won't move unless the factory worker is running.
  // Apply the command immediately so the file moves right away for local users.
  if (result.executionMode === "governance-queued" && result.governanceCommandPath) {
    const localResult = applyLocalGovernanceCommand(result.governanceCommandPath, deps.factoryRoot);
    if (!localResult.ok) {
      return { ok: false, error: `Task queued but could not be moved locally: ${localResult.error}` };
    }
  }

  deps.onChanged?.();

  const message =
    args.action === "approve"
      ? `Devory: approved ${args.label}.`
      : args.action === "send-back"
        ? `Devory: sent ${args.label} back to doing.`
        : `Devory: blocked ${args.label}.`;

  return { ok: true, message };
}
