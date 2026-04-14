/**
 * workers/lib/sync-engine.ts
 *
 * Sync engine — orchestrates build-manifest, push, and pull across all syncable data types.
 * Used by CLI sync commands and the web app sync UI.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { glob } from "glob";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSyncManifest,
  resolveFactoryRoot,
  loadFeatureFlags,
  type SyncEntry,
  type SyncManifest,
  type SyncableArtifactType,
} from "@devory/core";
import {
  fetchCloudArtifactIndex,
  pushArtifact,
  pullArtifact,
} from "./cloud-artifact-store.js";
import { SyncConflictError, pushProfile, forcePushProfile, fetchCloudProfiles } from "./cloud-profile-store.js";
import type { ArtifactIndexEntry } from "./cloud-artifact-store.js";
import { GitGovernanceService } from "./git-governance-service.js";

// ---------------------------------------------------------------------------
// SyncAuthError
// ---------------------------------------------------------------------------

export class SyncAuthError extends Error {
  readonly reason: "core_tier" | "pro_personal_only" | "teams_org_mismatch";

  constructor(reason: SyncAuthError["reason"]) {
    const messages: Record<SyncAuthError["reason"], string> = {
      core_tier: "Cloud sync requires a Pro or Teams license",
      pro_personal_only: "Pro tier can only sync personal workspaces (no team workspace sync)",
      teams_org_mismatch:
        "Teams license org ID does not match this workspace — you cannot sync a workspace belonging to a different org",
    };
    super(messages[reason]);
    this.name = "SyncAuthError";
    this.reason = reason;
    Object.setPrototypeOf(this, SyncAuthError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncConflictDetail {
  artifact_id: string;
  artifact_type: string;
  local_updated_at: string;
  cloud_updated_at: string;
}

export interface SyncResult {
  pushed: string[];
  pulled: string[];
  conflicts: SyncConflictDetail[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Local artifact discovery
// ---------------------------------------------------------------------------

interface LocalArtifact {
  artifact_id: string;
  artifact_type: SyncableArtifactType;
  updated_at: string;
  local_path: string;
}

function artifactIdFromPath(filePath: string, baseDir: string): string {
  const rel = path.relative(baseDir, filePath);
  // Strip extension, replace path separators with dashes
  return rel.replace(/\\/g, "/").replace(/\.[^.]+$/, "").replace(/\//g, "-");
}

async function discoverLocalArtifacts(root: string): Promise<LocalArtifact[]> {
  const results: LocalArtifact[] = [];

  const patterns: Array<{ pattern: string; type: SyncableArtifactType; base: string }> = [
    {
      pattern: path.join(root, "artifacts", "planning-drafts", "**", "*.json"),
      type: "planning-draft",
      base: path.join(root, "artifacts", "planning-drafts"),
    },
    {
      pattern: path.join(root, "artifacts", "working-briefs", "**", "*.md"),
      type: "working-brief",
      base: path.join(root, "artifacts", "working-briefs"),
    },
    {
      pattern: path.join(root, "artifacts", "work-contexts", "**", "*.json"),
      type: "work-context",
      base: path.join(root, "artifacts", "work-contexts"),
    },
    {
      pattern: path.join(root, "artifacts", "write-back", "**", "*.md"),
      type: "write-back",
      base: path.join(root, "artifacts", "write-back"),
    },
    {
      pattern: path.join(root, "artifacts", "profiles", "**", "*.json"),
      type: "profile",
      base: path.join(root, "artifacts", "profiles"),
    },
    {
      pattern: path.join(root, "artifacts", "workspaces", "**", "*.json"),
      type: "workspace",
      base: path.join(root, "artifacts", "workspaces"),
    },
    {
      pattern: path.join(root, "runs", "**", "*.json"),
      type: "run-history",
      base: path.join(root, "runs"),
    },
    {
      pattern: path.join(root, "doctrine", "**", "*.md"),
      type: "doctrine",
      base: path.join(root, "doctrine"),
    },
    {
      pattern: path.join(root, "skills", "**", "*.md"),
      type: "skill",
      base: path.join(root, "skills"),
    },
    {
      pattern: path.join(root, "agents", "**", "*.{md,yaml,yml,json}"),
      type: "agent",
      base: path.join(root, "agents"),
    },
  ];

  for (const { pattern, type, base } of patterns) {
    let files: string[];
    try {
      files = await glob(pattern, { nodir: true });
    } catch {
      continue;
    }

    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        results.push({
          artifact_id: artifactIdFromPath(filePath, base),
          artifact_type: type,
          updated_at: stat.mtime.toISOString(),
          local_path: filePath,
        });
      } catch {
        // File may have been deleted between glob and stat
      }
    }
  }

  return results;
}

function localPathForArtifact(root: string, entry: SyncEntry): string {
  const typeToDir: Record<SyncableArtifactType, { dir: string; ext: string }> = {
    "planning-draft": { dir: path.join("artifacts", "planning-drafts"), ext: ".json" },
    "working-brief": { dir: path.join("artifacts", "working-briefs"), ext: ".md" },
    "work-context": { dir: path.join("artifacts", "work-contexts"), ext: ".json" },
    "write-back": { dir: path.join("artifacts", "write-back"), ext: ".md" },
    profile: { dir: path.join("artifacts", "profiles"), ext: ".json" },
    workspace: { dir: path.join("artifacts", "workspaces"), ext: ".json" },
    "run-history": { dir: "runs", ext: ".json" },
    "active-state": { dir: path.join("artifacts"), ext: ".json" },
    doctrine: { dir: "doctrine", ext: ".md" },
    skill: { dir: "skills", ext: ".md" },
    agent: { dir: "agents", ext: ".md" },
  };

  const { dir, ext } = typeToDir[entry.artifact_type] ?? {
    dir: "artifacts",
    ext: ".json",
  };

  return path.join(root, dir, `${entry.artifact_id}${ext}`);
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// planning-draft pull helpers
// ---------------------------------------------------------------------------

const TASK_STAGES = ["backlog", "ready", "doing", "review", "blocked", "done"] as const;

/**
 * Update status and stage fields in a markdown frontmatter block in-place.
 * Preserves all other frontmatter exactly as-is.
 */
