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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

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
    console.error("Cloud sync is not connected. Run `devory cloud login` and `devory cloud link --workspace-id <id>` first.");
    return 1;
  }

  // License check
  const license = await detectTier(root);
  if (license.tier === "core") {
    console.error("Cloud sync requires a Pro or Teams license");
    return 1;
  }

  // Build Supabase client
  let client;
  try {
    client = buildSupabaseClient(session);
  } catch (err) {
    console.error(`Sync setup failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const workspaceId = session.workspace_id;
  if (!workspaceId) {
    console.error("No workspace configured. Set workspace_id in .devory/session.json");
    return 1;
  }

  // Build manifest for all subcommands
  let manifest: SyncManifest;
  try {
    manifest = await buildManifest(client, workspaceId);
  } catch (err) {
    console.error(`Failed to build manifest: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // status
  if (args.subcommand === "status") {
    printManifestStatus(manifest);
    return 0;
  }

  // push
  if (args.subcommand === "push") {
    const pushable = manifest.entries.filter(
      (e) => e.status === "local-only" || e.status === "local-newer",
    );

    if (pushable.length === 0) {
      console.log("Nothing to push.");
      return 0;
    }

    if (args.dryRun) {
      console.log(`\nDry run — would push ${pushable.length} item(s):`);
      for (const e of pushable) {
        console.log(`  ${e.artifact_id} (${e.artifact_type}) [${e.status}]`);
      }
      return 0;
    }

    console.log(`\nAbout to push ${pushable.length} item(s):`);
    for (const e of pushable) {
      console.log(`  ${e.artifact_id} (${e.artifact_type})`);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nPush these ${pushable.length} items? (y/N) `);
    rl.close();

    if (answer.trim().toLowerCase() !== "y") {
      console.log("Aborted.");
      return 0;
    }

    const result = await executePush(client, workspaceId, pushable, { force: args.force });
    printSyncResult(result);
    return result.errors.length > 0 ? 1 : 0;
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

    const result = await executePull(client, workspaceId, pullable);
    printSyncResult(result);
    return result.errors.length > 0 ? 1 : 0;
  }

  return 0;
}
