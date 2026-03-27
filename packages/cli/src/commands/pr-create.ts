/**
 * packages/cli/src/commands/pr-create.ts
 *
 * factory-071: `devory pr-create` — create a GitHub PR from a task file.
 *
 * This command is gated behind two explicit requirements:
 *   1. --confirm flag must be passed
 *   2. GITHUB_TOKEN must be set in the environment
 *
 * Without --confirm the command prints what it would do and exits 0 (dry-run).
 * With --confirm and GITHUB_TOKEN it calls `gh pr create` and prints the PR URL.
 *
 * Implemented inline (no delegated script) — reads the task file, builds PR
 * metadata via @devory/github, and creates the PR.
 *
 * Usage:
 *   devory pr-create --task <file> --branch <name> [--base <branch>] [--confirm]
 */

import * as fs from "fs";
import * as path from "path";
import { parseFrontmatter } from "../../../core/src/index.ts";
import {
  buildPrMetadata,
  canCreatePr,
  prCreateBlockedReason,
  createPr,
} from "@devory/github";
import { resolveFactoryRoot } from "../lib/factory-root.ts";

export const NAME = "pr-create";
export const USAGE =
  "devory pr-create --task <file> --branch <name> [--base <branch>] [--confirm]";

export interface PrCreateArgs {
  /** Path to the task file (absolute or relative to factory root). */
  task: string;
  /** Branch name for the PR head. */
  branch: string;
  /** Base branch for the PR. Defaults to "main". */
  base: string;
  /** Must be true for the PR to actually be created. */
  confirm: boolean;
}

export function parseArgs(
  argv: string[]
): { args: PrCreateArgs; error: null } | { args: null; error: string } {
  let task: string | undefined;
  let branch: string | undefined;
  let base = "main";
  let confirm = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--confirm") {
      confirm = true;
    } else if (tok === "--task" && i + 1 < argv.length) {
      task = argv[++i];
    } else if (tok === "--branch" && i + 1 < argv.length) {
      branch = argv[++i];
    } else if (tok === "--base" && i + 1 < argv.length) {
      base = argv[++i];
    } else if (tok.startsWith("--")) {
      return { args: null, error: `Unknown flag: ${tok}` };
    } else {
      return { args: null, error: `Unexpected argument: ${tok}` };
    }
  }

  if (!task) return { args: null, error: "--task <file> is required" };
  if (!branch) return { args: null, error: "--branch <name> is required" };

  return { args: { task, branch, base, confirm }, error: null };
}

export function run(args: PrCreateArgs): number {
  const { root } = resolveFactoryRoot();

  // Resolve task file path
  const taskPath = path.isAbsolute(args.task)
    ? args.task
    : path.resolve(root, args.task);

  if (!fs.existsSync(taskPath)) {
    console.error(`pr-create: task file not found: ${taskPath}`);
    return 1;
  }

  const raw = fs.readFileSync(taskPath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  const { title, body: prBody } = buildPrMetadata(meta, body);

  // Print what we would do
  console.log(`\nPR Preview`);
  console.log(`${"─".repeat(56)}`);
  console.log(`Task:    ${meta.id ?? path.basename(taskPath)}`);
  console.log(`Branch:  ${args.branch} → ${args.base}`);
  console.log(`Title:   ${title}`);
  console.log(`Token:   ${canCreatePr() ? "GITHUB_TOKEN present ✓" : "GITHUB_TOKEN NOT SET ✗"}`);
  console.log(`Confirm: ${args.confirm ? "yes" : "no (pass --confirm to create)"}`);
  console.log(`${"─".repeat(56)}\n`);

  if (!args.confirm) {
    console.log("Dry-run: PR not created. Pass --confirm to create.");
    return 0;
  }

  const blockedReason = prCreateBlockedReason({
    confirm: args.confirm,
    branch: args.branch,
  });
  if (blockedReason) {
    console.error(`pr-create: ${blockedReason}`);
    return 1;
  }

  console.log("Creating PR via gh...");
  const result = createPr(meta, body, {
    confirm: args.confirm,
    branch: args.branch,
    base: args.base,
  });

  if (!result.ok) {
    console.error(`pr-create: ${result.error}`);
    return 1;
  }

  console.log(`PR created: ${result.prUrl ?? "(no URL returned)"}`);
  return 0;
}
