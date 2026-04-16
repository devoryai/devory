/**
 * packages/vscode/src/commands/task-requeue.ts
 *
 * devory.taskRequeue — move a blocked or archived task back into the active queue.
 */

import * as path from "path";
import * as vscode from "vscode";
import { listTasksInStage } from "../lib/task-reader.js";
import { runTaskRequeueWorkflow } from "../lib/task-control.js";
import { resolveTaskMutationRoot } from "../lib/task-paths.js";
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
    const mutationRoot = resolveTaskMutationRoot(factoryRoot);
    const relPath = path.relative(mutationRoot, directTarget.filepath).replace(/\\/g, "/");
    const toStage =
      directTarget.stage === "archived"
        ? await vscode.window.showQuickPick([{ label: "backlog" }, { label: "ready" }], {
            title: `Devory: Restore ${directTarget.id} to`,
          })
        : null;
    if (directTarget.stage === "archived" && !toStage) return;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Requeueing ${directTarget.id}…`,
      },
      async () => {
        const result = runTaskRequeueWorkflow(
          {
            task: relPath,
            label: directTarget.id,
            fromStage: directTarget.stage,
            toStage: toStage?.label as "backlog" | "ready" | undefined,
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
    return;
  }

  const tasks = [
    ...listTasksInStage(tasksDir, "blocked"),
    ...listTasksInStage(tasksDir, "archived"),
  ];
  if (tasks.length === 0) {
    vscode.window.showInformationMessage("Devory: no blocked or archived tasks are available to requeue.");
    return;
  }

  const pickedTask = await vscode.window.showQuickPick(
    tasks.map((task) => ({
      label: task.id,
      description: task.title,
      detail: task.filepath,
    })),
    {
      title: "Devory: Requeue Task",
      placeHolder: "Select a blocked or archived task to restore",
      matchOnDescription: true,
    }
  );

  if (!pickedTask?.detail) return;

  const mutationRoot = resolveTaskMutationRoot(factoryRoot);
  const relPath = path.relative(mutationRoot, pickedTask.detail).replace(/\\/g, "/");
  const fromStage = tasks.find((task) => task.filepath === pickedTask.detail)?.stage ?? "blocked";
  const toStage =
    fromStage === "archived"
      ? await vscode.window.showQuickPick([{ label: "backlog" }, { label: "ready" }], {
          title: `Devory: Restore ${pickedTask.label} to`,
        })
      : null;
  if (fromStage === "archived" && !toStage) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Requeueing ${pickedTask.label}…`,
    },
    async () => {
      const result = runTaskRequeueWorkflow(
        {
          task: relPath,
          label: pickedTask.label,
          fromStage,
          toStage: toStage?.label as "backlog" | "ready" | undefined,
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
