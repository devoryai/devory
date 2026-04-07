import * as path from "path";
import * as vscode from "vscode";
import { listAllTasks } from "../lib/task-reader.js";
import { runTaskMoveWorkflow } from "../lib/task-move.js";
import { resolveActiveEditorTask, resolveTaskTarget, type TaskCommandTarget } from "../lib/task-target.js";

const ARCHIVABLE_STAGES = new Set(["backlog", "ready", "doing", "review", "blocked"]);

export async function taskArchiveCommand(
  factoryRoot: string,
  tasksDir: string,
  onMoved?: () => void,
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
    if (!ARCHIVABLE_STAGES.has(directTarget.stage)) {
      vscode.window.showInformationMessage("Devory: only active tasks can be archived.");
      return;
    }
    const relPath = path.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    const result = runTaskMoveWorkflow(
      { task: relPath, to: "archived", label: directTarget.id },
      { factoryRoot, onMoved }
    );
    if (!result.ok) {
      vscode.window.showErrorMessage(result.error);
    } else {
      vscode.window.showInformationMessage(result.message);
    }
    return;
  }

  const allTasks = listAllTasks(tasksDir);
  const candidates = [
    ...allTasks.backlog,
    ...allTasks.ready,
    ...allTasks.doing,
    ...allTasks.review,
    ...allTasks.blocked,
  ];
  if (candidates.length === 0) {
    vscode.window.showInformationMessage("Devory: no active tasks are available to archive.");
    return;
  }

  const picked = await vscode.window.showQuickPick(
    candidates.map((task) => ({
      label: task.id,
      description: `${task.title}  [${task.stage}]`,
      detail: task.filepath,
    })),
    {
      title: "Devory: Archive Task",
      placeHolder: "Select a task to archive",
      matchOnDescription: true,
    }
  );
  if (!picked?.detail) return;

  const relPath = path.relative(factoryRoot, picked.detail).replace(/\\/g, "/");
  const result = runTaskMoveWorkflow(
    { task: relPath, to: "archived", label: picked.label },
    { factoryRoot, onMoved }
  );
  if (!result.ok) {
    vscode.window.showErrorMessage(result.error);
  } else {
    vscode.window.showInformationMessage(result.message);
  }
}
