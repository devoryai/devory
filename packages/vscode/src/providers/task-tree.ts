/**
 * packages/vscode/src/providers/task-tree.ts
 *
 * VS Code TreeDataProvider for the Devory Task Explorer sidebar view.
 * Shows tasks grouped by lifecycle stage.
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type TaskSummary,
  listTasksInStage,
} from "../lib/task-reader.js";

// ── Tree item types ─────────────────────────────────────────────────────────

export class StageItem extends vscode.TreeItem {
  constructor(
    public readonly stage: LifecycleStage,
    public readonly count: number
  ) {
    super(
      `${stage}  (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = `stage.${stage}`;
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}

export class TaskItem extends vscode.TreeItem {
  constructor(public readonly task: TaskSummary) {
    super(
      `${task.id}  ${task.title}`,
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = `task.${task.stage}`;
    this.tooltip = `${task.title}\nProject: ${task.project}\nStatus: ${task.status}\nPriority: ${task.priority}`;
    this.description = task.priority || undefined;
    this.iconPath = new vscode.ThemeIcon("file");
    // Open the task file on click
    this.command = {
      command: "vscode.open",
      title: "Open Task",
      arguments: [vscode.Uri.file(task.filepath)],
    };
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class TaskTreeProvider
  implements vscode.TreeDataProvider<StageItem | TaskItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    StageItem | TaskItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private tasksDir: string) {}

  /** Update the tasks directory (e.g. when settings change) and refresh. */
  setTasksDir(tasksDir: string): void {
    this.tasksDir = tasksDir;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StageItem | TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: StageItem | TaskItem
  ): Thenable<(StageItem | TaskItem)[]> {
    if (!this.tasksDir) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level: lifecycle stages
      return Promise.resolve(
        LIFECYCLE_STAGES.map((stage) => {
          const tasks = listTasksInStage(this.tasksDir, stage);
          return new StageItem(stage, tasks.length);
        })
      );
    }

    if (element instanceof StageItem) {
      // Stage level: tasks within this stage
      const tasks = listTasksInStage(this.tasksDir, element.stage);
      return Promise.resolve(tasks.map((t) => new TaskItem(t)));
    }

    return Promise.resolve([]);
  }
}
