/**
 * packages/vscode/src/lib/run-reader.ts
 *
 * Pure filesystem reader for factory run records.
 * No VS Code API dependency — accepts an explicit runsDir parameter.
 */

import * as fs from "fs";
import * as path from "path";

export interface TaskRecord {
  task_id: string;
  outcome: string;
  engine: string;
  fallback_taken: boolean;
  start_time: string;
  end_time: string;
  notes: string[];
}

export interface FailureRecord {
  task_id: string;
  reason: string;
  timestamp: string;
}

export interface RunRecord {
  run_id: string;
  status: string;
  task_queue: string[];
  tasks_executed: TaskRecord[];
  failure: FailureRecord | null;
  start_time: string;
  end_time: string | null;
}

/** Statuses that mean the run stopped before completion and can be resumed. */
export const RESUMABLE_STATUSES = ["failed", "paused_for_review"] as const;

/** List all run records, newest first. */
export function listRuns(runsDir: string): RunRecord[] {
  if (!fs.existsSync(runsDir)) return [];

  return fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith("-manifest.json"))
    .sort()
    .reverse()
    .map((filename) => {
      try {
        const raw = fs.readFileSync(path.join(runsDir, filename), "utf-8");
        return JSON.parse(raw) as RunRecord;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as RunRecord[];
}

/** Find a specific run by ID. */
export function getRunById(runsDir: string, runId: string): RunRecord | null {
  if (!fs.existsSync(runsDir)) return null;

  for (const filename of fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith("-manifest.json"))) {
    try {
      const raw = fs.readFileSync(path.join(runsDir, filename), "utf-8");
      const run = JSON.parse(raw) as RunRecord;
      if (run.run_id === runId) return run;
    } catch {
      /* skip corrupt files */
    }
  }
  return null;
}

/** Return only runs that failed or are paused for review. */
export function getResumableRuns(runsDir: string): RunRecord[] {
  return listRuns(runsDir).filter((r) =>
    (RESUMABLE_STATUSES as readonly string[]).includes(r.status)
  );
}

/** Format a run record as a short display label. */
export function formatRunLabel(run: RunRecord): string {
  const date = run.start_time
    ? run.start_time.slice(0, 16).replace("T", " ")
    : "unknown";
  const taskCount = run.tasks_executed?.length ?? 0;
  return `${run.run_id}  [${run.status}]  ${taskCount} task(s)  started ${date}`;
}
