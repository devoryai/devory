/**
 * packages/cli/src/commands/doctor.ts
 *
 * `devory doctor` — check local factory health across workspace structure,
 * task directories, standards/config presence, license state, and runtime
 * configuration.
 *
 * Reuses individual check functions from the narrower `diagnostics` command
 * where applicable. Use `devory diagnostics` for self-hosted runtime checks
 * (engine mode, Ollama connectivity).
 *
 * The command is read-only: it does not write to any file or move any task.
 */

import * as fs from "fs";
import * as path from "path";

import { resolveFactoryRoot, type FactoryRootSource } from "../lib/factory-root.ts";
import {
  checkFactoryRoot,
  checkContextFile,
  checkLicense,
  type CheckResult,
  type CheckStatus,
  type DiagnosticsReport,
  formatReport,
} from "./diagnostics.ts";

export const NAME = "doctor";
export const USAGE = "devory doctor [--root <dir>]";

export interface DoctorArgs {
  root?: string;
}

// Re-export shared types so consumers of this module get a complete picture
export type { CheckResult, CheckStatus };

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): { args?: DoctorArgs; error: string | null } {
  let root: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      root = argv[++i];
      if (!root) return { error: "--root requires a value" };
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }

  return { args: { root }, error: null };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

const EXPECTED_STAGES = ["backlog", "ready", "doing", "review", "done", "blocked", "archived"] as const;

export function checkTaskStages(root: string): CheckResult {
  const tasksDir = path.join(root, "tasks");
  if (!fs.existsSync(tasksDir)) {
    return {
      label: "Task stage dirs",
      status: "fail",
      detail: "tasks/ not found — run `devory init` to scaffold the workspace",
    };
  }

  const missing: string[] = [];
  for (const stage of EXPECTED_STAGES) {
    if (!fs.existsSync(path.join(tasksDir, stage))) {
      missing.push(stage);
    }
  }

  if (missing.length === 0) {
    return {
      label: "Task stage dirs",
      status: "pass",
      detail: `all stages present  (${EXPECTED_STAGES.join(", ")})`,
    };
  }

  return {
    label: "Task stage dirs",
    status: "warn",
    detail: `missing stage${missing.length > 1 ? "s" : ""}: ${missing.join(", ")} — run \`devory init\` to create them`,
  };
}

export function checkStandardsFile(root: string): CheckResult {
  const standardsPath = path.join(root, "devory.standards.yml");
  if (fs.existsSync(standardsPath)) {
    return {
      label: "devory.standards.yml",
      status: "pass",
      detail: "found",
    };
  }
  return {
    label: "devory.standards.yml",
    status: "warn",
    detail: "not found — run `devory init` to create a starter config, or create it manually",
  };
}

export function checkRuntimeConfig(): CheckResult {
  const explicit = process.env.DEVORY_FACTORY_ROOT?.trim() ?? process.env.FACTORY_ROOT?.trim() ?? "";
  const mode = process.env.DEVORY_FACTORY_MODE?.trim() ?? "local";

  if (explicit) {
    return {
      label: "Runtime config",
      status: "pass",
      detail: `root: ${explicit}  mode: ${mode}`,
    };
  }

  return {
    label: "Runtime config",
    status: "warn",
    detail: `DEVORY_FACTORY_ROOT not set — root resolved via git-walk or cwd  mode: ${mode}`,
  };
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

export async function runChecks(
  factoryRoot: string,
  source: FactoryRootSource
): Promise<DiagnosticsReport> {
  const rootCheck = checkFactoryRoot(factoryRoot, source);
  const contextCheck = checkContextFile(factoryRoot);
  const stagesCheck = checkTaskStages(factoryRoot);
  const standardsCheck = checkStandardsFile(factoryRoot);
  const licenseCheck = await checkLicense(factoryRoot);
  const runtimeCheck = checkRuntimeConfig();

  return {
    checks: [rootCheck, contextCheck, stagesCheck, standardsCheck, licenseCheck, runtimeCheck],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function run(args: DoctorArgs): Promise<number> {
  const startDir = args.root ? path.resolve(args.root) : process.cwd();
  const { root, source } = resolveFactoryRoot(startDir);

  const report = await runChecks(root, source);
  console.log(formatReport(report));

  const anyFail = report.checks.some((c) => c.status === "fail");
  return anyFail ? 1 : 0;
}
