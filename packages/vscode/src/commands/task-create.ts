/**
 * packages/vscode/src/commands/task-create.ts
 *
 * devory.taskCreate — multi-step input to create a new task skeleton.
 * Calls the shared workspace API through a testable extension workflow helper.
 */

import * as vscode from "vscode";
import { runTaskCreateWorkflow } from "../lib/task-create.js";

export async function taskCreateCommand(factoryRoot: string): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const id = await vscode.window.showInputBox({
    title: "Devory: Create Task (1/3)",
    prompt: "Task ID — used as the filename and referenced in depends_on chains",
    placeHolder: "my-project-001",
    validateInput: (v) =>
      /^[a-zA-Z0-9_-]+$/.test(v.trim())
        ? null
        : "ID may only contain letters, numbers, hyphens, underscores",
  });
  if (!id) return;

  const title = await vscode.window.showInputBox({
    title: "Devory: Create Task (2/3)",
    prompt: "Task title — one sentence describing the outcome, not the implementation",
    placeHolder: "Add user authentication to the API",
    validateInput: (v) => (v.trim() ? null : "Title is required"),
  });
  if (!title) return;

  const project = await vscode.window.showInputBox({
    title: "Devory: Create Task (3/3)",
    prompt: "Project name — the codebase or product this task belongs to",
    placeHolder: "my-project",
    validateInput: (v) => (v.trim() ? null : "Project is required"),
  });
  if (!project) return;

  const trimmedId = id.trim();

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating task ${trimmedId}…` },
    async () => {
      const result = await runTaskCreateWorkflow(
        { id: trimmedId, title, project },
        {
          factoryRoot,
          openTextDocument: (filePath) => vscode.workspace.openTextDocument(filePath),
          showTextDocument: async (doc) => {
            const editor = await vscode.window.showTextDocument(doc);
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
