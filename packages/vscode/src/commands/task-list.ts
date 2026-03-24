/**
 * packages/vscode/src/commands/task-list.ts
 *
 * devory.taskList — show all tasks in a QuickPick, grouped by stage.
 * Selecting a task opens the task file in the editor.
 */

import * as vscode from "vscode";
import { LIFECYCLE_STAGES, listTasksInStage } from "../lib/task-reader.js";

export async function taskListCommand(tasksDir: string): Promise<void> {
  if (!tasksDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const items: vscode.QuickPickItem[] = [];

  for (const stage of LIFECYCLE_STAGES) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0) continue;

    items.push({ label: stage.toUpperCase(), kind: vscode.QuickPickItemKind.Separator });

    for (const task of tasks) {
      items.push({
        label: `$(file) ${task.id}`,
        description: task.title,
        detail: `${task.project}  ·  priority: ${task.priority || "(none)"}`,
      });
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage("Devory: no tasks found.");
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: "Devory Tasks",
    placeHolder: "Select a task to open",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked || picked.kind === vscode.QuickPickItemKind.Separator) return;

  // Extract task ID from the label (strip the icon prefix)
  const taskId = picked.label.replace("$(file) ", "").trim();
  const { findTaskFile } = await import("../lib/task-reader.js");
  const filepath = findTaskFile(tasksDir, taskId);
  if (filepath) {
    const doc = await vscode.workspace.openTextDocument(filepath);
    await vscode.window.showTextDocument(doc);
  }
}
