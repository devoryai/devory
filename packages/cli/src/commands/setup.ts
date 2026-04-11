/**
 * packages/cli/src/commands/setup.ts
 *
 * `devory setup` — guided one-command onboarding for governance mode.
 *
 * Walks a developer through every step needed to activate governance mode:
 *   1. Governance repo — initialize a new one or point to an existing one
 *   2. Workspace ID — confirm or provide
 *   3. Bind — link the working repo to the governance repo
 *   4. Feature flag — write .devory/feature-flags.json
 *   5. Doctor check — verify the full configuration is active
 *   6. Summary — print the exact next command to run
 *
 * Non-interactive (scriptable) mode:
 *   devory setup --governance-repo <path> [--workspace-id <id>] [--enable-governance] [--migrate-tasks]
 *
 * All file-writing operations are delegated to runInit and runBind from
 * governance.ts. No business logic is duplicated here.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import type { TaskStage } from "@devory/core";
import { GovernanceRepoLayout } from "../../../../workers/lib/governance-repo-layout.ts";
import { GitGovernanceService } from "../../../../workers/lib/git-governance-service.ts";
import {
  runInit,
  runBind,
  runDoctor,
  evaluateCloudCommandReadiness,
  formatCloudCommandReadinessLine,
  type GovernanceInitArgs,
  type GovernanceBindArgs,
  type GovernanceDoctorArgs,
} from "./governance.ts";

// ---------------------------------------------------------------------------
// Constants (kept in sync with governance.ts values)
// ---------------------------------------------------------------------------

const BINDING_DIR = ".devory";
const BINDING_FILE = "governance.json";
const FLAGS_FILE = "feature-flags.json";
const GOVERNANCE_CONFIG_DIR = ".devory-governance";
const GOVERNANCE_CONFIG_FILE = "config.json";
const TASK_STAGES: TaskStage[] = ["backlog", "ready", "doing", "review", "blocked", "archived", "done"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const NAME = "setup";
export const USAGE =
  "devory setup [--governance-repo <path>] [--workspace-id <id>] [--enable-governance] [--migrate-tasks]";

export interface SetupArgs {
  /** Path to the governance repo. If absent → prompt. */
  governanceRepoPath?: string;
  /** Workspace ID. If absent → prompt or derive from dir name. */
  workspaceId?: string;
  /** Whether to write the feature-flags.json immediately (non-interactive). */
  enableGovernance: boolean;
  /** Whether to migrate task files into the governance repo during setup. */
  migrateTasks: boolean;
  /** Working repo path. Defaults to cwd. */
  workingRepoPath: string;
  /** True when --governance-repo was supplied; skip interactive prompts. */
  nonInteractive: boolean;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export function parseArgs(
  argv: string[],
): { args: SetupArgs; error: null } | { args: null; error: string } {
  let governanceRepoPath: string | undefined;
  let workspaceId: string | undefined;
  let enableGovernance = false;
  let migrateTasks = false;
  const workingRepoPath = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--governance-repo" && i + 1 < argv.length) {
      governanceRepoPath = path.resolve(argv[++i]);
    } else if (arg === "--workspace-id" && i + 1 < argv.length) {
      workspaceId = argv[++i];
    } else if (arg === "--enable-governance") {
      enableGovernance = true;
    } else if (arg === "--migrate-tasks") {
      migrateTasks = true;
    } else if (arg === "--help" || arg === "-h") {
      return { args: null, error: "" }; // handled by caller
    } else {
      return { args: null, error: `Unknown flag: ${arg}` };
    }
  }

  const nonInteractive = governanceRepoPath !== undefined;

  return {
    args: {
      governanceRepoPath,
      workspaceId,
      enableGovernance,
      migrateTasks,
      workingRepoPath,
      nonInteractive,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGovernanceRepo(dirPath: string): boolean {
  return fs.existsSync(
    path.join(dirPath, GOVERNANCE_CONFIG_DIR, GOVERNANCE_CONFIG_FILE),
  );
}

function readBinding(
  workingRepoPath: string,
): { governance_repo_path: string; workspace_id: string } | null {
  const bindingPath = path.join(workingRepoPath, BINDING_DIR, BINDING_FILE);
  if (!fs.existsSync(bindingPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as {
      governance_repo_path: string;
      workspace_id: string;
    };
  } catch {
    return null;
  }
}

function isFlagEnabled(workingRepoPath: string): boolean {
  try {
    const flagsPath = path.join(workingRepoPath, BINDING_DIR, FLAGS_FILE);
    if (!fs.existsSync(flagsPath)) return false;
    const flags = JSON.parse(fs.readFileSync(flagsPath, "utf-8")) as Record<string, unknown>;
    return flags.governance_repo_enabled === true;
  } catch {
    return false;
  }
}

function writeFlagFile(workingRepoPath: string): void {
  const flagsPath = path.join(workingRepoPath, BINDING_DIR, FLAGS_FILE);
  fs.mkdirSync(path.join(workingRepoPath, BINDING_DIR), { recursive: true });
  fs.writeFileSync(flagsPath, JSON.stringify({ governance_repo_enabled: true }, null, 2) + "\n", "utf-8");
}

function defaultGovRepoPath(workingRepoPath: string): string {
  const parent = path.dirname(workingRepoPath);
  const base = path.basename(workingRepoPath);
  return path.join(parent, `${base}-governance`);
}

function deriveWorkspaceId(govRepoPath: string): string {
  return path.basename(govRepoPath).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

export {
  defaultGovRepoPath,
  deriveWorkspaceId,
  isFlagEnabled,
  isGovernanceRepo,
  readBinding,
  writeFlagFile,
};

function printSection(title: string): void {
  const SEP = "─".repeat(52);
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function printBox(lines: string[]): void {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const border = "─".repeat(width);
  console.log(`\n╭${border}╮`);
  for (const line of lines) {
    console.log(`│  ${line.padEnd(width - 2)}  │`);
  }
  console.log(`╰${border}╯`);
}

async function prompt(
  rl: readline.Interface,
  question: string,
  defaultValue: string,
): Promise<string> {
  const answer = await rl.question(`${question} [${defaultValue}]: `);
  const trimmed = answer.trim();
  return trimmed === "" ? defaultValue : trimmed;
}

async function promptYesNo(
  rl: readline.Interface,
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await rl.question(`${question} (${hint}): `);
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "") return defaultYes;
  return trimmed === "y" || trimmed === "yes";
}

interface SetupPromptHandlers {
  prompt: typeof prompt;
  promptYesNo: typeof promptYesNo;
}

let setupPromptHandlers: SetupPromptHandlers = {
  prompt,
  promptYesNo,
};

export function setSetupPromptHandlersForTesting(
  handlers?: Partial<SetupPromptHandlers>,
): void {
  setupPromptHandlers = {
    prompt,
    promptYesNo,
    ...handlers,
  };
}

export interface TaskMigrationResult {
  attempted: boolean;
  copied: number;
  skipped: number;
  committed: boolean;
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

export async function migrateWorkingRepoTasksToGovernanceRepo(
  workingRepoPath: string,
  governanceRepoPath: string,
): Promise<TaskMigrationResult> {
  const layout = new GovernanceRepoLayout(governanceRepoPath);
  const gitService = new GitGovernanceService(governanceRepoPath);
  const copiedPaths: string[] = [];
  let copied = 0;
  let skipped = 0;

  for (const stage of TASK_STAGES) {
    const sourceRoot = path.join(workingRepoPath, "tasks", stage);
    const destRoot = layout.tasksDir(stage);
    for (const sourceFile of listFilesRecursive(sourceRoot)) {
      const destFile = path.join(destRoot, path.relative(sourceRoot, sourceFile));
      if (fs.existsSync(destFile)) {
        skipped += 1;
        continue;
      }
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(sourceFile, destFile);
      copied += 1;
      copiedPaths.push(destFile);
    }
  }

  let committed = false;
  if (copiedPaths.length > 0) {
    for (const copiedPath of copiedPaths) {
      await gitService.stageFile(copiedPath);
    }
    await gitService.commitWithCurrentIdentity(
      "chore(tasks): seed tasks from working repo during setup",
    );
    committed = true;
  }

  return {
    attempted: true,
    copied,
    skipped,
    committed,
  };
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

export async function run(args: SetupArgs): Promise<number> {
  const { workingRepoPath } = args;

  console.log("\nDevory Setup — Governance Mode");
  console.log("═".repeat(52));
  console.log(`Working repo: ${workingRepoPath}`);

  // ── Already fully configured? ─────────────────────────────────────────
  const existingBinding = readBinding(workingRepoPath);
  const alreadyEnabled = isFlagEnabled(workingRepoPath);

  if (existingBinding && isGovernanceRepo(existingBinding.governance_repo_path) && alreadyEnabled) {
    console.log("\nGovernance mode is already configured. Running doctor to confirm status...");
    const doctorExit = runDoctor({ workingRepoPath });
    return doctorExit;
  }

  // ── Collect inputs ────────────────────────────────────────────────────

  let govRepoPath: string;
  let workspaceId: string;
  let enableGovernance: boolean;
  let migrateTasks = args.migrateTasks;
  let migrationResult: TaskMigrationResult = {
    attempted: false,
    copied: 0,
    skipped: 0,
    committed: false,
  };

  if (args.nonInteractive) {
    // ── Non-interactive path ───────────────────────────────────────────
    govRepoPath = args.governanceRepoPath!;
    workspaceId =
      args.workspaceId ??
      (isGovernanceRepo(govRepoPath)
        ? readBinding(workingRepoPath)?.workspace_id ?? deriveWorkspaceId(govRepoPath)
        : deriveWorkspaceId(govRepoPath));
    enableGovernance = args.enableGovernance;
    migrateTasks = args.migrateTasks;
    console.log(`\nNon-interactive mode.`);
    console.log(`  Governance repo: ${govRepoPath}`);
    console.log(`  Workspace ID:    ${workspaceId}`);
    console.log(`  Enable flag:     ${enableGovernance}`);
    console.log(`  Migrate tasks:   ${migrateTasks}`);
  } else {
    // ── Interactive path ───────────────────────────────────────────────
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log(
      "\nThis wizard will configure governance mode in a few steps.\n" +
      "Press Enter to accept defaults.\n",
    );

    try {
      // Step 1: governance repo path
      const defaultGovPath =
        existingBinding?.governance_repo_path ?? defaultGovRepoPath(workingRepoPath);

      govRepoPath = await setupPromptHandlers.prompt(
        rl,
        "Governance repo path (will be created if it does not exist)",
        defaultGovPath,
      );
      govRepoPath = path.resolve(govRepoPath);

      // Step 2: workspace ID
      const defaultWsId =
        existingBinding?.workspace_id ?? deriveWorkspaceId(govRepoPath);
      workspaceId = await setupPromptHandlers.prompt(rl, "Workspace ID", defaultWsId);

      // Step 3: enable flag
      enableGovernance = await setupPromptHandlers.promptYesNo(
        rl,
        "Enable governance mode now?",
        true,
      );
    } finally {
      rl.close();
    }
  }

  // ── Step 1: Init governance repo (if needed) ─────────────────────────

  if (!isGovernanceRepo(govRepoPath)) {
    printSection("Step 1 of 4: Initializing governance repo");
    const initArgs: GovernanceInitArgs = {
      dir: govRepoPath,
      workspaceId,
      force: false,
      dryRun: false,
    };
    const initExit = runInit(initArgs);
    if (initExit !== 0) {
      console.error("\nSetup failed at governance repo initialization.");
      return 1;
    }
  } else {
    console.log(`\n✓ Governance repo already exists at ${govRepoPath}`);
  }

  // ── Step 2: Bind ──────────────────────────────────────────────────────

  const currentBinding = readBinding(workingRepoPath);
  const alreadyBoundToSame =
    currentBinding?.governance_repo_path === govRepoPath;

  if (!alreadyBoundToSame) {
    printSection("Step 2 of 4: Binding working repo");
    const bindArgs: GovernanceBindArgs = {
      governanceRepoPath: govRepoPath,
      workspaceId,
      workingRepoPath,
    };
    const bindExit = runBind(bindArgs);
    if (bindExit !== 0) {
      console.error("\nSetup failed at governance repo binding.");
      return 1;
    }
  } else {
    console.log(`\n✓ Working repo already bound to ${govRepoPath}`);
  }

  if (!args.nonInteractive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      migrateTasks = await setupPromptHandlers.promptYesNo(
        rl,
        "Copy existing tasks from this working repo into the governance repo now?",
        false,
      );
    } finally {
      rl.close();
    }
  }

  if (migrateTasks) {
    printSection("Step 3 of 4: Migrating task files");
    migrationResult = await migrateWorkingRepoTasksToGovernanceRepo(workingRepoPath, govRepoPath);
    console.log(`Copied ${migrationResult.copied} task file(s).`);
    console.log(`Skipped ${migrationResult.skipped} existing task file(s).`);
    if (migrationResult.committed) {
      console.log("Committed migrated task files in the governance repo.");
    } else {
      console.log("No new task files were copied, so no governance repo commit was created.");
    }
  } else {
    console.log("\n✓ Task migration skipped");
  }

  // ── Step 3: Feature flag ──────────────────────────────────────────────

  if (enableGovernance) {
    if (!isFlagEnabled(workingRepoPath)) {
      printSection("Step 4 of 4: Enabling governance mode");
      writeFlagFile(workingRepoPath);
      const flagsPath = path.join(workingRepoPath, BINDING_DIR, FLAGS_FILE);
      console.log(`Wrote ${flagsPath}`);
      console.log(`  governance_repo_enabled: true`);
    } else {
      console.log(`\n✓ Feature flag already set (governance_repo_enabled: true)`);
    }
  } else {
    console.log(
      `\n⚠ Feature flag not enabled. Governance mode will stay inactive until you run:\n` +
      `  echo '{"governance_repo_enabled":true}' > ${path.join(workingRepoPath, BINDING_DIR, FLAGS_FILE)}`,
    );
  }

  // ── Doctor check ──────────────────────────────────────────────────────

  printSection("Verifying configuration");
  const doctorArgs: GovernanceDoctorArgs = { workingRepoPath };
  const doctorExit = runDoctor(doctorArgs);

  // ── Final summary ─────────────────────────────────────────────────────

  if (doctorExit === 0) {
    const cloudCommandsLine = formatCloudCommandReadinessLine(evaluateCloudCommandReadiness());
    const nextCmd = "devory run --dry-run";
    const migrationStatus =
      !migrationResult.attempted
        ? "no"
        : migrationResult.copied > 0
          ? "yes"
          : "no new files copied";
    printBox([
      "Governance mode is ACTIVE.",
      "",
      `Governance repo: ${govRepoPath}`,
      `Workspace ID:    ${workspaceId}`,
      cloudCommandsLine,
      `Tasks migrated:  ${migrationStatus}`,
      `Task files:      copied ${migrationResult.copied}, skipped ${migrationResult.skipped}`,
      "",
      "Next command:",
      `  ${nextCmd}`,
      "",
      "The first line of orchestrator output should be:",
      `  [orchestrator] governance mode: ON — task moves will be`,
      `  committed to ${govRepoPath}`,
      "",
      "To verify commits after a run:",
      `  git -C ${govRepoPath} log --oneline -5`,
    ]);
    return 0;
  }

  // Doctor reported problems — it already printed the details.
  const cloudCommandsLine = formatCloudCommandReadinessLine(evaluateCloudCommandReadiness());
  console.log(
    "\nSetup completed with warnings. Run `devory governance doctor` to see what is missing.",
  );
  console.log(cloudCommandsLine);
  return 1;
}
