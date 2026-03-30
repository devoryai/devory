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
import { getExtensionRuntimeRoot, getFactoryRoot, getFactoryPaths } from "./config.js";
import { TaskTreeProvider } from "./providers/task-tree.js";
import {
  detectWorkspaceCapabilities,
  getUnsupportedCommandMessage,
} from "./lib/capabilities.js";
import { taskListCommand } from "./commands/task-list.js";
import { taskCreateCommand } from "./commands/task-create.js";
import { taskMoveCommand } from "./commands/task-move.js";
import { taskPromoteCommand } from "./commands/task-promote.js";
import { taskReviewCommand } from "./commands/task-review.js";
import { taskReviewActionCommand } from "./commands/task-review-action.js";
import { taskRequeueCommand } from "./commands/task-requeue.js";
import { runStartCommand } from "./commands/run-start.js";
import { runResumeCommand } from "./commands/run-resume.js";
import { runInspectCommand } from "./commands/run-inspect.js";
import { artifactInspectCommand } from "./commands/artifact-inspect.js";

export function activate(context: vscode.ExtensionContext): void {
  const factoryRoot = getFactoryRoot();
  const paths = getFactoryPaths(factoryRoot);
  const runtimeRoot = getExtensionRuntimeRoot(context.extensionPath);

  // ── Task Tree View ────────────────────────────────────────────────────────
  const treeProvider = new TaskTreeProvider(paths.tasksDir);

  const treeView = vscode.window.createTreeView("devoryTaskExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  syncCapabilityContext(factoryRoot, runtimeRoot);

  // Refresh tree when workspace config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("devory")) {
        const newRoot = getFactoryRoot();
        const newPaths = getFactoryPaths(newRoot);
        treeProvider.setTasksDir(newPaths.tasksDir);
        syncCapabilityContext(newRoot, runtimeRoot);
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
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskList", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskListCommand(getFactoryPaths(root).tasksDir);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskCreate", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskCreate", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskCreateCommand(root);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskMove", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      const { tasksDir } = getFactoryPaths(root);
      taskMoveCommand(root, tasksDir, () => treeProvider.refresh());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskPromote", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      const { tasksDir } = getFactoryPaths(root);
      taskPromoteCommand(root, tasksDir, () => treeProvider.refresh(), target);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.reviewQueue", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskList", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewCommand(getFactoryPaths(root).tasksDir, target);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskApprove", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewActionCommand(
        getFactoryRoot(),
        getFactoryPaths(root).tasksDir,
        "approve",
        () => treeProvider.refresh(),
        target
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskSendBack", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewActionCommand(
        root,
        getFactoryPaths(root).tasksDir,
        "send-back",
        () => treeProvider.refresh(),
        target
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskBlock", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewActionCommand(
        root,
        getFactoryPaths(root).tasksDir,
        "block",
        () => treeProvider.refresh(),
        target
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.taskRequeue", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      taskRequeueCommand(root, getFactoryPaths(root).tasksDir, () => treeProvider.refresh(), target);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.runStart", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("runStart", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      runStartCommand(root, runtimeRoot);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.runResume", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("runStart", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      const { runsDir } = getFactoryPaths(root);
      runResumeCommand(root, runsDir, runtimeRoot);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.runInspect", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("runInspect", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      runInspectCommand(getFactoryPaths(root).runsDir);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.artifactInspect", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("artifactInspect", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      artifactInspectCommand(getFactoryPaths(root).artifactsDir);
    })
  );
}

export function deactivate(): void {
  // No cleanup needed for MVP
}

function syncCapabilityContext(factoryRoot: string, runtimeRoot: string): void {
  const capabilities = detectWorkspaceCapabilities(factoryRoot, runtimeRoot);
  void vscode.commands.executeCommand(
    "setContext",
    "devory.capabilityLevel",
    capabilities.capabilityLevel
  );
  void vscode.commands.executeCommand(
    "setContext",
    "devory.supportsRunExecution",
    capabilities.supportsRunExecution
  );
}
