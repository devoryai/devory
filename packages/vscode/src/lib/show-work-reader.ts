/**
 * packages/vscode/src/lib/show-work-reader.ts
 *
 * Aggregates real task and execution state for the Show Work panel.
 * Reads from the filesystem only — no VS Code API dependency.
 */

import * as fs from "fs";
import * as path from "path";
import { parseFrontmatter } from "@devory/core";
import { listTasksInStage, type TaskSummary } from "./task-reader.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HeartbeatRecord {
  version?: string;
  run_id: string;
  started_at?: string;
  last_heartbeat_at?: string;
  last_progress_at?: string;
  current_phase?: string;
  current_task_id?: string | null;
  current_adapter?: string | null;
  current_attempt?: number;
  recent_event_summary?: string | null;
  suspicion_flags?: string[];
  source?: string;
}

export interface TaskWithExtras extends TaskSummary {
  agent: string | null;
  filesLikelyAffected: string[];
}

export interface ShowWorkData {
  doingTasks: TaskWithExtras[];
  reviewTasks: TaskWithExtras[];
  latestHeartbeat: HeartbeatRecord | null;
  /** True if the heartbeat was written within the last 10 minutes. */
  isHeartbeatFresh: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract agent and files_likely_affected from a task file. */
function readTaskExtras(filepath: string): {
  agent: string | null;
  filesLikelyAffected: string[];
} {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const { meta } = parseFrontmatter(content);
    const files = Array.isArray(meta.files_likely_affected)
      ? (meta.files_likely_affected as unknown[])
          .filter((f): f is string => typeof f === "string")
          .slice(0, 5)
      : [];
    return {
      agent: typeof meta.agent === "string" ? meta.agent : null,
      filesLikelyAffected: files,
    };
  } catch {
    return { agent: null, filesLikelyAffected: [] };
  }
}

/** Read the newest heartbeat file from artifacts/heartbeats/. */
export function readLatestHeartbeat(artifactsDir: string): {
  record: HeartbeatRecord | null;
  isFresh: boolean;
} {
  const heartbeatsDir = path.join(artifactsDir, "heartbeats");
  if (!fs.existsSync(heartbeatsDir)) return { record: null, isFresh: false };

  const files = fs
    .readdirSync(heartbeatsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return { record: null, isFresh: false };

  try {
    const raw = fs.readFileSync(path.join(heartbeatsDir, files[0]), "utf-8");
    const record = JSON.parse(raw) as HeartbeatRecord;
    const ts = record.last_heartbeat_at ?? record.started_at;
    const ageMs = ts ? Date.now() - new Date(ts).getTime() : Infinity;
    // Consider fresh if written within the last 10 minutes.
    const isFresh = ageMs < 10 * 60 * 1000;
    return { record, isFresh };
  } catch {
    return { record: null, isFresh: false };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Aggregate all data needed to render the Show Work panel. */
export function readShowWorkData(
  tasksDir: string,
  artifactsDir: string
): ShowWorkData {
  const enrich = (task: TaskSummary): TaskWithExtras => ({
    ...task,
    ...readTaskExtras(task.filepath),
  });

  const doingTasks = listTasksInStage(tasksDir, "doing").map(enrich);
  const reviewTasks = listTasksInStage(tasksDir, "review").map(enrich);

  const { record: latestHeartbeat, isFresh: isHeartbeatFresh } =
    readLatestHeartbeat(artifactsDir);

  return { doingTasks, reviewTasks, latestHeartbeat, isHeartbeatFresh };
}

/** Format a timestamp as a short relative string, e.g. "3 min ago". */
export function formatRelativeTime(isoTs: string | undefined): string {
  if (!isoTs) return "";
  const ageMs = Date.now() - new Date(isoTs).getTime();
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)} min ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)} hr ago`;
  return `${Math.floor(ageMs / 86_400_000)} day(s) ago`;
}
