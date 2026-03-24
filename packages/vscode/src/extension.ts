/**
 * packages/vscode/src/extension.ts
 *
 * Devory VS Code Extension — entry point.
 *
 * Registers all commands and the task explorer tree view.
 * All data access goes through packages/vscode/src/lib/ (shared, testable)
 * or through @devory/cli invocation builders (factory-063+).
 */

import * as vscode from "vscode";
import { getFactoryRoot, getFactoryPaths } from "./config.js";
import { TaskTreeProvider } from "./providers/task-tree.js";
import { taskListCommand } from "./commands/task-list.js";
import { taskCreateCommand } from "./commands/task-create.js";
import { taskMoveCommand } from "./commands/task-move.js";
import { runStartCommand } from "./commands/run-start.js";
import { runInspectCommand } from "./commands/run-inspect.js";
import { artifactInspectCommand } from "./commands/artifact-inspect.js";

export function activate(context: vscode.ExtensionContext): void {
  const factoryRoot = getFactoryRoot();
  const paths = getFactoryPaths(factoryRoot);

  // ── Task Tree View ────────────────────────────────────────────────────────
  const treeProvider = new TaskTreeProvider(paths.tasksDir);

  const treeView = vscode.window.createTreeView("devoryTaskExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // Refresh tree when workspace config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("devory")) {
        const newRoot = getFactoryRoot();
        const newPaths = getFactoryPaths(newRoot);
        treeProvider.setTasksDir(newPaths.tasksDir);
      }
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.refresh", () => {
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskList", () => {
      const root = getFactoryRoot();
      taskListCommand(getFactoryPaths(root).tasksDir);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskCreate", () => {
      taskCreateCommand(getFactoryRoot());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskMove", () => {
      const root = getFactoryRoot();
      const { tasksDir } = getFactoryPaths(root);
      taskMoveCommand(root, tasksDir);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.runStart", () => {
      runStartCommand(getFactoryRoot());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.runInspect", () => {
      const root = getFactoryRoot();
      runInspectCommand(getFactoryPaths(root).runsDir);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.artifactInspect", () => {
      const root = getFactoryRoot();
      artifactInspectCommand(getFactoryPaths(root).artifactsDir);
    })
  );
}

export function deactivate(): void {
  // No cleanup needed for MVP
}
