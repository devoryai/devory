/**
 * packages/cli/src/commands/sync.ts
 *
 * `devory sync` — cloud sync subcommands: status, push, pull
 *
 * Authentication: reads session from .devory/session.json
 * License: requires Pro or Teams tier (Core exits 1)
 */

import * as readline from "readline/promises";
import { createClient } from "@supabase/supabase-js";
import { detectTier, resolveFactoryRoot } from "@devory/core";
import { readSession, type DevorySession } from "../lib/cloud-session.ts";
import {
  buildManifest,
  executePush,
  executePull,
  type SyncResult,
} from "../../../../workers/lib/sync-engine.js";
import { syncTasksToCloud } from "../../../../workers/lib/task-sync.js";
import { syncDoctrineToCloud, syncSkillsToCloud, syncAgentsToCloud } from "../../../../workers/lib/config-sync.js";
import type { SyncManifest } from "@devory/core";

export const NAME = "sync";
export const USAGE = "devory sync <status|push|pull> [--dry-run] [--force]";

export type SyncSubcommand = "status" | "push" | "pull";

export interface SyncArgs {
  subcommand: SyncSubcommand;
  dryRun: boolean;
  force: boolean;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): { args?: SyncArgs; error: string | null } {
  const subcommand = argv[0];
  if (!subcommand || !["status", "push", "pull"].includes(subcommand)) {
    return { error: "expected subcommand status, push, or pull" };
  }

  let dryRun = false;
  let force = false;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--force") { force = true; continue; }
    return { error: `unknown argument: ${arg}` };
  }

  return {
    args: { subcommand: subcommand as SyncSubcommand, dryRun, force },
  };
}

function buildSupabaseClient(session: DevorySession) {
  const url = session.supabase_url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = session.supabase_anon_key ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

  if (!url || !key) {
    throw new Error(
      "Cloud backend URL and client key are required. Set the workspace cloud environment variables before using sync.",
    );
  }

  const client = createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  });

  return client;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function printManifestStatus(manifest: SyncManifest): void {
  const { entries, push_count, pull_count } = manifest;
  const conflictCount = entries.filter((e) => e.status === "cloud-newer" || (e.local_updated_at && e.cloud_updated_at && e.cloud_updated_at > e.local_updated_at)).length;
  const localOnlyCount = entries.filter((e) => e.status === "local-only").length;
  const cloudOnlyCount = entries.filter((e) => e.status === "cloud-only").length;

  const line = "─".repeat(41);
  console.log(`\nSync Status — workspace: ${manifest.workspace_id}`);
  console.log(line);
  console.log(`To push (local newer):   ${entries.filter((e) => e.status === "local-newer").length}`);
  console.log(`To pull (cloud newer):   ${entries.filter((e) => e.status === "cloud-newer").length}`);
  console.log(`Local only:              ${localOnlyCount}`);
  console.log(`Cloud only:              ${cloudOnlyCount}`);
  console.log(`In sync:                 ${manifest.in_sync_count}`);
  console.log(line);

  if (push_count > 0 || pull_count > 0) {
    console.log(`Run \`devory sync push\` or \`devory sync pull\` to sync.`);
  } else {
    console.log("Everything is in sync.");
  }
}

function printSyncResult(result: SyncResult): void {
  console.log(
    `\nPushed ${result.pushed.length} items. Pulled ${result.pulled.length} items. ` +
    `${result.conflicts.length} conflicts. ${result.errors.length} errors.`,
  );

  if (result.conflicts.length > 0) {
    console.log("\nConflicts (skipped):");
    for (const c of result.conflicts) {
      const localDate = new Date(c.local_updated_at);
      const cloudDate = new Date(c.cloud_updated_at);
      const diffMs = cloudDate.getTime() - localDate.getTime();
      const diffDays = Math.round(diffMs / 86_400_000);
      const direction = diffDays > 0 ? `cloud newer by ${diffDays} day(s)` : `local newer by ${Math.abs(diffDays)} day(s)`;
      console.log(`  - ${c.artifact_id} (${c.artifact_type}) — ${direction}`);
      console.log(`    Use \`--force\` to overwrite cloud with local version.`);
    }
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const e of result.errors) {
      console.log(`  - ${e}`);
    }

    const hasArtifactsRlsError = result.errors.some((e) =>
      /row-level security policy/i.test(e) && /table\s+"?artifacts"?/i.test(e),
    );
    if (hasArtifactsRlsError) {
      console.log(
        "\nHint: Your cloud session does not currently have write access to the linked workspace.",
      );
      console.log("Run `devory cloud status` to verify the linked workspace, then relink to a workspace you can access:");
      console.log("  devory cloud link --workspace-id <accessible-workspace-id>");
      console.log("If needed, refresh credentials with `devory cloud login`.");
    }
  }
}

// ---------------------------------------------------------------------------
// Main run function
// ---------------------------------------------------------------------------

