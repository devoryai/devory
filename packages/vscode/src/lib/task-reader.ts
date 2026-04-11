/**
 * packages/vscode/src/lib/task-reader.ts
 *
 * Pure filesystem reader for factory tasks.
 * No VS Code API dependency — accepts an explicit tasksDir parameter so it
 * can be unit-tested and called from any context.
 *
 * Uses @devory/core for frontmatter parsing and TaskMeta types.
 */

import * as fs from "fs";
import * as path from "path";
import { parseFrontmatter, type TaskMeta } from "@devory/core";

export const LIFECYCLE_STAGES = [
  "backlog",
  "ready",
  "doing",
  "review",
  "blocked",
  "done",
  "archived",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface TaskSummary {
  id: string;
  title: string;
  project: string;
  status: string;
  priority: string;
  filename: string;
  filepath: string;
  stage: LifecycleStage;
  bundle_id?: string;
  modifiedAt: number;
}

export interface TaskDetail extends TaskSummary {
  meta: Partial<TaskMeta>;
  body: string;
}

/** List all task files in a single lifecycle stage directory. */
export function listTasksInStage(
  tasksDir: string,
  stage: LifecycleStage
): TaskSummary[] {
  const dir = path.join(tasksDir, stage);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => {
      const filepath = path.join(dir, filename);
      const content = fs.readFileSync(filepath, "utf-8");
      const stats = fs.statSync(filepath);
      const { meta } = parseFrontmatter(content);
      return {
        id: String(meta.id ?? filename.replace(".md", "")),
        title: String(meta.title ?? "(untitled)"),
        project: String(meta.project ?? ""),
        status: String(meta.status ?? stage),
        priority: String(meta.priority ?? ""),
        filename,
        filepath,
        stage,
        bundle_id:
          typeof meta.bundle_id === "string" ? meta.bundle_id : undefined,
        modifiedAt: stats.mtimeMs,
      };
    })
    .sort((a, b) =>
      stage === "done"
        ? b.modifiedAt - a.modifiedAt || b.id.localeCompare(a.id)
        : a.id.localeCompare(b.id)
    );
}

/** List all tasks across all lifecycle stages. */
export function listAllTasks(
  tasksDir: string
): Record<LifecycleStage, TaskSummary[]> {
  const result = {} as Record<LifecycleStage, TaskSummary[]>;
  for (const stage of LIFECYCLE_STAGES) {
    result[stage] = listTasksInStage(tasksDir, stage);
  }
  return result;
}

/** Find a specific task by ID, searching all lifecycle stages. */
export function findTaskById(
  tasksDir: string,
  id: string
): TaskDetail | null {
  for (const stage of LIFECYCLE_STAGES) {
    const dir = path.join(tasksDir, stage);
    if (!fs.existsSync(dir)) continue;

    for (const filename of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const filepath = path.join(dir, filename);
      const content = fs.readFileSync(filepath, "utf-8");
      const stats = fs.statSync(filepath);
      const { meta, body } = parseFrontmatter(content);
      const effectiveId = String(meta.id ?? filename.replace(".md", ""));
      if (effectiveId === id) {
        return {
          id: effectiveId,
          title: String(meta.title ?? "(untitled)"),
          project: String(meta.project ?? ""),
          status: String(meta.status ?? stage),
          priority: String(meta.priority ?? ""),
          filename,
          filepath,
          stage,
          modifiedAt: stats.mtimeMs,
          meta,
          body,
        };
      }
    }
  }
  return null;
}

/** Return the file path for a task by ID, or null if not found. */
export function findTaskFile(tasksDir: string, id: string): string | null {
  return findTaskById(tasksDir, id)?.filepath ?? null;
}

/** Find a task by absolute file path, or null if the file is not a known task. */
export function findTaskByFile(tasksDir: string, filepath: string): TaskSummary | null {
  const normalized = path.resolve(filepath);
  for (const stage of LIFECYCLE_STAGES) {
    const task = listTasksInStage(tasksDir, stage).find(
      (entry) => path.resolve(entry.filepath) === normalized
    );
    if (task) return task;
  }
  return null;
}
