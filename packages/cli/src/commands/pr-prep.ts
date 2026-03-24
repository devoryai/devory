/**
 * packages/cli/src/commands/pr-prep.ts
 *
 * `devory pr-prep` — generate branch name, commit message, and PR description
 * from a task file. Delegates to `scripts/pr-preparer.ts`.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "pr-prep";
export const USAGE =
  "devory pr-prep [<task-file>] [--dry-run]";

export interface PrPrepArgs {
  /** Relative or absolute path to the task file. Defaults to first file in tasks/review/. */
  file?: string;
  dryRun: boolean;
}

export function parseArgs(
  argv: string[]
): { args: PrPrepArgs; error: null } | { args: null; error: string } {
  let file: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--dry-run") {
      dryRun = true;
    } else if (tok.startsWith("--")) {
      return { args: null, error: `Unknown flag: ${tok}` };
    } else if (!file) {
      file = tok;
    } else {
      return { args: null, error: "Only one file path argument is accepted" };
    }
  }

  return { args: { file, dryRun }, error: null };
}

export function buildInvocation(args: PrPrepArgs): string[] {
  const argv: string[] = [];
  if (args.file) argv.push(args.file);
  if (args.dryRun) argv.push("--dry-run");
  return buildTsxInvocation("scripts/pr-preparer.ts", argv);
}

export function run(args: PrPrepArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
