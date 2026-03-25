/**
 * packages/cli/src/commands/task-validate.ts
 *
 * `devory task validate` — validate task frontmatter.
 * Delegates to `scripts/validate-task.ts` via spawn.
 *
 * Modes (mirror the underlying script):
 *   --file <path>    validate a single file
 *   --folder <path>  validate all tasks in a folder
 *   --root <path>    validate entire lifecycle tree
 *   --status <s>     expected status override
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "task validate";
export const USAGE =
  "devory task validate [--file <file>] [--folder <folder>] [--root <dir>] [--status <status>] [--strict]";

export interface TaskValidateArgs {
  file?: string;
  folder?: string;
  root?: string;
  status?: string;
  strict?: boolean;
}

export function parseArgs(
  argv: string[]
): { args: TaskValidateArgs; error: null } | { args: null; error: string } {
  const raw: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--strict") {
      raw["strict"] = true;
    } else if (tok.startsWith("--") && i + 1 < argv.length) {
      raw[tok.slice(2)] = argv[++i];
    }
  }

  if (!raw["file"] && !raw["folder"] && !raw["root"]) {
    return {
      args: null,
      error: "Provide at least one of: --file, --folder, --root",
    };
  }

  return {
    args: {
      file: typeof raw["file"] === "string" ? raw["file"] : undefined,
      folder: typeof raw["folder"] === "string" ? raw["folder"] : undefined,
      root: typeof raw["root"] === "string" ? raw["root"] : undefined,
      status: typeof raw["status"] === "string" ? raw["status"] : undefined,
      strict: raw["strict"] === true,
    },
    error: null,
  };
}

export function buildInvocation(args: TaskValidateArgs): string[] {
  const argv: string[] = [];
  if (args.file) argv.push("--file", args.file);
  if (args.folder) argv.push("--folder", args.folder);
  if (args.root) argv.push("--root", args.root);
  if (args.status) argv.push("--status", args.status);
  if (args.strict) argv.push("--strict");
  return buildTsxInvocation("scripts/validate-task.ts", argv);
}

export function run(args: TaskValidateArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
