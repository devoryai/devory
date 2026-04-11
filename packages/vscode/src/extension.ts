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
import { agentCreateCommand } from "./commands/agent-create.js";
import { taskArchiveCommand } from "./commands/task-archive.js";
import { taskEnrichCommand, addSectionCommand } from "./commands/task-enrich.js";
import {
  readGovernanceStatus,
  formatGovernanceStatusBarText,
  formatGovernanceStatusSummary,
} from "./lib/governance-status.js";
import { resolveTasksDir } from "./lib/task-paths.js";
import {
  shouldShowBootstrap,
  markFirstRunComplete,
  runBootstrapFlow,
} from "./lib/bootstrap.js";
import {
  showStoredDataLocationsCommand,
  cleanupLocalDataCommand,
  sweepWorkshopCommand,
} from "./commands/cleanup.js";

export function activate(context: vscode.ExtensionContext): void {
  const factoryRoot = getFactoryRoot();
  const runtimeRoot = getExtensionRuntimeRoot(context.extensionPath);
  const governanceOutput = vscode.window.createOutputChannel("Devory: Governance");
  const runOutput = vscode.window.createOutputChannel("Devory: Run");
  const doctorOutput = vscode.window.createOutputChannel("Devory: Doctor");
  const initOutput = vscode.window.createOutputChannel("Devory: Init");
  const storageOutput = vscode.window.createOutputChannel("Devory: Storage");

  context.subscriptions.push(governanceOutput, runOutput, doctorOutput, initOutput, storageOutput);

  // ── Task Tree View ────────────────────────────────────────────────────────
  const treeProvider = new TaskTreeProvider(resolveTasksDir(factoryRoot));

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

  const governanceStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98,
  );
  governanceStatusBar.command = "devory.showGovernanceStatus";
  context.subscriptions.push(governanceStatusBar);

  const refreshGovernanceStatus = () => {
    const snapshot = readGovernanceStatus(getFactoryRoot());
    governanceStatusBar.text = formatGovernanceStatusBarText(snapshot);
    governanceStatusBar.tooltip = formatGovernanceStatusSummary(snapshot);
    governanceStatusBar.show();
  };

  refreshGovernanceStatus();

  syncCapabilityContext(factoryRoot, runtimeRoot);

  // Refresh tree when workspace config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("devory")) {
        const newRoot = getFactoryRoot();
        treeProvider.setTasksDir(resolveTasksDir(newRoot));
        factoryTreeProvider.setFactoryRoot(newRoot);
        syncCapabilityContext(newRoot, runtimeRoot);
        refreshGovernanceStatus();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const normalized = doc.uri.fsPath.replace(/\\/g, "/");
      if (
        normalized.endsWith("/.devory/governance.json") ||
        normalized.endsWith("/.devory/feature-flags.json") ||
        normalized.endsWith("/.devory-governance/config.json")
      ) {
        refreshGovernanceStatus();
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(() => {
      refreshGovernanceStatus();
    }),
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.refresh", () => {
      treeProvider.refresh();
      factoryTreeProvider.refresh();
      refreshGovernanceStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.showGovernanceStatus", async () => {
      const snapshot = readGovernanceStatus(getFactoryRoot());
      const summary = formatGovernanceStatusSummary(snapshot);

      governanceOutput.clear();
      governanceOutput.appendLine(summary);
      governanceOutput.show(true);

      const cloudSummary = summary
        .split("\n")
        .find((line) => line.startsWith("Cloud commands:"));
      const headline = `Devory governance is ${snapshot.indicator}.`;
      const detail = cloudSummary ? ` ${cloudSummary}` : "";

      await vscode.window.showInformationMessage(`${headline}${detail}`);
      refreshGovernanceStatus();
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
      taskListCommand(resolveTasksDir(root));
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
      const tasksDir = resolveTasksDir(root);
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
      const tasksDir = resolveTasksDir(root);
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
      taskReviewCommand(resolveTasksDir(root), target);
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
        resolveTasksDir(root),
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
        resolveTasksDir(root),
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
        resolveTasksDir(root),
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
      taskRequeueCommand(root, resolveTasksDir(root), () => treeProvider.refresh(), target);
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
      taskArchiveCommand(root, resolveTasksDir(root), () => treeProvider.refresh(), target);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.enrichTask", () => {
      void taskEnrichCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.addAcceptanceCriteria", () => {
      void addSectionCommand("acceptanceCriteria");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.addVerification", () => {
      void addSectionCommand("verification");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.addDependencies", () => {
      void addSectionCommand("dependsOn");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.addFilesAffected", () => {
      void addSectionCommand("filesAffected");
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
    vscode.commands.registerCommand("devory.factoryDoctor", () => {
      factoryDoctorCommand(getFactoryRoot(), doctorOutput);
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
    vscode.commands.registerCommand("devory.agentCreate", () => {
      agentCreateCommand(getFactoryRoot(), () => factoryTreeProvider.refresh());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.doctrineArchive", (target) => {
      const filePath =
        typeof target?.filePath === "string"
          ? target.filePath
          : typeof target?.resourceUri?.fsPath === "string"
            ? target.resourceUri.fsPath
            : "";
      if (!filePath) return;
      doctrineArchiveCommand(getFactoryRoot(), filePath, () => factoryTreeProvider.refresh());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.skillArchive", (target) => {
      const skillMdPath =
        typeof target?.skillMdPath === "string"
          ? target.skillMdPath
          : typeof target?.resourceUri?.fsPath === "string"
            ? target.resourceUri.fsPath
            : "";
      if (!skillMdPath) return;
      skillArchiveCommand(getFactoryRoot(), skillMdPath, () => factoryTreeProvider.refresh());
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
    vscode.commands.registerCommand("devory.showStoredDataLocations", () => {
      void showStoredDataLocationsCommand(context, getFactoryRoot(), storageOutput);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.sweepWorkshop", () => {
      void sweepWorkshopCommand(context, getFactoryRoot(), storageOutput);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.cleanupLocalData", () => {
      void cleanupLocalDataCommand(context, getFactoryRoot(), storageOutput);
    })
  );

  // ── First-run bootstrap ───────────────────────────────────────────────────
  // Runs asynchronously after a short delay so VS Code has finished rendering
  // the workspace before we show a notification.
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
  void vscode.commands.executeCommand(
    "setContext",
    "devory.workspaceInitialized",
    capabilities.hasTasksDir
  );
}