export async function run(args: SyncArgs): Promise<number> {
  const { root } = resolveFactoryRoot();

  // Auth check
  const session = readSession(root);
  if (!session) {
    console.error("Cloud sync is not connected. Run `devory cloud login` first.");
    return 1;
  }

  // Build Supabase client early — needed for cloud subscription tier check
  let client;
  try {
    client = buildSupabaseClient(session);
  } catch (err) {
    console.error(`Sync setup failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // License check — accept Pro/Teams from local license OR active cloud subscription
  const license = await detectTier(root);
  if (license.tier === "core") {
    let hasPaidPlan = false;
    try {
      const { data } = await client
        .from("subscriptions")
        .select("plan")
        .in("plan", ["pro", "pro_annual", "teams", "teams_annual", "lifetime"])
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      hasPaidPlan = !!data;
    } catch {
      // ignore — fall through to core rejection
    }
    if (!hasPaidPlan) {
      console.error("Cloud sync requires a Pro or Teams license. See https://devory.ai/pricing");
      return 1;
    }
  }

  const workspaceId = session.workspace_id ?? null;
  const userId = session.user_id;

  // status and pull require a linked workspace (artifact index in cloud)
  if (args.subcommand === "status" || args.subcommand === "pull") {
    if (!workspaceId) {
      console.error("No workspace configured. Run `devory cloud login` to link a workspace.");
      return 1;
    }
  }

  // push: workspace optional — tasks always sync to the board via workspace_tasks
  if (args.subcommand === "push") {
    let artifactErrors = 0;

    // Full artifact push when a workspace is linked
    if (workspaceId) {
      let manifest: SyncManifest;
      try {
        manifest = await buildManifest(client, workspaceId);
      } catch (err) {
        console.error(`Failed to build manifest: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }

      const pushable = manifest.entries.filter(
        (e) => e.status === "local-only" || e.status === "local-newer",
      );

      if (pushable.length > 0) {
        if (args.dryRun) {
          console.log(`\nDry run — would push ${pushable.length} artifact(s):`);
          for (const e of pushable) {
            console.log(`  ${e.artifact_id} (${e.artifact_type}) [${e.status}]`);
          }
        } else {
          const result = await executePush(client, workspaceId, pushable, { force: args.force });
          printSyncResult(result);
          artifactErrors = result.errors.length;
        }
      }
    } else {
      console.log("No workspace linked — skipping artifact sync. Run `devory cloud link --workspace-id <id>` to enable it.");
    }

    // Task board sync — works without a workspace, uses user_id as org_id
    if (userId) {
      if (args.dryRun) {
        console.log("\nDry run — would sync tasks to board.");
        return 0;
      }
      try {
        const taskResult = await syncTasksToCloud(client, workspaceId, root, { orgId: userId });
        if (taskResult.pushed.length > 0) {
          console.log(`\nSynced ${taskResult.pushed.length} task(s) to board.`);
        } else {
          console.log("\nNo tasks found to sync.");
        }
        for (const e of taskResult.errors) {
          console.warn(`  Task sync error: ${e}`);
        }
      } catch (err) {
        console.warn(`Task board sync skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Config sync (doctrine, skills, agents) — requires workspace
    if (workspaceId) {
      const syncers: Array<{ name: string; fn: () => Promise<{ pushed: string[]; errors: string[] }> }> = [
        { name: "doctrine", fn: () => syncDoctrineToCloud(client, workspaceId, root) },
        { name: "skills",   fn: () => syncSkillsToCloud(client, workspaceId, root) },
        { name: "agents",   fn: () => syncAgentsToCloud(client, workspaceId, root) },
      ];

      for (const { name, fn } of syncers) {
        try {
          const r = await fn();
          if (r.pushed.length > 0) {
            console.log(`Synced ${r.pushed.length} ${name} file(s).`);
          }
          for (const e of r.errors) {
            console.warn(`  ${name} sync error: ${e}`);
          }
          if (r.errors.length > 0) artifactErrors += r.errors.length;
        } catch (err) {
          console.warn(`${name} sync skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return artifactErrors > 0 ? 1 : 0;
  }

  // Build manifest for status/pull (workspace required, checked above)
  let manifest: SyncManifest;
  try {
    manifest = await buildManifest(client, workspaceId!);
  } catch (err) {
    console.error(`Failed to build manifest: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // status
  if (args.subcommand === "status") {
    printManifestStatus(manifest);
    return 0;
  }

  // pull
  if (args.subcommand === "pull") {
    const pullable = manifest.entries.filter(
      (e) => e.status === "cloud-only" || e.status === "cloud-newer",
    );

    if (pullable.length === 0) {
      console.log("Nothing to pull.");
      return 0;
    }

    if (args.dryRun) {
      console.log(`\nDry run — would pull ${pullable.length} item(s):`);
      for (const e of pullable) {
        console.log(`  ${e.artifact_id} (${e.artifact_type}) [${e.status}]`);
      }
      return 0;
    }

    console.log(`\nAbout to pull ${pullable.length} item(s):`);
    for (const e of pullable) {
      console.log(`  ${e.artifact_id} (${e.artifact_type})`);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nPull these ${pullable.length} items? (y/N) `);
    rl.close();

    if (answer.trim().toLowerCase() !== "y") {
      console.log("Aborted.");
      return 0;
    }

    const result = await executePull(client, workspaceId!, pullable);
    printSyncResult(result);
    return result.errors.length > 0 ? 1 : 0;
  }

  return 0;
}
