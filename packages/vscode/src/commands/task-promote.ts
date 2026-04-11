/**
 * packages/vscode/src/commands/task-promote.ts
 *
 * devory.taskPromote — promote backlog, ready, or doing tasks to the next
 * common lifecycle stage with a lightweight QuickPick flow.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { insertAgentIntoFrontmatter } from "@devory/cli";
import { parseFrontmatter } from "@devory/core";
import { loadAgentCatalog } from "../lib/agent-catalog.js";
import { listTasksInStage } from "../lib/task-reader.js";
import { runTaskPromoteWorkflow } from "../lib/task-control.js";
import { resolveActiveEditorTask, resolveTaskTarget, type TaskCommandTarget } from "../lib/task-target.js";
import { taskEnrichCommand } from "./task-enrich.js";

const PROMOTABLE_STAGES = ["backlog", "ready", "doing"] as const;

// Sections that indicate a task is ready for execution.
const READINESS_SECTIONS = ["## Acceptance Criteria", "## Verification"];

// ---------------------------------------------------------------------------
// Agent selection
// ---------------------------------------------------------------------------

const CUSTOM_AGENT_ITEM: vscode.QuickPickItem = {
  label: "$(edit) Enter a custom agent name…",
  description: "",
};

/**
 * Check whether a task file already declares an agent in its frontmatter.
 * Returns the agent string if found, or null if absent.
 */
function readAgentFromFile(taskFilepath: string): string | null {
  let content: string;
  try {
    content = fs.readFileSync(taskFilepath, "utf-8");
  } catch {
    return null;
  }
  const { meta } = parseFrontmatter(content);
  return (meta.agent && String(meta.agent).trim()) || null;
}

/**
 * Prompt the user to select an agent from the catalog, then write it into
 * the task frontmatter.  Returns the chosen agent id, or null if cancelled.
 */
async function promptAndInsertAgent(
  factoryRoot: string,
  taskFilepath: string,
  taskLabel: string
): Promise<string | null> {
  const catalog = loadAgentCatalog(factoryRoot);

  const catalogItems: vscode.QuickPickItem[] = catalog.agents.map((a) => ({
    label: a.name,
    description: a.description,
    // Store the id in detail so we can read it back without coupling to label text.
    detail: a.id,
  }));

  // Mark the default agent so it is visually distinct.
  const defaultItem = catalogItems.find((item) => item.detail === catalog.default_agent);
  if (defaultItem) {
    defaultItem.description = `${defaultItem.description}  ★ default`;
  }

  const picked = await vscode.window.showQuickPick(
    [...catalogItems, CUSTOM_AGENT_ITEM],
    {
      title: `Devory: Select Agent for "${taskLabel}"`,
      placeHolder: "Choose an agent to assign before promoting to ready",
      matchOnDescription: true,
    }
  );

  if (!picked) return null; // cancelled

  let agent: string;
  if (picked.label.startsWith("$(edit)")) {
    const custom = await vscode.window.showInputBox({
      title: "Devory: Custom Agent Name",
      prompt: "Enter the agent id to assign to this task",
      placeHolder: catalog.default_agent,
      validateInput: (v) => (v.trim() ? null : "Agent name is required"),
    });
    if (!custom) return null;
    agent = custom.trim();
  } else {
    // detail holds the id; label holds the display name.
    agent = picked.detail ?? picked.label;
  }

  // Patch the file.
  let content: string;
  try {
    content = fs.readFileSync(taskFilepath, "utf-8");
  } catch {
    vscode.window.showErrorMessage(`Devory: could not read task file to insert agent.`);
    return null;
  }
  const updated = insertAgentIntoFrontmatter(content, agent);
  try {
    fs.writeFileSync(taskFilepath, updated, "utf-8");
  } catch {
    vscode.window.showErrorMessage(`Devory: could not write agent to task file.`);
    return null;
  }

  return agent;
}

/**
 * Ensure the task has an agent assigned, prompting the user if not.
 * Returns true if promotion should proceed, false if the user cancelled.
 * Only called when promoting backlog → ready.
 */
async function ensureAgentAssigned(
  factoryRoot: string,
  taskFilepath: string,
  taskLabel: string
): Promise<boolean> {
  if (readAgentFromFile(taskFilepath)) return true; // already has one

  const agent = await promptAndInsertAgent(factoryRoot, taskFilepath, taskLabel);
  return agent !== null;
}

