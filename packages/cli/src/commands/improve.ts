/**
 * packages/cli/src/commands/improve.ts
 *
 * `devory improve` — compute one live improvement signal and persist the result.
 * Delegates to `scripts/improve.ts` via spawn.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "improve";
export const USAGE =
  "devory improve --type <drift|compliance|refactor|doctrine>";

export const SIGNAL_TYPES = [
  "drift",
  "compliance",
  "refactor",
  "doctrine",
] as const;

export type ImproveSignalType = (typeof SIGNAL_TYPES)[number];

export interface ImproveArgs {
  type: ImproveSignalType;
}

export function parseArgs(
  argv: string[]
): { args: ImproveArgs; error: null } | { args: null; error: string } {
  let type: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--type" && i + 1 < argv.length) {
      type = argv[++i];
    }
  }

  if (!type) {
    return { args: null, error: "--type is required" };
  }

  if (!SIGNAL_TYPES.includes(type as ImproveSignalType)) {
    return {
      args: null,
      error: `--type must be one of: ${SIGNAL_TYPES.join(", ")}`,
    };
  }

  return {
    args: { type: type as ImproveSignalType },
    error: null,
  };
}

export function buildInvocation(args: ImproveArgs): string[] {
  return buildTsxInvocation("scripts/improve.ts", ["--type", args.type]);
}

export function run(args: ImproveArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
