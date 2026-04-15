/**
 * packages/vscode/src/commands/task-create.ts
 *
 * devory.taskCreate — multi-step input to create a new task skeleton.
 * Calls the shared workspace API through a testable extension workflow helper.
 */

import * as vscode from "vscode";
import { runTaskCreateWorkflow, suggestTaskCreateDefaults } from "../lib/task-create.js";

export async function taskCreateCommand(
  factoryRoot: string,
  taskRoot?: string,
  onCreated?: () => void
): Promise<void> {
  const effectiveTaskRoot = taskRoot ?? factoryRoot;

  if (!factoryRoot || !effectiveTaskRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const defaults = suggestTaskCreateDefaults(factoryRoot);

  const id = await vscode.window.showInputBox({
    title: "Devory: Create Task (1/4)",
    prompt: "Task ID — used as the filename and referenced in depends_on chains",
    value: defaults.id,
    placeHolder: defaults.id,
    validateInput: (v) =>
      /^[a-zA-Z0-9_-]+$/.test(v.trim())
        ? null
        : "ID may only contain letters, numbers, hyphens, underscores",
  });
  if (!id) return;

  const title = await vscode.window.showInputBox({
    title: "Devory: Create Task (2/4)",
    prompt: "Task title — one sentence describing the outcome, not the implementation",
    placeHolder: "Add user authentication to the API",
    validateInput: (v) => (v.trim() ? null : "Title is required"),
  });
  if (!title) return;

  const project = await vscode.window.showInputBox({
    title: "Devory: Create Task (3/4)",
    prompt: "Project name — the codebase or product this task belongs to",
    value: defaults.project,
    placeHolder: defaults.project,
    validateInput: (v) => (v.trim() ? null : "Project is required"),
  });
  if (!project) return;

  const goal = await vscode.window.showInputBox({
    title: "Devory: Create Task (4/4)",
    prompt: "Goal — one sentence describing what this task should accomplish (optional, press Enter to skip)",
    placeHolder: "Make task creation less painful inside the IDE.",
  });
  // goal === undefined means the user pressed Escape (cancel); empty string means they skipped
  if (goal === undefined) return;

  const trimmedId = id.trim();

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating task ${trimmedId}…` },
    async () => {
      const result = await runTaskCreateWorkflow(
        { id: trimmedId, title, project, goal: goal.trim() || undefined },
        {
          factoryRoot,
          taskRoot: effectiveTaskRoot,
          onCreated,
          openTextDocument: async (filePath) =>
            vscode.workspace.openTextDocument(filePath),
          showTextDocument: async (doc) => {
            const editor = await vscode.window.showTextDocument(
              doc as vscode.TextDocument
            );
            return {
              setCursor(line, column) {
                const pos = new vscode.Position(line, column);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
              },
            };
          },
        }
      );
      if (!result.ok) {
        vscode.window.showErrorMessage(`Devory: task creation failed\n${result.error}`);
        return;
      }

      if (!result.openedInEditor) {
        vscode.window.showInformationMessage(`Devory: task ${trimmedId} created.`);
      }      
    }
  );
}
