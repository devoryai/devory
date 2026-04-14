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
import { TaskAssistantProvider } from "./providers/task-assistant.js";
import { ShowWorkProvider } from "./providers/show-work.js";
import {
  detectWorkspaceCapabilities,
  getUnsupportedCommandMessage,
} from "./lib/capabilities.js";
import { taskListCommand } from "./commands/task-list.js";
import { taskCreateCommand } from "./commands/task-create.js";
import {
  generateTasksFromIdeaCommand,
} from "./commands/task-generate-from-idea.js";
import { taskMoveCommand } from "./commands/task-move.js";
import { taskPromoteCommand } from "./commands/task-promote.js";
import { taskReviewCommand } from "./commands/task-review.js";
import { taskReviewActionCommand } from "./commands/task-review-action.js";
import { taskRequeueCommand } from "./commands/task-requeue.js";
import { runStartCommand } from "./commands/run-start.js";
import { runResumeCommand } from "./commands/run-resume.js";
import { runPauseCommand } from "./commands/run-pause.js";
import { runStopCommand } from "./commands/run-stop.js";
import { runInspectCommand } from "./commands/run-inspect.js";
import { routingOutcomeSummaryCommand } from "./commands/routing-outcome-summary.js";
import { artifactInspectCommand } from "./commands/artifact-inspect.js";
import { factoryDoctorCommand } from "./commands/factory-doctor.js";
import { cloudConnectCommand } from "./commands/cloud-connect.js";
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
import { resolveActiveEditorTask } from "./lib/task-target.js";
import { LIFECYCLE_STAGES, findTaskById, type LifecycleStage, type TaskSummary } from "./lib/task-reader.js";
import { buildPostCommitActions, selectFirstCommittedTask } from "./lib/post-commit-handoff.js";
import { StageItem, TaskItem } from "./providers/task-tree.js";
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
import { RunController, type ManagedRunState } from "./lib/run-controller.js";

