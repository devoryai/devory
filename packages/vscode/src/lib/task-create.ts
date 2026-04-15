/**
 * packages/vscode/src/lib/task-create.ts
 *
 * Shared task-creation workflow for the VS Code extension.
 * This keeps the file mutation and editor-opening path testable without
 * depending directly on the VS Code API.
 */

import * as fs from "fs";
import * as path from "path";
import { createTask, type CreateTaskArgs } from "@devory/cli";

export interface TextDocumentLike {
  getText(): string;
}

export interface TextEditorLike {
  setCursor(line: number, column: number): void;
}

export interface TaskCreateWorkflowDeps {
  factoryRoot: string;
  taskRoot?: string;
  createTaskImpl?: typeof createTask;
  openTextDocument?: (filePath: string) => Promise<TextDocumentLike>;
  showTextDocument?: (document: TextDocumentLike) => Promise<TextEditorLike>;
  onCreated?: () => void;
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

export interface TaskCreateDefaults {
  id: string;
  project: string;
}

export async function runTaskCreateWorkflow(
  args: Pick<CreateTaskArgs, "id" | "title" | "project" | "goal">,
  deps: TaskCreateWorkflowDeps
): Promise<TaskCreateWorkflowResult> {
  const createTaskImpl = deps.createTaskImpl ?? createTask;
  const creation = createTaskImpl(args, {
    factoryRoot: deps.taskRoot ?? deps.factoryRoot,
    dryRun: false,
  });
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

  deps.onCreated?.();

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

export function suggestTaskCreateDefaults(factoryRoot: string): TaskCreateDefaults {
  const project = path.basename(factoryRoot.trim()) || "project";
  const idPrefix = detectDominantTaskIdPrefix(factoryRoot) ?? sanitizeTaskIdPrefix(project);
  return {
    id: suggestNextTaskId(factoryRoot, idPrefix),
    project,
  };
}

function detectDominantTaskIdPrefix(factoryRoot: string): string | null {
  const counters = new Map<string, { count: number; maxSequence: number }>();
  for (const filename of listTaskFilenames(factoryRoot)) {
    const match = filename.match(/^(.+)-(\d+)(?:-|\.md$)/i);
    if (!match) continue;
    const prefix = sanitizeTaskIdPrefix(match[1]);
    if (!prefix) continue;
    const sequence = Number.parseInt(match[2], 10);
    const current = counters.get(prefix) ?? { count: 0, maxSequence: 0 };
    current.count += 1;
    current.maxSequence = Math.max(current.maxSequence, sequence);
    counters.set(prefix, current);
  }

  let bestPrefix: string | null = null;
  let bestCount = -1;
  let bestMaxSequence = -1;
  for (const [prefix, stats] of counters) {
    if (
      stats.count > bestCount ||
      (stats.count === bestCount && stats.maxSequence > bestMaxSequence) ||
      (stats.count === bestCount &&
        stats.maxSequence === bestMaxSequence &&
        prefix.localeCompare(bestPrefix ?? "") < 0)
    ) {
      bestPrefix = prefix;
      bestCount = stats.count;
      bestMaxSequence = stats.maxSequence;
    }
  }

  return bestPrefix;
}

function suggestNextTaskId(factoryRoot: string, prefix: string): string {
  const safePrefix = sanitizeTaskIdPrefix(prefix) || "task";
  const pattern = new RegExp(`^${escapeRegExp(safePrefix)}-(\\d+)(?:-|\\.md$)`, "i");
  let maxSequence = 0;
  let width = 3;

  for (const filename of listTaskFilenames(factoryRoot)) {
    const match = filename.match(pattern);
    if (!match) continue;
    maxSequence = Math.max(maxSequence, Number.parseInt(match[1], 10));
    width = Math.max(width, match[1].length);
  }

  return `${safePrefix}-${String(maxSequence + 1).padStart(width, "0")}`;
}

function listTaskFilenames(factoryRoot: string): string[] {
  const tasksDir = path.join(factoryRoot, "tasks");
  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  const filenames: string[] = [];
  for (const stage of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!stage.isDirectory()) continue;
    const stageDir = path.join(tasksDir, stage.name);
    for (const entry of fs.readdirSync(stageDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        filenames.push(entry.name);
      }
    }
  }
  return filenames;
}

function sanitizeTaskIdPrefix(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
