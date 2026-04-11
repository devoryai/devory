/**
 * packages/cli/src/commands/task-move.ts
 *
 * `devory task move` — move a task through the lifecycle.
 * Calls moveTask() from the shared workspace API directly.
 */

import path from "path";
import { resolveFactoryRoot } from "../lib/factory-root.ts";
import { moveTask } from "../lib/workspace.ts";
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

/**
 * Build the tsx invocation for this command.
 * Kept for backward compatibility — new callers should use moveTask() directly.
 */
export function buildInvocation(args: TaskMoveArgs): string[] {
  return buildTsxInvocation("scripts/task-move.ts", ["--task", args.task, "--to", args.to]);
}

/** Execute the command via the shared workspace API, returning the process exit code. */
export function run(args: TaskMoveArgs): number {
  const { root: factoryRoot } = resolveFactoryRoot();
  const result = moveTask(args, { factoryRoot });

  const SEP = "=".repeat(56);
  console.log(`\n${SEP}`);
  console.log("  TASK-MOVE");
  console.log(`  File: ${args.task}`);
  console.log(`  To:   ${args.to}`);
  console.log(SEP);

  if (!result.ok) {
    console.error(`\n[task-move] ${result.error}`);
    if (result.validationErrors?.length) {
      result.validationErrors.forEach((e) => console.error(`  - ${e}`));
    }
    console.error(`\n${SEP}\n`);
    return 1;
  }

  const relFrom = path.relative(factoryRoot, result.fromPath);
  const relTo = path.relative(factoryRoot, result.toPath);
  console.log(`\n[task-move] Moved: ${relFrom} → ${relTo}`);
  console.log(`\n${SEP}\n`);
  return 0;
}
