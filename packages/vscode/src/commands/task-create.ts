/**
 * packages/vscode/src/commands/task-create.ts
 *
 * devory.taskCreate — multi-step input to create a new task skeleton.
 * Uses @devory/cli via cli-bridge to invoke scripts/task-new.ts.
 */

import * as vscode from "vscode";
import { buildTaskNewInvocation, spawnInvocation } from "../lib/cli-bridge.js";

export async function taskCreateCommand(factoryRoot: string): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const id = await vscode.window.showInputBox({
    title: "Devory: Create Task (1/3)",
    prompt: "Task ID (e.g. factory-100)",
    placeHolder: "factory-100",
    validateInput: (v) =>
      /^[a-zA-Z0-9_-]+$/.test(v.trim())
        ? null
        : "ID may only contain letters, numbers, hyphens, underscores",
  });
  if (!id) return;

  const title = await vscode.window.showInputBox({
    title: "Devory: Create Task (2/3)",
    prompt: "Task title",
    placeHolder: "My new task",
    validateInput: (v) => (v.trim() ? null : "Title is required"),
  });
  if (!title) return;

  const project = await vscode.window.showInputBox({
    title: "Devory: Create Task (3/3)",
    prompt: "Project name",
    placeHolder: "ai-dev-factory",
    validateInput: (v) => (v.trim() ? null : "Project is required"),
  });
  if (!project) return;

  const inv = buildTaskNewInvocation({ id: id.trim(), title, project, dryRun: false });

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating task ${id}…` },
    async () => {
      const result = await spawnInvocation(inv, factoryRoot);
      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Devory: task creation failed\n${result.stderr || result.stdout}`
        );
      } else {
        vscode.window.showInformationMessage(`Devory: task ${id} created.`);
      }
    }
  );
}