function updateTaskFrontmatterStage(content: string, newStage: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;

  let yaml = fmMatch[2];

  // Replace existing status / stage lines, or append if missing
  if (/^status:/m.test(yaml)) {
    yaml = yaml.replace(/^status:.*$/m, `status: ${newStage}`);
  } else {
    yaml += `\nstatus: ${newStage}`;
  }
  if (/^stage:/m.test(yaml)) {
    yaml = yaml.replace(/^stage:.*$/m, `stage: ${newStage}`);
  } else {
    yaml += `\nstage: ${newStage}`;
  }

  return content.replace(/^(---\n)([\s\S]*?)(\n---)/,  `---\n${yaml}\n---`);
}

/**
 * Build a minimal task markdown file from a planning-draft JSON object.
 * Used when a task is cloud-only (no local file exists).
 */
function buildTaskMarkdownFromJson(data: Record<string, unknown>): string {
  const body = typeof data.body === "string" ? data.body.trim() : "";
  const stage = String(data.stage ?? data.status ?? "backlog");

  const scalarFields: Array<[string, unknown]> = [
    ["id", data.id],
    ["title", data.title],
    ["project", data.project],
    ["repo", data.repo],
    ["branch", data.branch],
    ["type", data.type],
    ["priority", data.priority],
    ["status", stage],
    ["stage", stage],
    ["agent", data.agent],
    ["bundle_id", data.bundle_id],
  ];

  const arrayFields: Array<[string, unknown]> = [
    ["depends_on", data.depends_on],
    ["verification", data.verification],
  ];

  let fm = "---\n";
  for (const [key, val] of scalarFields) {
    if (val !== undefined && val !== null && val !== "") {
      fm += `${key}: ${String(val)}\n`;
    }
  }
  for (const [key, val] of arrayFields) {
    if (Array.isArray(val) && val.length > 0) {
      fm += `${key}:\n${val.map((v) => `  - ${v}`).join("\n")}\n`;
    } else {
      fm += `${key}: []\n`;
    }
  }
  fm += "---";

  return body ? `${fm}\n${body}\n` : `${fm}\n`;
}

/**
 * Resolve the tasks base directory, respecting governance mode.
 * When governance is active, tasks live in the governance repo, not the factory root.
 */
function resolveTasksBase(root: string): string {
  const bindingPath = path.join(root, ".devory", "governance.json");
  try {
    const { flags } = loadFeatureFlags(root);
    if (flags.governance_repo_enabled && fsSync.existsSync(bindingPath)) {
      const binding = JSON.parse(fsSync.readFileSync(bindingPath, "utf-8")) as {
        governance_repo_path: string;
      };
      return path.join(binding.governance_repo_path, "tasks");
    }
  } catch { /* fall through to local */ }
  return path.join(root, "tasks");
}

/**
 * Pull a planning-draft artifact: find the local task .md file in tasks/*,
 * update its stage/status, and move it between stage directories as needed.
 * For cloud-only tasks (no local .md), write a new file from the JSON.
 */
