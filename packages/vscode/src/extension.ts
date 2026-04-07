/**
 * packages/vscode/src/extension.ts
 *
 * Devory VS Code Extension — entry point.
 *
 * Registers all commands and the task/factory explorer tree views.
 * All data access goes through packages/vscode/src/lib/ (shared, testable).
 */

import * as vscode from "vscode";
import { getExtensionRuntimeRoot, getFactoryRoot, getFactoryPaths } from "./config.js";
import { TaskTreeProvider } from "./providers/task-tree.js";
import { FactoryTreeProvider } from "./providers/factory-tree.js";
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
import { factoryDoctorCommand } from "./commands/factory-doctor.js";
import { initWorkspaceCommand } from "./commands/init-workspace.js";
import { doctrineCreateCommand } from "./commands/doctrine-create.js";
import { skillCreateCommand } from "./commands/skill-create.js";
import { doctrineArchiveCommand } from "./commands/doctrine-archive.js";
import { skillArchiveCommand } from "./commands/skill-archive.js";
import { taskArchiveCommand } from "./commands/task-archive.js";
import {
  shouldShowBootstrap,
  markFirstRunComplete,
  runBootstrapFlow,
} from "./lib/bootstrap.js";

export function activate(context: vscode.ExtensionContext): void {
  const factoryRoot = getFactoryRoot();
  const paths = getFactoryPaths(factoryRoot);
  const runtimeRoot = getExtensionRuntimeRoot(context.extensionPath);
  const runOutput = vscode.window.createOutputChannel("Devory: Run");
  const doctorOutput = vscode.window.createOutputChannel("Devory: Doctor");
  const initOutput = vscode.window.createOutputChannel("Devory: Init");

  context.subscriptions.push(runOutput, doctorOutput, initOutput);

  // ── Task Tree View ────────────────────────────────────────────────────────
  const treeProvider = new TaskTreeProvider(paths.tasksDir);

  const treeView = vscode.window.createTreeView("devoryTaskExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // ── Factory Tree View (Doctrine + Skills) ─────────────────────────────────
  const factoryTreeProvider = new FactoryTreeProvider(factoryRoot);

  const factoryTreeView = vscode.window.createTreeView("devoryFactoryExplorer", {
    treeDataProvider: factoryTreeProvider,
    showCollapseAll: false,
  });

  context.subscriptions.push(factoryTreeView);

  syncCapabilityContext(factoryRoot, runtimeRoot);

  // Refresh when workspace config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("devory")) {
        const newRoot = getFactoryRoot();
        const newPaths = getFactoryPaths(newRoot);
        treeProvider.setTasksDir(newPaths.tasksDir);
        factoryTreeProvider.setFactoryRoot(newRoot);
        syncCapabilityContext(newRoot, runtimeRoot);
      }
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.refresh", () => {
      treeProvider.refresh();
      factoryTreeProvider.refresh();
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
    vscode.commands.registerCommand("devory.taskArchive", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      const { tasksDir } = getFactoryPaths(root);
      taskArchiveCommand(root, tasksDir, () => treeProvider.refresh(), target);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.doctrineCreate", () => {
      doctrineCreateCommand(getFactoryRoot(), () => factoryTreeProvider.refresh());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.skillCreate", () => {
      skillCreateCommand(getFactoryRoot(), runtimeRoot, () => factoryTreeProvider.refresh());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.doctrineArchive", (target) => {
      if (!target?.filePath) {
        vscode.window.showInformationMessage("Devory: select a doctrine file to archive.");
        return;
      }
      doctrineArchiveCommand(getFactoryRoot(), target.filePath, () => factoryTreeProvider.refresh());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.skillArchive", (target) => {
      if (!target?.skillMdPath) {
        vscode.window.showInformationMessage("Devory: select a skill to archive.");
        return;
      }
      skillArchiveCommand(getFactoryRoot(), target.skillMdPath, () => factoryTreeProvider.refresh());
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
      runStartCommand(root, runtimeRoot, runOutput);
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
      runResumeCommand(root, runsDir, runtimeRoot, runOutput);
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
      const { runsDir: rd, artifactsDir } = getFactoryPaths(root);
      runInspectCommand(rd, artifactsDir);
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

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.factoryDoctor", () => {
      factoryDoctorCommand(getFactoryRoot(), doctorOutput);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.initWorkspace", () => {
      const root = getFactoryRoot();
      initWorkspaceCommand(
        initOutput,
        () => {
          treeProvider.refresh();
          syncCapabilityContext(root, runtimeRoot);
          markFirstRunComplete(context);
        },
        () => {},
        runtimeRoot
      );
    })
  );

  // ── First-run bootstrap ───────────────────────────────────────────────────
  // Fires after a short delay so VS Code has finished rendering the workspace.
  setTimeout(() => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const cwd = workspaceFolder.uri.fsPath;
    const caps = detectWorkspaceCapabilities(factoryRoot, runtimeRoot);

    if (!shouldShowBootstrap(context, caps.hasTasksDir)) return;

    void runBootstrapFlow(
      context,
      cwd,
      initOutput,
      () =>
        initWorkspaceCommand(
          initOutput,
          () => {
            treeProvider.refresh();
            syncCapabilityContext(factoryRoot, runtimeRoot);
            markFirstRunComplete(context);
          },
          () => {},
          runtimeRoot
        )
    );
  }, 2000);
}

export function deactivate(): void {
  // No cleanup needed
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
  void vscode.commands.executeCommand(
    "setContext",
    "devory.workspaceInitialized",
    capabilities.hasTasksDir
  );
}
