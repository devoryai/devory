/**
 * packages/vscode/src/commands/task-move.ts
 *
 * devory.taskMove — QuickPick task, pick target stage, then move via the
 * shared workspace API exported from @devory/cli.
 */

import * as vscode from "vscode";
import * as path from "path";
import { LIFECYCLE_STAGES } from "@devory/cli";
import { listTasksInStage } from "../lib/task-reader.js";
import { runTaskMoveWorkflow } from "../lib/task-move.js";

export async function taskMoveCommand(
  factoryRoot: string,
  tasksDir: string,
  onMoved?: () => void
): Promise<void> {
  if (!factoryRoot || !tasksDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  // 1. Pick a task
  const taskItems: vscode.QuickPickItem[] = [];
  for (const stage of LIFECYCLE_STAGES) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0) continue;
    taskItems.push({ label: stage.toUpperCase(), kind: vscode.QuickPickItemKind.Separator });
    for (const t of tasks) {
      taskItems.push({ label: t.id, description: `${t.title}  [${stage}]`, detail: t.filepath });
    }
  }

  const pickedTask = await vscode.window.showQuickPick(taskItems, {
    title: "Devory: Move Task — select task",
    matchOnDescription: true,
  });
  if (!pickedTask || pickedTask.kind === vscode.QuickPickItemKind.Separator) return;

  const taskFilepath = pickedTask.detail!;
  const relPath = path.relative(factoryRoot, taskFilepath).replace(/\\/g, "/");

  // 2. Pick a target stage
  const stageItems = LIFECYCLE_STAGES.map((s) => ({ label: s }));
  const pickedStage = await vscode.window.showQuickPick(stageItems, {
    title: `Devory: Move Task — move "${pickedTask.label}" to`,
  });
  if (!pickedStage) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Moving ${pickedTask.label} → ${pickedStage.label}…`,
    },
    async () => {
      const result = runTaskMoveWorkflow(
        { task: relPath, to: pickedStage.label, label: pickedTask.label },
        { factoryRoot, onMoved }
      );
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error);
      } else {
        vscode.window.showInformationMessage(result.message);
      }
    }
  );
}
