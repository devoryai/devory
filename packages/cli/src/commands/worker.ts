/**
 * packages/cli/src/commands/worker.ts
 *
 * `devory worker` — start the factory worker loop that polls governance commands.
 * Delegates to `scripts/factory-worker.ts` via spawn.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";
import { resolveFactoryRoot } from "../lib/factory-root.ts";

export const NAME = "worker";
export const USAGE = "devory worker";

export interface WorkerArgs {
  passthrough: string[];
}

export function parseArgs(
  argv: string[]
): { args: WorkerArgs; error: null } {
  return { args: { passthrough: [...argv] }, error: null };
}

export function buildInvocation(args: WorkerArgs): string[] {
  return buildTsxInvocation("scripts/factory-worker.ts", args.passthrough);
}

export function run(args: WorkerArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const factoryRoot = resolveFactoryRoot().root;
  const result = spawnSync(cmd, rest, {
    stdio: "inherit",
    env: {
      ...process.env,
      DEVORY_FACTORY_ROOT: factoryRoot,
      DEVORY_RUNTIME_ROOT: factoryRoot,
    },
  });
  return result.status ?? 1;
}
