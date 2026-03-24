/**
 * packages/cli/src/commands/task-move.ts
 *
 * `devory task move` — move a task through the lifecycle.
 * Delegates to `scripts/task-move.ts` via spawn.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "task move";
export const USAGE = "devory task move --task <file> --to <stage>";

export interface TaskMoveArgs {
  task: string;
  to: string;
}

export function parseArgs(
  argv: string[]
): { args: TaskMoveArgs; error: null } | { args: null; error: string } {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--") && i + 1 < argv.length) {
      raw[tok.slice(2)] = argv[++i];
    }
  }

  const task = raw["task"]?.trim() ?? "";
  const to = raw["to"]?.trim() ?? "";

  const missing: string[] = [];
  if (!task) missing.push("--task");
  if (!to) missing.push("--to");
  if (missing.length > 0) {
    return { args: null, error: `Missing required options: ${missing.join(", ")}` };
  }

  return { args: { task, to }, error: null };
}

export function buildInvocation(args: TaskMoveArgs): string[] {
  return buildTsxInvocation("scripts/task-move.ts", ["--task", args.task, "--to", args.to]);
}

export function run(args: TaskMoveArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
