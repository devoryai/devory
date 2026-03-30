/**
 * packages/vscode/src/commands/task-requeue.ts
 *
 * devory.taskRequeue — move a blocked task back to ready.
 */

import * as path from "path";
import * as vscode from "vscode";
import { listTasksInStage } from "../lib/task-reader.js";
import { runTaskRequeueWorkflow } from "../lib/task-control.js";
import { resolveActiveEditorTask, resolveTaskTarget, type TaskCommandTarget } from "../lib/task-target.js";

export async function taskRequeueCommand(
  factoryRoot: string,
  tasksDir: string,
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
    const relPath = path.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Requeueing ${directTarget.id}…`,
      },
      async () => {
        const result = runTaskRequeueWorkflow(
          { task: relPath, label: directTarget.id, fromStage: directTarget.stage },
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

  const tasks = listTasksInStage(tasksDir, "blocked");
  if (tasks.length === 0) {
    vscode.window.showInformationMessage("Devory: no blocked tasks are available to requeue.");
    return;
  }

  const pickedTask = await vscode.window.showQuickPick(
    tasks.map((task) => ({
      label: task.id,
      description: task.title,
      detail: task.filepath,
    })),
    {
      title: "Devory: Requeue Blocked Task",
      placeHolder: "Select a blocked task to move back to ready",
      matchOnDescription: true,
    }
  );

  if (!pickedTask?.detail) return;

  const relPath = path.relative(factoryRoot, pickedTask.detail).replace(/\\/g, "/");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Requeueing ${pickedTask.label}…`,
    },
    async () => {
      const result = runTaskRequeueWorkflow(
        { task: relPath, label: pickedTask.label, fromStage: "blocked" },
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
