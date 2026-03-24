/**
 * packages/cli/src/commands/task-new.ts
 *
 * `devory task new` — create a new task skeleton in the backlog.
 * Delegates to `scripts/task-new.ts` via spawn.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "task new";
export const USAGE =
  "devory task new --id <id> --title <title> --project <project> [--dry-run]";

export interface TaskNewArgs {
  id: string;
  title: string;
  project: string;
  /** Task type, e.g. "feature", "bugfix", "refactor" */
  type?: string;
  /** Priority level, e.g. "high", "medium", "low" */
  priority?: string;
  /** Agent name, e.g. "fullstack-builder" */
  agent?: string;
  /** Work lane */
  lane?: string;
  /** Repo area */
  repoArea?: string;
  dryRun: boolean;
}

/**
 * Parse raw argv (everything after "task new") into typed args.
 * Returns null and sets error if required fields are missing.
 */
export function parseArgs(
  argv: string[]
): { args: TaskNewArgs; error: null } | { args: null; error: string } {
  const raw: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--dry-run") {
      raw["dry-run"] = true;
    } else if (tok.startsWith("--") && i + 1 < argv.length) {
      raw[tok.slice(2)] = argv[++i];
    }
  }

  const id = typeof raw["id"] === "string" ? raw["id"].trim() : "";
  const title = typeof raw["title"] === "string" ? raw["title"].trim() : "";
  const project =
    typeof raw["project"] === "string" ? raw["project"].trim() : "";

  const missing: string[] = [];
  if (!id) missing.push("--id");
  if (!title) missing.push("--title");
  if (!project) missing.push("--project");
  if (missing.length > 0) {
    return { args: null, error: `Missing required options: ${missing.join(", ")}` };
  }

  return {
    args: {
      id,
      title,
      project,
      type: typeof raw["type"] === "string" ? raw["type"] : undefined,
      priority: typeof raw["priority"] === "string" ? raw["priority"] : undefined,
      agent: typeof raw["agent"] === "string" ? raw["agent"] : undefined,
      lane: typeof raw["lane"] === "string" ? raw["lane"] : undefined,
      repoArea: typeof raw["repo-area"] === "string" ? raw["repo-area"] : undefined,
      dryRun: raw["dry-run"] === true,
    },
    error: null,
  };
}

/**
 * Build the tsx invocation for this command.
 * Returns [command, ...args] suitable for spawnSync.
 */
export function buildInvocation(args: TaskNewArgs): string[] {
  const argv = ["--id", args.id, "--title", args.title, "--project", args.project];
  if (args.type) argv.push("--type", args.type);
  if (args.priority) argv.push("--priority", args.priority);
  if (args.agent) argv.push("--agent", args.agent);
  if (args.lane) argv.push("--lane", args.lane);
  if (args.repoArea) argv.push("--repo-area", args.repoArea);
  if (args.dryRun) argv.push("--dry-run");
  return buildTsxInvocation("scripts/task-new.ts", argv);
}

/** Execute the command, returning the process exit code. */
export function run(args: TaskNewArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
