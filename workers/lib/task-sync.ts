/**
 * workers/lib/task-sync.ts
 *
 * Task sync — pushes local or governance repo tasks to the cloud artifact
 * store as "planning-draft" artifacts so they can be viewed online.
 *
 * Source priority:
 *   1. Governance repo (when feature flag + binding file are both present)
 *   2. Local tasks/ directory
 *
 * Toggling governance on/off is safe: artifact_id is the stable task ID
 * in both cases, so a subsequent sync overwrites the previous version
 * regardless of which source was used.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseFrontmatter,
  loadFeatureFlags,
  TASK_STAGES,
  type TaskStage,
} from "@devory/core";
import { GovernanceRepoLayout } from "./governance-repo-layout.js";
import { pushArtifact } from "./cloud-artifact-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskSyncResult {
  pushed: string[];
  skipped: string[];
  errors: string[];
  source: "governance" | "local";
  workspace_id: string;
}

interface RawTaskRecord {
  taskId: string;
  stage: TaskStage;
  filePath: string;
  mtime: Date;
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

function resolveTasksSource(factoryRoot: string): {
  tasksBase: string;
  source: "governance" | "local";
} {
  const bindingPath = path.join(factoryRoot, ".devory", "governance.json");

  let governanceEnabled = false;
  try {
    const { flags } = loadFeatureFlags(factoryRoot);
    governanceEnabled = flags.governance_repo_enabled;
  } catch {
    // feature flags unreadable — treat as disabled
  }

  if (governanceEnabled && fsSync.existsSync(bindingPath)) {
    try {
      const binding = JSON.parse(fsSync.readFileSync(bindingPath, "utf-8")) as {
        governance_repo_path: string;
      };
      const layout = new GovernanceRepoLayout(binding.governance_repo_path);
      return {
        tasksBase: path.join(layout.root, "tasks"),
        source: "governance",
      };
    } catch {
      // binding unreadable — fall through to local
    }
  }

  return {
    tasksBase: path.join(factoryRoot, "tasks"),
    source: "local",
  };
}

// ---------------------------------------------------------------------------
// Task discovery
// ---------------------------------------------------------------------------

async function discoverTasks(tasksBase: string): Promise<RawTaskRecord[]> {
  const records: RawTaskRecord[] = [];

  for (const stage of TASK_STAGES) {
    const dir = path.join(tasksBase, stage);

    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue; // stage directory doesn't exist — skip
    }

    for (const filename of entries) {
      if (!filename.endsWith(".md")) continue;
      const filePath = path.join(dir, filename);
      try {
        const stat = await fs.stat(filePath);
        records.push({
          taskId: filename.replace(/\.md$/, ""),
          stage,
          filePath,
          mtime: stat.mtime,
        });
      } catch {
        continue;
      }
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// syncTasksToCloud
// ---------------------------------------------------------------------------

/**
 * Discovers all tasks from the active source (governance repo or local) and
 * pushes each one to Supabase as a "planning-draft" artifact.
 *
 * When options.orgId is provided, each task is also upserted into the
 * workspace_tasks table so it appears on the app board at app.devory.ai.
 *
 * Existing artifacts with the same task ID are overwritten if the local
 * file is newer (handled by pushArtifact upsert semantics).
 */
