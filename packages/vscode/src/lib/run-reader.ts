/**
 * packages/vscode/src/lib/run-reader.ts
 *
 * Pure filesystem reader for factory run records.
 * No VS Code API dependency — accepts an explicit runsDir parameter.
 */

import * as fs from "fs";
import * as path from "path";
import {
  RESUMABLE_RUN_STATUSES,
  normalizeRunRecord,
  type RunRecord,
} from "@devory/core";

/** Statuses that mean the run stopped before completion and can be resumed. */
export const RESUMABLE_STATUSES = RESUMABLE_RUN_STATUSES;

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
        return normalizeRunRecord(JSON.parse(raw));
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
      const run = normalizeRunRecord(JSON.parse(raw));
      if (run?.run_id === runId) return run;
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
  const displayStatus = run.unattended_execution?.status ?? run.status;
  return `${run.run_id}  [${displayStatus}]  ${taskCount} task(s)  started ${date}`;
}
