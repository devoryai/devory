/**
 * packages/vscode/src/commands/task-promote.ts
 *
 * devory.taskPromote — promote backlog, ready, or doing tasks to the next
 * common lifecycle stage with a lightweight QuickPick flow.
 */

import * as path from "path";
import * as vscode from "vscode";
import { listTasksInStage } from "../lib/task-reader.js";
import { runTaskPromoteWorkflow } from "../lib/task-control.js";
import { resolveActiveEditorTask, resolveTaskTarget, type TaskCommandTarget } from "../lib/task-target.js";

const PROMOTABLE_STAGES = ["backlog", "ready", "doing"] as const;

export async function taskPromoteCommand(
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
        title: `Promoting ${directTarget.id}…`,
      },
      async () => {
        const result = runTaskPromoteWorkflow(
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

  const items: vscode.QuickPickItem[] = [];

  for (const stage of PROMOTABLE_STAGES) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0) continue;

    items.push({ label: stage.toUpperCase(), kind: vscode.QuickPickItemKind.Separator });
    for (const task of tasks) {
      items.push({
        label: task.id,
        description: `${task.title}  [${stage}]`,
        detail: task.filepath,
      });
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage(
      "Devory: no backlog, ready, or doing tasks are available to promote."
    );
    return;
  }

  const pickedTask = await vscode.window.showQuickPick(items, {
    title: "Devory: Promote Task",
    placeHolder: "Select a task to promote to its next stage",
    matchOnDescription: true,
  });

  if (!pickedTask || pickedTask.kind === vscode.QuickPickItemKind.Separator) return;

  const taskFilepath = pickedTask.detail!;
  const relPath = path.relative(factoryRoot, taskFilepath).replace(/\\/g, "/");
  const fromStageMatch = pickedTask.description?.match(/\[(backlog|ready|doing)\]$/);
  const fromStage = fromStageMatch?.[1] ?? "";

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Promoting ${pickedTask.label}…`,
    },
    async () => {
      const result = runTaskPromoteWorkflow(
        { task: relPath, label: pickedTask.label, fromStage },
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