async function pullPlanningDraft(
  tasksBase: string,
  artifactId: string,
  content: string,
  result: SyncResult,
): Promise<void> {
  let taskData: Record<string, unknown>;
  try {
    taskData = JSON.parse(content) as Record<string, unknown>;
  } catch {
    result.errors.push(`${artifactId}: invalid planning-draft JSON`);
    return;
  }

  const rawStage = String(taskData.stage ?? taskData.status ?? "backlog");
  const targetStage = (TASK_STAGES as readonly string[]).includes(rawStage)
    ? rawStage
    : "backlog";

  // Search for the existing local task file across all stage directories
  let existingPath: string | null = null;
  let existingStage: string | null = null;
  for (const stage of TASK_STAGES) {
    const candidate = path.join(tasksBase, stage, `${artifactId}.md`);
    try {
      await fs.access(candidate);
      existingPath = candidate;
      existingStage = stage;
      break;
    } catch { /* not in this stage */ }
  }

  const targetPath = path.join(tasksBase, targetStage, `${artifactId}.md`);

  if (existingPath) {
    if (existingStage === targetStage) {
      // Same stage — nothing to move, already up to date
      result.pulled.push(artifactId);
      return;
    }
    // Update frontmatter in the existing file and move to new stage dir
    const existingContent = await fs.readFile(existingPath, "utf-8");
    const updated = updateTaskFrontmatterStage(existingContent, targetStage);
    await writeAtomic(targetPath, updated);
    await fs.unlink(existingPath);
  } else {
    // Cloud-only task — write from JSON
    const markdown = buildTaskMarkdownFromJson(taskData);
    await writeAtomic(targetPath, markdown);
  }

  result.pulled.push(artifactId);
}

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------

/**
 * Compares local artifact mtimes against the cloud artifact index and returns
 * a SyncManifest with per-artifact status.
 */
export async function buildManifest(
  client: SupabaseClient,
  workspaceId: string,
): Promise<SyncManifest> {
  const { root } = resolveFactoryRoot();

  const [localArtifacts, cloudIndex] = await Promise.all([
    discoverLocalArtifacts(root),
    fetchCloudArtifactIndex(client, workspaceId),
  ]);

  const localRefs = localArtifacts.map((a) => ({
    artifact_id: a.artifact_id,
    artifact_type: a.artifact_type,
    updated_at: a.updated_at,
  }));

  const cloudRefs: ArtifactIndexEntry[] = cloudIndex;

  return buildSyncManifest(workspaceId, localRefs, cloudRefs);
}

// ---------------------------------------------------------------------------
// executePush
// ---------------------------------------------------------------------------

/**
 * Pushes all local-only and local-newer entries to cloud.
 * Conflicts are collected (not thrown) — push continues for non-conflicting entries.
 */
