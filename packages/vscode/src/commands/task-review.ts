/**
 * packages/vscode/src/commands/task-review.ts
 *
 * devory.reviewQueue — open a review task from a lightweight QuickPick.
 */

import * as vscode from "vscode";
import { listTasksInStage } from "../lib/task-reader.js";
import { resolveActiveEditorTask, resolveTaskTarget, type TaskCommandTarget } from "../lib/task-target.js";

export async function taskReviewCommand(
  tasksDir: string,
  target?: TaskCommandTarget
): Promise<void> {
  if (!tasksDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    const doc = await vscode.workspace.openTextDocument(directTarget.filepath);
    await vscode.window.showTextDocument(doc);
    return;
  }

  const tasks = listTasksInStage(tasksDir, "review");
  if (tasks.length === 0) {
    vscode.window.showInformationMessage("Devory: no review tasks are waiting right now.");
    return;
  }

  const picked = await vscode.window.showQuickPick(
    tasks.map((task) => ({
      label: `$(file) ${task.id}`,
      description: task.title,
      detail: task.filepath,
    })),
    {
      title: "Devory: Review Queue",
      placeHolder: "Select a review task to open",
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  if (!picked?.detail) return;

  const doc = await vscode.workspace.openTextDocument(picked.detail);
  await vscode.window.showTextDocument(doc);
}
