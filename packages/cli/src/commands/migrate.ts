/**
 * packages/cli/src/commands/migrate.ts
 *
 * `devory migrate --to-governance-repo` — copy existing local artifacts into a
 * bound governance repo without deleting the originals.
 *
 * Task: factory-385
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { GovernanceRepoBinding, GovernanceRepoConfig, TaskStage } from "@devory/core";

const GOVERNANCE_CONFIG_DIR = ".devory-governance";
const GOVERNANCE_CONFIG_FILE = "config.json";
const BINDING_DIR = ".devory";
const BINDING_FILE = "governance.json";
const TASK_STAGES: TaskStage[] = ["backlog", "ready", "doing", "review", "blocked", "archived", "done"];
type ExecFileSyncLike = typeof execFileSync;
let execGitFileSync: ExecFileSyncLike = execFileSync;

export const NAME = "migrate";
export const USAGE = "devory migrate --to-governance-repo [--dry-run] [--confirm]";

export interface MigrateArgs {
  toGovernanceRepo: boolean;
  dryRun: boolean;
  confirm: boolean;
  workingRepoPath: string;
}

interface MigrationPlanEntry {
  src: string;
  dest: string;
}

interface CopyPlan {
  label: string;
  entries: MigrationPlanEntry[];
}

interface MigrationCategoryResult {
  label: string;
  copied: number;
  skippedIdentical: number;
  warnings: string[];
}

export function parseArgs(
  argv: string[],
): { args?: MigrateArgs; error: string | null } {
  let toGovernanceRepo = false;
  let dryRun = false;
  let confirm = false;

  for (const token of argv) {
    if (token === "--to-governance-repo") {
      toGovernanceRepo = true;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--confirm") {
      confirm = true;
      continue;
    }
    return { error: `Unknown flag: ${token}` };
  }

  if (!toGovernanceRepo) {
    return { error: "--to-governance-repo is required" };
  }

  return {
    args: {
      toGovernanceRepo,
      dryRun,
      confirm,
      workingRepoPath: process.cwd(),
    },
    error: null,
  };
}

export function setGitExecFileSyncForTesting(next?: ExecFileSyncLike): void {
  execGitFileSync = next ?? execFileSync;
}

function loadBinding(workingRepoPath: string): GovernanceRepoBinding {
  const bindingPath = path.join(workingRepoPath, BINDING_DIR, BINDING_FILE);
  if (!fs.existsSync(bindingPath)) {
    throw new Error(
      `Governance repo is not bound for this working repo.\nExpected binding at: ${bindingPath}\nRun \`devory governance bind --governance-repo <path>\` first.`,
    );
  }

  try {
    return JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
  } catch {
    throw new Error(`Could not read governance binding at ${bindingPath}`);
  }
}

function loadGovernanceConfig(governanceRepoPath: string): GovernanceRepoConfig {
  const configPath = path.join(governanceRepoPath, GOVERNANCE_CONFIG_DIR, GOVERNANCE_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Governance repo has not been initialized.\nExpected config at: ${configPath}\nRun \`devory governance init --dir ${governanceRepoPath}\` first.`,
    );
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as GovernanceRepoConfig;
  } catch {
    throw new Error(`Could not read governance repo config at ${configPath}`);
  }
}

function listFilesRecursive(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }

  return files.sort();
}

function listRunManifestFiles(runsRoot: string): string[] {
  if (!fs.existsSync(runsRoot)) return [];

  const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true });
  const manifests: string[] = [];
  for (const entry of runDirs) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(runsRoot, entry.name, "manifest.json");
    if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) {
      manifests.push(manifestPath);
    }
  }

  return manifests.sort();
}

function buildCopyPlans(workingRepoPath: string, governanceRepoPath: string): CopyPlan[] {
  const taskPlans: CopyPlan[] = TASK_STAGES.map((stage) => {
    const sourceRoot = path.join(workingRepoPath, "tasks", stage);
    const destRoot = path.join(governanceRepoPath, "tasks", stage);
    return {
      label: `tasks/${stage}`,
      entries: listFilesRecursive(sourceRoot).map((src) => ({
        src,
        dest: path.join(destRoot, path.relative(sourceRoot, src)),
      })),
    };
  });

  const doctrineRoot = path.join(workingRepoPath, "doctrine");
  const profilesRoot = path.join(workingRepoPath, "artifacts", "profiles");
  const workspacesRoot = path.join(workingRepoPath, "artifacts", "workspaces");
  const runsRoot = path.join(workingRepoPath, "runs");

  return [
    ...taskPlans,
    {
      label: "doctrine",
      entries: listFilesRecursive(doctrineRoot).map((src) => ({
        src,
        dest: path.join(governanceRepoPath, "doctrine", path.relative(doctrineRoot, src)),
      })),
    },
    {
      label: "profiles",
      entries: listFilesRecursive(profilesRoot).map((src) => ({
        src,
        dest: path.join(governanceRepoPath, "profiles", path.relative(profilesRoot, src)),
      })),
    },
    {
      label: "standards",
      entries: listFilesRecursive(workspacesRoot).map((src) => ({
        src,
        dest: path.join(governanceRepoPath, "standards", path.relative(workspacesRoot, src)),
      })),
    },
    {
      label: "runs",
      entries: listRunManifestFiles(runsRoot).map((src) => ({
        src,
        dest: path.join(governanceRepoPath, "runs", path.relative(runsRoot, src)),
      })),
    },
  ];
}

function filesAreIdentical(a: string, b: string): boolean {
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function printDirtyWorkingTreeWarning(workingRepoPath: string): void {
  if (!fs.existsSync(path.join(workingRepoPath, ".git"))) return;

  try {
    const output = execGitFileSync(
      "git",
      ["status", "--porcelain", "--", "tasks", "doctrine"],
      { cwd: workingRepoPath, encoding: "utf-8" },
    ).trim();
    if (output) {
      console.warn(
        "Warning: working repo has uncommitted changes under tasks/ or doctrine/. Migration is additive, but you may want to commit first.",
      );
    }
  } catch {
    // Non-fatal: pre-flight warning only.
  }
}

function printDryRunSummary(plans: CopyPlan[], governanceRepoPath: string): void {
  console.log(`Dry-run: would migrate artifacts into ${governanceRepoPath}`);
  console.log("");
  for (const plan of plans) {
    console.log(`${plan.label}: ${plan.entries.length} file(s)`);
  }
  console.log("");
  console.log("No files were written. Re-run with --confirm to apply the migration.");
}

function copyPlan(plan: CopyPlan): MigrationCategoryResult {
  const result: MigrationCategoryResult = {
    label: plan.label,
    copied: 0,
    skippedIdentical: 0,
    warnings: [],
  };

  for (const entry of plan.entries) {
    if (fs.existsSync(entry.dest)) {
      if (filesAreIdentical(entry.src, entry.dest)) {
        result.skippedIdentical += 1;
        continue;
      }
      result.warnings.push(`Skipped differing file: ${entry.dest} (source: ${entry.src})`);
      continue;
    }

    fs.mkdirSync(path.dirname(entry.dest), { recursive: true });
    fs.copyFileSync(entry.src, entry.dest);
    result.copied += 1;
  }

  return result;
}

function commitCopiedFiles(governanceRepoPath: string, workingRepoPath: string): boolean {
  execGitFileSync("git", ["add", "--all"], { cwd: governanceRepoPath });
  const staged = execGitFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd: governanceRepoPath,
    encoding: "utf-8",
  }).trim();

  if (!staged) return false;

  execGitFileSync(
    "git",
    [
      "commit",
      "-m",
      "chore(migration): import existing artifacts from working repo",
      "-m",
      `Devory-Source: migration-tool\nDevory-Working-Repo: ${workingRepoPath}`,
    ],
    { cwd: governanceRepoPath, stdio: "ignore" },
  );

  return true;
}

function printExecutionSummary(results: MigrationCategoryResult[]): void {
  const summary = {
    tasks: 0,
    doctrine: 0,
    profiles: 0,
    standards: 0,
    runs: 0,
  };

  for (const result of results) {
    if (result.label.startsWith("tasks/")) summary.tasks += result.copied;
    if (result.label === "doctrine") summary.doctrine = result.copied;
    if (result.label === "profiles") summary.profiles = result.copied;
    if (result.label === "standards") summary.standards = result.copied;
    if (result.label === "runs") summary.runs = result.copied;
  }

  console.log(
    `Migrated ${summary.tasks} tasks, ${summary.doctrine} doctrine files, ${summary.profiles} profiles, ${summary.runs} runs.`,
  );
  console.log(`Migrated ${summary.standards} workspace standards files.`);
  console.log(
    'Next step: enable governance mode: add `{"governance_repo_enabled": true}` to `.devory/feature-flags.json`',
  );
}

export function run(args: MigrateArgs): number {
  try {
    const binding = loadBinding(args.workingRepoPath);
    const config = loadGovernanceConfig(binding.governance_repo_path);

    if (binding.workspace_id !== config.workspace_id) {
      console.warn(
        `Warning: binding workspace_id (${binding.workspace_id}) does not match governance repo config (${config.workspace_id}).`,
      );
    }

    printDirtyWorkingTreeWarning(args.workingRepoPath);

    const plans = buildCopyPlans(args.workingRepoPath, binding.governance_repo_path);

    if (args.dryRun) {
      printDryRunSummary(plans, binding.governance_repo_path);
      return 0;
    }

    if (!args.confirm) {
      console.error("Refusing to migrate without --confirm. Use --dry-run to preview changes.");
      return 1;
    }

    const results = plans.map(copyPlan);
    const committed = commitCopiedFiles(binding.governance_repo_path, args.workingRepoPath);

    for (const result of results) {
      for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`);
      }
      if (result.skippedIdentical > 0) {
        console.log(`${result.label}: skipped ${result.skippedIdentical} identical file(s).`);
      }
    }

    if (!committed) {
      console.log("No new files were copied. Governance repo already contains the same artifacts.");
      return 0;
    }

    printExecutionSummary(results);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 1;
  }
}