/**
 * Check whether a task file is missing readiness sections (AC, Verification).
 * Only relevant when promoting from backlog → ready.
 */
function missingReadinessSections(taskFilepath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(taskFilepath, "utf-8");
  } catch {
    return [];
  }
  const lines = content.split("\n").map((l) => l.trim());
  return READINESS_SECTIONS.filter((heading) => !lines.includes(heading));
}

/**
 * Show a readiness warning and let the user choose how to proceed.
 * Returns true if promotion should continue, false if cancelled.
 */
async function runReadinessCheck(
  taskFilepath: string,
  taskLabel: string
): Promise<boolean> {
  const missing = missingReadinessSections(taskFilepath);
  if (missing.length === 0) return true;

  const labels = missing.map((h) => h.replace("## ", "")).join(", ");
  const choice = await vscode.window.showWarningMessage(
    `"${taskLabel}" is missing: ${labels}. Promote to ready anyway?`,
    { modal: false },
    "Add Sections",
    "Promote Anyway"
  );

  if (choice === "Add Sections") {
    // Open the file in the editor, then run enrich so the user can fill it in.
    try {
      const doc = await vscode.workspace.openTextDocument(taskFilepath);
      await vscode.window.showTextDocument(doc);
    } catch {
      // ignore — enrich will still work on the active editor if it opened
    }
    await taskEnrichCommand();
    return false; // Let the user promote manually after filling in the sections.
  }

  if (choice === "Promote Anyway") return true;

  // User dismissed / pressed Escape — cancel.
  return false;
}

export async function taskPromoteCommand(
  factoryRoot: string,
  tasksDir: string,
  onChanged?: () => void,
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
    if (directTarget.stage === "backlog") {
      // Agent must be assigned before the task can be promoted to ready.
      const agentOk = await ensureAgentAssigned(factoryRoot, directTarget.filepath, directTarget.id);
      if (!agentOk) return;

      // Soft readiness check (AC, Verification).
      const proceed = await runReadinessCheck(directTarget.filepath, directTarget.id);
      if (!proceed) return;
    }

    const relPath = path.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Promoting ${directTarget.id}…`,
      },
      async () => {
        const result = runTaskPromoteWorkflow(
          { task: relPath, label: directTarget.id, fromStage: directTarget.stage },
          { factoryRoot, onChanged }
        );
        if (!result.ok) {
          vscode.window.showErrorMessage(result.error);
        } else {
          vscode.window.showInformationMessage(result.message);
        }
      }
    );
    return;
  }

  const items: vscode.QuickPickItem[] = [];

  for (const stage of PROMOTABLE_STAGES) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0) continue;

    items.push({ label: stage.toUpperCase(), kind: vscode.QuickPickItemKind.Separator });
    for (const task of tasks) {
      items.push({
        label: task.id,
        description: `${task.title}  [${stage}]`,
        detail: task.filepath,
      });
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage(
      "Devory: no backlog, ready, or doing tasks are available to promote."
    );
    return;
  }

  const pickedTask = await vscode.window.showQuickPick(items, {
    title: "Devory: Promote Task",
    placeHolder: "Select a task to promote to its next stage",
    matchOnDescription: true,
  });

  if (!pickedTask || pickedTask.kind === vscode.QuickPickItemKind.Separator) return;

  const taskFilepath = pickedTask.detail!;
  const fromStageMatch = pickedTask.description?.match(/\[(backlog|ready|doing)\]$/);
  const fromStage = fromStageMatch?.[1] ?? "";

  if (fromStage === "backlog") {
    // Agent must be assigned before the task can be promoted to ready.
    const agentOk = await ensureAgentAssigned(factoryRoot, taskFilepath, pickedTask.label);
    if (!agentOk) return;

    // Soft readiness check (AC, Verification).
    const proceed = await runReadinessCheck(taskFilepath, pickedTask.label);
    if (!proceed) return;
  }

  const relPath = path.relative(factoryRoot, taskFilepath).replace(/\\/g, "/");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Promoting ${pickedTask.label}…`,
    },
    async () => {
      const result = runTaskPromoteWorkflow(
        { task: relPath, label: pickedTask.label, fromStage },
        { factoryRoot, onChanged }
      );
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error);
      } else {
        vscode.window.showInformationMessage(result.message);
      }
    }
  );
}
