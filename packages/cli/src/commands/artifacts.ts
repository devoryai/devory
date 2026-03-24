/**
 * packages/cli/src/commands/artifacts.ts
 *
 * `devory artifacts` — build or inspect the run artifact index.
 * Delegates to `scripts/build-artifact-index.ts` via spawn.
 */

import { spawnSync } from "child_process";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "artifacts";
export const USAGE = "devory artifacts";

export interface ArtifactsArgs {}

export function parseArgs(
  _argv: string[]
): { args: ArtifactsArgs; error: null } {
  return { args: {}, error: null };
}

export function buildInvocation(_args: ArtifactsArgs): string[] {
  return buildTsxInvocation("scripts/build-artifact-index.ts");
}

export function run(args: ArtifactsArgs): number {
  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