export function activate(context: vscode.ExtensionContext): void {
  const factoryRoot = getFactoryRoot();
  const runtimeRoot = getExtensionRuntimeRoot(context.extensionPath);
  const governanceOutput = vscode.window.createOutputChannel("Devory: Governance");
  const runOutput = vscode.window.createOutputChannel("Devory: Run");
  const doctorOutput = vscode.window.createOutputChannel("Devory: Doctor");
  const cloudOutput = vscode.window.createOutputChannel("Devory: Cloud");
  const initOutput = vscode.window.createOutputChannel("Devory: Init");
  const storageOutput = vscode.window.createOutputChannel("Devory: Storage");
  const runController = new RunController();

  context.subscriptions.push(governanceOutput, runOutput, doctorOutput, cloudOutput, initOutput, storageOutput);

  // ── Show Work Webview View ────────────────────────────────────────────────
  // Instantiated early so syncRunContext can call refresh() on state changes.
  const showWorkProvider = new ShowWorkProvider(
    () => resolveTasksDir(getFactoryRoot()),
    () => getFactoryPaths(getFactoryRoot()).artifactsDir,
    () => runController.getState()
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ShowWorkProvider.viewId,
      showWorkProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const syncRunContext = (state: ManagedRunState) => {
    void vscode.commands.executeCommand("setContext", "devory.runActive", state === "running");
    void vscode.commands.executeCommand("setContext", "devory.runPaused", state === "paused");
    void vscode.commands.executeCommand("setContext", "devory.runRunning", state === "running");
    // Refresh the Show Work panel immediately when run state transitions.
    showWorkProvider.refresh();
  };

  syncRunContext(runController.getState());

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

  // ── Task Assistant Webview View ───────────────────────────────────────────
  const taskAssistantProvider = new TaskAssistantProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TaskAssistantProvider.viewId,
      taskAssistantProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Update assistant when the active editor switches to/from a task file.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      const tasksDir = resolveTasksDir(getFactoryRoot());
      const task = resolveActiveEditorTask(tasksDir);
      taskAssistantProvider.setTask(task);
    })
  );

  // Update assistant when a task is selected in the tree.
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const selected = e.selection[0];
      if (selected instanceof TaskItem) {
        taskAssistantProvider.setTask(selected.task);
      } else if (!selected) {
        // Selection cleared — fall back to the active editor.
        const tasksDir = resolveTasksDir(getFactoryRoot());
        taskAssistantProvider.setTask(resolveActiveEditorTask(tasksDir));
      }
    })
  );

  // Register the focus command.
  context.subscriptions.push(
    vscode.commands.registerCommand("devory.focusTaskAssistant", () => {
      void vscode.commands.executeCommand("devoryTaskAssistant.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.showWork", () => {
      void vscode.commands.executeCommand("devoryShowWork.focus");
    })
  );

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
        // Re-resolve active task with new root.
        taskAssistantProvider.setTask(resolveActiveEditorTask(resolveTasksDir(newRoot)));
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
    vscode.commands.registerCommand("devory.cloudConnect", async () => {
      await cloudConnectCommand(getFactoryRoot(), cloudOutput);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.openGettingStarted", async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.action.openWalkthrough",
          "DevoryAI.devory-vscode#devory.gettingStarted",
          false
        );
      } catch {
        await vscode.window.showInformationMessage(
          "Devory: open Command Palette and run 'Get Started: Open Walkthrough...' then choose 'Devory.AI: Get started with Devory'."
        );
      }
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
    vscode.commands.registerCommand("devory.generateTasksFromIdea", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskCreate", capabilities);
      if (blockedMessage) {
        vscode.window.showInformationMessage(blockedMessage);
        return;
      }
      void generateTasksFromIdeaCommand(
        root,
        () => treeProvider.refresh(),
        async (committed) => {
          const latestRoot = getFactoryRoot();
          const latestTasksDir = resolveTasksDir(latestRoot);

          treeProvider.refresh();

          const committedWithTask = committed.map((entry, index) => {
            const task = findTaskById(latestTasksDir, entry.task_id);
            return {
              entry,
              task,
              candidate: {
                taskId: entry.task_id,
                stage: task?.stage ?? toLifecycleStage(entry.target_stage),
                commitIndex: index,
              },
            };
          });

          const selectedCandidate = selectFirstCommittedTask(
            committedWithTask.map((value) => value.candidate)
          );

          const selected = selectedCandidate
            ? committedWithTask.find((value) => value.entry.task_id === selectedCandidate.taskId)
            : undefined;
          const selectedTask = selected?.task ?? null;

          if (selectedTask) {
            const revealed = await revealTaskInExplorer(treeProvider, treeView, selectedTask);
            if (!revealed) {
              taskAssistantProvider.setTask(selectedTask);
            }
          }

          const firstRunnable = committedWithTask.find((value) => value.task?.stage === "ready")?.task ?? null;
          const selectionText = selectedTask
            ? `${selectedTask.id} (${selectedTask.stage})`
            : selectedCandidate
              ? `${selectedCandidate.taskId} (${selectedCandidate.stage ?? "unknown"})`
              : "none";
          const runnableText = firstRunnable ? `${firstRunnable.id}` : "none";

          const actions = buildPostCommitActions(selectedTask?.stage ?? selectedCandidate?.stage ?? null);
          const picked = await vscode.window.showQuickPick(
            actions.map((action) => ({
              label: action.label,
              detail: action.detail,
              action,
            })),
            {
              title:
                `Devory: ${committed.length} committed · selected ${selectionText} · runnable now ${runnableText}`,
              placeHolder: "Choose the next step",
              ignoreFocusOut: true,
            }
          );

          if (!picked) return;

          if (picked.action.id === "open-show-work") {
            await vscode.commands.executeCommand("devory.showWork");
            return;
          }

          if (!selectedTask) {
            vscode.window.showInformationMessage(
              "Devory: committed tasks were saved, but no task could be resolved in Task Explorer yet."
            );
            return;
          }

          if (picked.action.id === "reveal-task") {
            const revealed = await revealTaskInExplorer(treeProvider, treeView, selectedTask);
            if (!revealed) {
              taskAssistantProvider.setTask(selectedTask);
            }
            return;
          }

          if (selectedTask.stage === "backlog") {
            vscode.window.showInformationMessage(
              `Devory: ${selectedTask.id} is in backlog. Promote it to ready before running.`
            );
            await vscode.commands.executeCommand("devory.taskPromote", selectedTask);
          }

          const refreshedTask = findTaskById(resolveTasksDir(getFactoryRoot()), selectedTask.id);
          if (!refreshedTask || refreshedTask.stage !== "ready") {
            const stageLabel = refreshedTask?.stage ?? "unknown";
            vscode.window.showInformationMessage(
              `Devory: ${selectedTask.id} is ${stageLabel}. Move it to ready to run.`
            );
            return;
          }

          await revealTaskInExplorer(treeProvider, treeView, refreshedTask);
          taskAssistantProvider.setTask(refreshedTask);

          await vscode.commands.executeCommand("devory.runStart");
          const openShowWork = await vscode.window.showInformationMessage(
            `Devory: run start requested for ${refreshedTask.id}. Open Show Work?`,
            "Open Show Work"
          );
          if (openShowWork === "Open Show Work") {
            await vscode.commands.executeCommand("devory.showWork");
          }
        }
      );
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
      if (runController.getState() === "paused") {
        void runController
          .resume({
            onOutput: (chunk) => runOutput.append(chunk),
            onStateChange: syncRunContext,
          })
          .then((resumed) => {
            if (!resumed.ok) {
              vscode.window.showInformationMessage(`Devory: ${resumed.reason}`);
              return;
            }
            vscode.window.showInformationMessage("Devory: resumed the paused factory run.");
          });
        return;
      }
      if (runController.getState() === "running") {
        vscode.window.showInformationMessage("Devory: a factory run is already active. Use pause or stop from the Tasks header.");
        return;
      }
      void runStartCommand(
        root,
        resolveTasksDir(root),
        runtimeRoot,
        runOutput,
        runController,
        syncRunContext
      );
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
    vscode.commands.registerCommand("devory.runPause", () => {
      void runPauseCommand(runController, runOutput);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devory.runStop", () => {
      void runStopCommand(runController, runOutput);
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
    vscode.commands.registerCommand("devory.showRoutingOutcomeSummary", () => {
      void routingOutcomeSummaryCommand(getFactoryRoot(), runOutput);
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

function toLifecycleStage(value: string | null | undefined): LifecycleStage | null {
  if (!value) return null;
  return (LIFECYCLE_STAGES as readonly string[]).includes(value)
    ? (value as LifecycleStage)
    : null;
}

async function revealTaskInExplorer(
  treeProvider: TaskTreeProvider,
  treeView: vscode.TreeView<unknown>,
  task: TaskSummary
): Promise<boolean> {
  try {
    const rootItems = await treeProvider.getChildren();
    const stageItem = rootItems.find(
      (item): item is StageItem => item instanceof StageItem && item.stage === task.stage
    );
    if (!stageItem) return false;

    const stageChildren = await treeProvider.getChildren(stageItem);
    const taskItem = stageChildren.find(
      (item): item is TaskItem => item instanceof TaskItem && item.task.id === task.id
    );
    if (!taskItem) return false;

    await treeView.reveal(taskItem, { expand: true, select: true, focus: false });
    return true;
  } catch {
    return false;
  }
}
