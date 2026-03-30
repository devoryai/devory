/**
 * packages/vscode/src/commands/task-review-action.ts
 *
 * Lightweight review action commands for approve, send-back, and block.
 */

import * as path from "path";
import * as vscode from "vscode";
import type { ReviewAction } from "@devory/cli";
import { listTasksInStage } from "../lib/task-reader.js";
import { runTaskReviewWorkflow } from "../lib/task-control.js";
import { resolveActiveEditorTask, resolveTaskTarget, type TaskCommandTarget } from "../lib/task-target.js";

const REVIEW_ACTION_TITLES: Record<ReviewAction, string> = {
  approve: "Approve Review Task",
  "send-back": "Send Review Task Back",
  block: "Block Review Task",
};

const REVIEW_ACTION_PROGRESS: Record<ReviewAction, string> = {
  approve: "Approving",
  "send-back": "Sending back",
  block: "Blocking",
};

export async function taskReviewActionCommand(
  factoryRoot: string,
  tasksDir: string,
  action: ReviewAction,
  onChanged?: () => void,
  target?: TaskCommandTarget
): Promise<void> {
  if (!factoryRoot || !tasksDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    const reason =
      action === "block"
        ? await vscode.window.showInputBox({
            title: "Devory: Block Review Task",
            prompt: "Briefly explain why this task is being blocked",
            validateInput: (value) =>
              value.trim() ? null : "A block reason is required.",
          })
        : undefined;

    if (action === "block" && reason === undefined) return;

    const relPath = path.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${REVIEW_ACTION_PROGRESS[action]} ${directTarget.id}…`,
      },
      async () => {
        const result = runTaskReviewWorkflow(
          { task: relPath, label: directTarget.id, action, reason },
          { factoryRoot, onChanged }
        );
        if (!result.ok) {
          vscode.window.showErrorMessage(result.error);
        } else {
          vscode.window.showInformationMessage(result.message);
        }
      }
    );
    return;
  }

  const tasks = listTasksInStage(tasksDir, "review");
  if (tasks.length === 0) {
    vscode.window.showInformationMessage("Devory: no review tasks are waiting right now.");
    return;
  }

  const pickedTask = await vscode.window.showQuickPick(
    tasks.map((task) => ({
      label: task.id,
      description: task.title,
      detail: task.filepath,
    })),
    {
      title: `Devory: ${REVIEW_ACTION_TITLES[action]}`,
      placeHolder: "Select a review task",
      matchOnDescription: true,
    }
  );

  if (!pickedTask?.detail) return;

  const reason =
    action === "block"
      ? await vscode.window.showInputBox({
          title: "Devory: Block Review Task",
          prompt: "Briefly explain why this task is being blocked",
          validateInput: (value) =>
            value.trim() ? null : "A block reason is required.",
        })
      : undefined;

  if (action === "block" && reason === undefined) return;

  const relPath = path.relative(factoryRoot, pickedTask.detail).replace(/\\/g, "/");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${REVIEW_ACTION_PROGRESS[action]} ${pickedTask.label}…`,
    },
    async () => {
      const result = runTaskReviewWorkflow(
        {
          task: relPath,
          label: pickedTask.label,
          action,
          reason,
        },
        { factoryRoot, onChanged }
      );
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error);
      } else {
        vscode.window.showInformationMessage(result.message);
      }
    }
  );
}