export async function syncTasksToCloud(
  client: SupabaseClient,
  workspaceId: string | null,
  factoryRoot: string,
  options?: { orgId?: string; force?: boolean },
): Promise<TaskSyncResult> {
  const result: TaskSyncResult = {
    pushed: [],
    skipped: [],
    errors: [],
    source: "local",
    workspace_id: workspaceId ?? "",
  };

  const { tasksBase, source } = resolveTasksSource(factoryRoot);
  result.source = source;

  const rawTasks = await discoverTasks(tasksBase);

  // Fetch cloud timestamps + stages once so we can skip tasks where the cloud
  // has a newer stage-change from a web edit. We only skip when BOTH conditions
  // hold: (1) cloud is newer AND (2) cloud stage differs from local stage.
  // Same-stage pushes are always safe regardless of timestamp ordering.
  const cloudTimestamps = new Map<string, string>();
  const cloudStages = new Map<string, string>();
  if (workspaceId && !options?.force) {
    try {
      const { data } = await client
        .from("artifacts")
        .select("artifact_id, local_updated_at, metadata")
        .eq("workspace_id", workspaceId)
        .eq("artifact_type", "planning-draft");
      for (const row of data ?? []) {
        cloudTimestamps.set(row.artifact_id as string, row.local_updated_at as string);
        const meta = row.metadata as Record<string, unknown> | null;
        if (typeof meta?.status === "string") {
          cloudStages.set(row.artifact_id as string, meta.status);
        }
      }
    } catch { /* best-effort */ }
  }

  // Process tasks with bounded concurrency to avoid overwhelming Supabase's
  // connection pool. Promise.all on 350+ tasks causes fetch failures under load.
  const CONCURRENCY = 10;
  for (let i = 0; i < rawTasks.length; i += CONCURRENCY) {
    const batch = rawTasks.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (raw) => {
        try {
          const content = await fs.readFile(raw.filePath, "utf-8");
          const { meta, body } = parseFrontmatter(content);
          const m = meta as Record<string, unknown>;

          const effectiveId =
            typeof m.id === "string" && m.id.trim() ? m.id.trim() : raw.taskId;

          // Skip only if: cloud is newer AND cloud stage differs from local stage.
          // A same-stage push is always safe (idempotent). Only skip when the
          // cloud has a web-edit stage change that local hasn't caught up with yet.
          const cloudTs = cloudTimestamps.get(effectiveId);
          const cloudStage = cloudStages.get(effectiveId);
          if (
            cloudTs &&
            cloudStage &&
            cloudStage !== raw.stage &&
            new Date(cloudTs) > new Date(raw.mtime)
          ) {
            result.skipped.push(effectiveId);
            return;
          }

          const taskObject = {
            id: effectiveId,
            title: typeof m.title === "string" ? m.title : "(untitled)",
            project: typeof m.project === "string" ? m.project : "",
            status: typeof m.status === "string" ? m.status : raw.stage,
            priority: typeof m.priority === "string" ? m.priority : "",
            stage: raw.stage,
            repo: typeof m.repo === "string" ? m.repo : undefined,
            branch: typeof m.branch === "string" ? m.branch : undefined,
            verification: Array.isArray(m.verification)
              ? (m.verification as unknown[]).filter(
                  (v): v is string => typeof v === "string",
                )
              : [],
            depends_on: Array.isArray(m.depends_on)
              ? (m.depends_on as unknown[]).filter(
                  (v): v is string => typeof v === "string",
                )
              : [],
            bundle_id:
              typeof m.bundle_id === "string" ? m.bundle_id : undefined,
            agent: typeof m.agent === "string" ? m.agent : undefined,
            modifiedAt: raw.mtime.toISOString(),
            modified_at: raw.mtime.toISOString(),
            // Body included so the online view can render full task context.
            body,
          };

          if (workspaceId) {
            await pushArtifact(client, workspaceId, {
              artifact_id: effectiveId,
              artifact_type: "planning-draft",
              content: JSON.stringify(taskObject),
              metadata: {
                status: raw.stage,
                task_id: effectiveId,
                sync_source: source,
              },
              local_updated_at: raw.mtime.toISOString(),
            });
          }

          // Also write to workspace_tasks so the app board can display this task
          if (options?.orgId) {
            await client.from("workspace_tasks").upsert(
              {
                org_id: options.orgId,
                task_id: effectiveId,
                stage: raw.stage,
                title: taskObject.title,
                priority: taskObject.priority,
                type: typeof m.type === "string" ? m.type : "",
                agent: taskObject.agent ?? "",
                metadata: taskObject,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "org_id,task_id" },
            );
          }

          result.pushed.push(effectiveId);
        } catch (err) {
          result.errors.push(
            `${raw.taskId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }

  return result;
}
