/**
 * packages/cli/src/commands/run.ts
 *
 * `devory run` — run a single factory orchestrator pass.
 * Delegates to `scripts/factory-run.ts` via spawn.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { loadFeatureFlags } from "@devory/core";
import { resolveFactoryRoot } from "../lib/factory-root.ts";
import { buildTsxInvocation } from "../lib/tsx.ts";

export const NAME = "run";
export const USAGE =
  "devory run [--limit <n>] [--resume <run-id>] [--dry-run] [--validate]";

export interface RunArgs {
  limit?: number;
  /** Run ID to resume. When set, factory-run is invoked with --resume <id>. */
  resumeId?: string;
  dryRun: boolean;
  validate: boolean;
}

export function parseArgs(
  argv: string[]
): { args: RunArgs; error: null } | { args: null; error: string } {
  const raw: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--dry-run" || tok === "--validate") {
      raw[tok.slice(2)] = true;
    } else if (tok.startsWith("--") && i + 1 < argv.length) {
      raw[tok.slice(2)] = argv[++i];
    }
  }

  const limitRaw = raw["limit"];
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    limit = Number(limitRaw);
    if (isNaN(limit) || limit < 1) {
      return { args: null, error: "--limit must be a positive integer" };
    }
  }

  return {
    args: {
      limit,
      resumeId: typeof raw["resume"] === "string" ? raw["resume"] : undefined,
      dryRun: raw["dry-run"] === true,
      validate: raw["validate"] === true,
    },
    error: null,
  };
}

export function buildInvocation(args: RunArgs): string[] {
  const argv: string[] = [];
  if (args.limit !== undefined) argv.push("--limit", String(args.limit));
  if (args.resumeId) argv.push("--resume", args.resumeId);
  if (args.dryRun) argv.push("--dry-run");
  if (args.validate) argv.push("--validate");
  return buildTsxInvocation("scripts/factory-run.ts", argv);
}

export function buildGovernanceRunNotice(factoryRoot: string): string | null {
  const { flags } = loadFeatureFlags(factoryRoot);
  if (!flags.governance_repo_enabled) {
    return null;
  }

  const bindingPath = path.join(factoryRoot, ".devory", "governance.json");
  if (!fs.existsSync(bindingPath)) {
    return null;
  }

  return [
    "[devory run] Governance mode is active.",
    "This command runs one orchestrator pass and does not poll governance commands.",
    "Use `devory worker` for pause/resume/approve/override command polling.",
  ].join(" ");
}

export function run(args: RunArgs): number {
  const { root: factoryRoot } = resolveFactoryRoot();
  const governanceNotice = buildGovernanceRunNotice(factoryRoot);
  if (governanceNotice) {
    console.log(governanceNotice);
  }

  const [cmd, ...rest] = buildInvocation(args);
  const result = spawnSync(cmd, rest, { stdio: "inherit" });
  return result.status ?? 1;
}
