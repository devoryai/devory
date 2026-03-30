/**
 * packages/vscode/src/lib/task-target.ts
 *
 * Lightweight helpers for resolving a task from explorer, editor, or command
 * palette entry points.
 */

import * as vscode from "vscode";
import {
  findTaskByFile,
  type TaskSummary,
} from "./task-reader.js";

export interface TaskTreeTargetLike {
  task: TaskSummary;
}

export type TaskCommandTarget = vscode.Uri | TaskTreeTargetLike | TaskSummary | undefined;

function isTaskSummary(value: unknown): value is TaskSummary {
  return Boolean(
    value &&
      typeof value === "object" &&
      "filepath" in value &&
      "id" in value &&
      "stage" in value
  );
}

function isTaskTreeTargetLike(value: unknown): value is TaskTreeTargetLike {
  return Boolean(value && typeof value === "object" && "task" in value);
}

export function resolveTaskTarget(
  tasksDir: string,
  target?: TaskCommandTarget
): TaskSummary | null {
  if (!target) return null;
  if (target instanceof vscode.Uri) {
    return findTaskByFile(tasksDir, target.fsPath);
  }
  if (isTaskTreeTargetLike(target)) {
    return target.task;
  }
  if (isTaskSummary(target)) {
    return target;
  }
  return null;
}

export function resolveActiveEditorTask(tasksDir: string): TaskSummary | null {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) return null;
  return resolveTaskTarget(tasksDir, uri);
}
