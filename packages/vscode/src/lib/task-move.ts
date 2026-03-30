/**
 * packages/vscode/src/lib/task-move.ts
 *
 * Shared task-movement workflow for the VS Code extension.
 * Keeps task lifecycle mutation and refresh behavior testable without
 * depending directly on VS Code APIs.
 */

import { moveTask, type MoveTaskResult } from "@devory/cli";

export interface TaskMoveWorkflowDeps {
  factoryRoot: string;
  moveTaskImpl?: typeof moveTask;
  onMoved?: () => void;
}

export type TaskMoveWorkflowResult =
  | { ok: false; error: string; validationErrors?: string[] }
  | { ok: true; message: string };

export function formatTaskMoveError(result: Exclude<MoveTaskResult, { ok: true }>): string {
  return `Devory: move failed\n${result.error}${
    result.validationErrors?.length ? `\n${result.validationErrors.join("\n")}` : ""
  }`;
}

export function runTaskMoveWorkflow(
  args: { task: string; to: string; label: string },
  deps: TaskMoveWorkflowDeps
): TaskMoveWorkflowResult {
  const moveTaskImpl = deps.moveTaskImpl ?? moveTask;
  const result = moveTaskImpl(
    { task: args.task, to: args.to },
    { factoryRoot: deps.factoryRoot }
  );

  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskMoveError(result),
      validationErrors: result.validationErrors,
    };
  }

  deps.onMoved?.();
  return {
    ok: true,
    message: `Devory: moved ${args.label} → ${args.to}.`,
  };
}