export async function executePush(
  client: SupabaseClient,
  workspaceId: string,
  entries: SyncEntry[],
  options?: { force?: boolean },
): Promise<SyncResult> {
  const { root } = resolveFactoryRoot();
  const result: SyncResult = { pushed: [], pulled: [], conflicts: [], errors: [] };

  // Build a precise local path map from discovery so nested doctrine/skill/agent
  // files (e.g. doctrine/products/philosophy.md → artifact_id products-philosophy)
  // resolve correctly rather than being reconstructed as flat paths.
  const discovered = await discoverLocalArtifacts(root);
  const localPathMap = new Map(discovered.map((a) => [a.artifact_id, a.local_path]));

  const pushable = entries.filter(
    (e) => e.status === "local-only" || e.status === "local-newer",
  );

  // Also include conflicts if force is set
  const forceEntries = options?.force
    ? entries.filter((e) => e.status === "in-sync" || e.status === "cloud-newer")
    : [];

  const toProcess = [...pushable, ...forceEntries];

  for (const entry of toProcess) {
    try {
      const localPath = localPathMap.get(entry.artifact_id) ?? localPathForArtifact(root, entry);
      let content: string;
      try {
        content = await fs.readFile(localPath, "utf-8");
      } catch {
        result.errors.push(`${entry.artifact_id}: could not read local file at ${localPath}`);
        continue;
      }

      if (entry.artifact_type === "profile") {
        // Profiles have their own push path with conflict detection
        const profileData = JSON.parse(content) as Record<string, unknown>;
        const { normalizeEngineeringProfile } = await import("@devory/core");
        const profile = normalizeEngineeringProfile(profileData);
        if (!profile) {
          result.errors.push(`${entry.artifact_id}: invalid profile data`);
          continue;
        }

        if (options?.force) {
          await forcePushProfile(client, workspaceId, profile);
        } else {
          await pushProfile(client, workspaceId, profile);
        }
      } else {
        const stat = await fs.stat(localPath).catch(() => null);
        await pushArtifact(client, workspaceId, {
          artifact_id: entry.artifact_id,
          artifact_type: entry.artifact_type,
          content,
          metadata: {},
          local_updated_at: stat?.mtime.toISOString() ?? new Date().toISOString(),
        });
      }

      result.pushed.push(entry.artifact_id);
    } catch (err) {
      if (err instanceof SyncConflictError) {
        result.conflicts.push({
          artifact_id: err.artifactId,
          artifact_type: entry.artifact_type,
          local_updated_at: err.localUpdatedAt,
          cloud_updated_at: err.cloudUpdatedAt,
        });
      } else {
        result.errors.push(
          `${entry.artifact_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// executePull
// ---------------------------------------------------------------------------

/**
 * Pulls all cloud-only and cloud-newer entries to local filesystem.
 * Files are written atomically (temp file + rename).
 */
export async function executePull(
  client: SupabaseClient,
  workspaceId: string,
  entries: SyncEntry[],
): Promise<SyncResult> {
  const { root } = resolveFactoryRoot();
  const tasksBase = resolveTasksBase(root);
  const result: SyncResult = { pushed: [], pulled: [], conflicts: [], errors: [] };

  const pullable = entries.filter(
    (e) => e.status === "cloud-only" || e.status === "cloud-newer",
  );

  for (const entry of pullable) {
    try {
      const artifact = await pullArtifact(client, workspaceId, entry.artifact_id);
      if (!artifact) {
        result.errors.push(`${entry.artifact_id}: not found in cloud`);
        continue;
      }

      // planning-draft: update the local task .md file and move it between
      // stage directories — do NOT write raw JSON to artifacts/planning-drafts/.
      if (entry.artifact_type === "planning-draft") {
        await pullPlanningDraft(tasksBase, entry.artifact_id, artifact.content, result);
        continue;
      }

      // Doctrine, skill, and agent artifacts store their original relative
      // path in metadata.filename so subdirectory structure is preserved on pull.
      let localPath: string;
      const metaFilename = (artifact.metadata as { filename?: string }).filename;
      if (
        metaFilename &&
        (entry.artifact_type === "doctrine" ||
          entry.artifact_type === "skill" ||
          entry.artifact_type === "agent")
      ) {
        const baseDir = { doctrine: "doctrine", skill: "skills", agent: "agents" }[entry.artifact_type];
        localPath = path.join(root, baseDir, metaFilename);
      } else {
        localPath = localPathForArtifact(root, entry);
      }

      await writeAtomic(localPath, artifact.content);
      result.pulled.push(entry.artifact_id);
    } catch (err) {
      result.errors.push(
        `${entry.artifact_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Auto-commit governance repo if any task files were moved.
  // All other governance mutations (task/move, doctrine/edit, etc.) commit via
  // GitGovernanceService — sync pull should behave the same way.
  const pulledPlanningDrafts = result.pulled.filter((id) =>
    pullable.some((e) => e.artifact_id === id && e.artifact_type === "planning-draft"),
  );
  if (pulledPlanningDrafts.length > 0) {
    const bindingPath = path.join(root, ".devory", "governance.json");
    try {
      const { flags } = loadFeatureFlags(root);
      if (flags.governance_repo_enabled && fsSync.existsSync(bindingPath)) {
        const binding = JSON.parse(fsSync.readFileSync(bindingPath, "utf-8")) as {
          governance_repo_path: string;
        };
        const git = new GitGovernanceService(binding.governance_repo_path);
        const isDirty = await git.hasUncommittedChanges();
        if (isDirty) {
          await git.stageAll();
          const taskList = pulledPlanningDrafts.join(", ");
          await git.commitWithCurrentIdentity(
            `sync: pull stage updates from cloud [${taskList}]`,
          );
        }
      }
    } catch (err) {
      // Non-fatal — tasks are already moved on disk; just log the git failure.
      result.errors.push(
        `governance-commit: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// executeSync
// ---------------------------------------------------------------------------

/**
 * Full sync: build manifest, push local-newer/local-only, pull cloud-newer/cloud-only.
 * With dryRun: true, returns the manifest without writing anything.
 */
export async function executeSync(
  client: SupabaseClient,
  workspaceId: string,
  options?: { dryRun?: boolean; force?: boolean },
): Promise<SyncResult | SyncManifest> {
  const manifest = await buildManifest(client, workspaceId);

  if (options?.dryRun) {
    return manifest;
  }

  const [pushResult, pullResult] = await Promise.all([
    executePush(client, workspaceId, manifest.entries, { force: options?.force }),
    executePull(client, workspaceId, manifest.entries),
  ]);

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    conflicts: pushResult.conflicts,
    errors: [...pushResult.errors, ...pullResult.errors],
  };
}
