/**
 * packages/cli/src/commands/worker.ts
 *
 * `devory worker` — start the factory worker loop.
 * Delegates to `workers/factory-worker.ts` via spawn.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "worker";
export const USAGE = "devory worker";

export interface WorkerArgs {}

export function parseArgs(
  _argv: string[]
): { args: WorkerArgs; error: null } {
  return { args: {}, error: null };
}

export function buildInvocation(_args: WorkerArgs): string[] {
  return buildTsxInvocation("workers/factory-worker.ts");
}

export function run(args: WorkerArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
