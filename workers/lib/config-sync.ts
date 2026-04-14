/**
 * workers/lib/config-sync.ts
 *
 * Config sync — pushes doctrine, skills, and agent files to the cloud
 * artifact store so they are accessible from the cloud app.
 *
 * Each file is stored with its relative path in metadata so the cloud
 * read path can reconstruct the file listing without trying to reverse
 * the artifact_id encoding.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncableArtifactType } from "@devory/core";
import { pushArtifact } from "./cloud-artifact-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigSyncResult {
  pushed: string[];
  errors: string[];
  workspace_id: string;
}

interface ConfigFile {
  relativePath: string;
  absolutePath: string;
  mtime: Date;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

const AGENT_EXTENSIONS = [".md", ".yaml", ".yml", ".json"];

async function collectFiles(
  dir: string,
  extensions: string[],
): Promise<ConfigFile[]> {
  const results: ConfigFile[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = path.join(currentDir, entry);
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await walk(abs);
        continue;
      }

      if (!extensions.some((ext) => entry.endsWith(ext))) continue;

      results.push({
        relativePath: path.relative(dir, abs).replace(/\\/g, "/"),
        absolutePath: abs,
        mtime: stat.mtime,
      });
    }
  }

  if (fsSync.existsSync(dir)) {
    await walk(dir);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

async function pushConfigFiles(
  client: SupabaseClient,
  workspaceId: string,
  files: ConfigFile[],
  artifactType: SyncableArtifactType,
): Promise<ConfigSyncResult> {
  const result: ConfigSyncResult = { pushed: [], errors: [], workspace_id: workspaceId };

  await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fs.readFile(file.absolutePath, "utf-8");
        // Derive a stable artifact_id from the relative path
        const artifactId = file.relativePath
          .replace(/\.[^.]+$/, "")   // strip extension
          .replace(/\//g, "-")        // slashes → dashes
          .replace(/\\/g, "-");

        await pushArtifact(client, workspaceId, {
          artifact_id: artifactId,
          artifact_type: artifactType,
          content,
          metadata: {
            filename: file.relativePath,
            sync_source: "local",
          },
          local_updated_at: file.mtime.toISOString(),
        });

        result.pushed.push(file.relativePath);
      } catch (err) {
        result.errors.push(
          `${file.relativePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function syncDoctrineToCloud(
  client: SupabaseClient,
  workspaceId: string,
  factoryRoot: string,
): Promise<ConfigSyncResult> {
  const dir = path.join(factoryRoot, "doctrine");
  const files = await collectFiles(dir, [".md"]);
  return pushConfigFiles(client, workspaceId, files, "doctrine");
}

export async function syncSkillsToCloud(
  client: SupabaseClient,
  workspaceId: string,
  factoryRoot: string,
): Promise<ConfigSyncResult> {
  const dir = path.join(factoryRoot, "skills");
  const files = await collectFiles(dir, [".md"]);
  return pushConfigFiles(client, workspaceId, files, "skill");
}

export async function syncAgentsToCloud(
  client: SupabaseClient,
  workspaceId: string,
  factoryRoot: string,
): Promise<ConfigSyncResult> {
  const dir = path.join(factoryRoot, "agents");
  const files = await collectFiles(dir, AGENT_EXTENSIONS);
  return pushConfigFiles(client, workspaceId, files, "agent");
}
