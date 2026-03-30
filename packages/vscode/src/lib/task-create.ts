/**
 * packages/vscode/src/lib/task-create.ts
 *
 * Shared task-creation workflow for the VS Code extension.
 * This keeps the file mutation and editor-opening path testable without
 * depending directly on the VS Code API.
 */

import { createTask, type CreateTaskArgs } from "@devory/cli";

export interface TextDocumentLike {
  getText(): string;
}

export interface TextEditorLike {
  setCursor(line: number, column: number): void;
}

export interface TaskCreateWorkflowDeps {
  factoryRoot: string;
  createTaskImpl?: typeof createTask;
  openTextDocument?: (filePath: string) => Promise<TextDocumentLike>;
  showTextDocument?: (document: TextDocumentLike) => Promise<TextEditorLike>;
}

export type TaskCreateWorkflowResult =
  | { ok: false; error: string }
  | {
      ok: true;
      filePath: string;
      content: string;
      openedInEditor: boolean;
      cursorLine: number | null;
    };

export async function runTaskCreateWorkflow(
  args: Pick<CreateTaskArgs, "id" | "title" | "project">,
  deps: TaskCreateWorkflowDeps
): Promise<TaskCreateWorkflowResult> {
  const createTaskImpl = deps.createTaskImpl ?? createTask;
  const creation = createTaskImpl(args, { factoryRoot: deps.factoryRoot, dryRun: false });
  if (!creation.ok) {
    return { ok: false, error: creation.error };
  }

  let cursorLine: number | null = findGoalCursorLine(creation.content);
  let openedInEditor = false;

  if (deps.openTextDocument && deps.showTextDocument) {
    try {
      const document = await deps.openTextDocument(creation.filePath);
      cursorLine = findGoalCursorLine(document.getText());
      const editor = await deps.showTextDocument(document);
      if (cursorLine !== null) {
        editor.setCursor(cursorLine, 0);
      }
      openedInEditor = true;
    } catch {
      openedInEditor = false;
    }
  }

  return {
    ok: true,
    filePath: creation.filePath,
    content: creation.content,
    openedInEditor,
    cursorLine,
  };
}

export function findGoalCursorLine(content: string): number | null {
  const goalHeaderLine = content.split("\n").findIndex((line) => line.trim() === "## Goal");
  if (goalHeaderLine === -1) return null;
  return goalHeaderLine + 2;
}
