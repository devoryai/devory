/**
 * packages/cli/src/commands/governance.ts
 *
 * `devory governance init` — scaffold a new governance repo
 * `devory governance bind` — bind a working repo to an existing governance repo
 *
 * Spec: docs/adr/0010-governance-repo-structure.md
 * Task: factory-362
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { execSync, execFileSync } from "child_process";
import type {
  ActiveDevoryState,
  GovernanceCommandEnvelope,
  GovernanceRepoBinding,
  GovernanceRepoConfig,
} from "@devory/core";
import {
  buildDefaultActiveState,
  evaluateGovernanceCommandTransport,
  loadFeatureFlags,
  normalizeActiveDevoryState,
  validateGovernanceCommandEnvelope,
} from "@devory/core";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const GOVERNANCE_CONFIG_DIR = ".devory-governance";
const GOVERNANCE_CONFIG_FILE = "config.json";
const BINDING_DIR = ".devory";
const BINDING_FILE = "governance.json";
const LOCAL_COMMAND_QUEUE_DIR = "commands";
const LOCAL_COMMAND_PENDING_DIR = "pending";
const LOCAL_COMMAND_PROCESSED_DIR = "processed";
const LOCAL_COMMAND_FAILED_DIR = "failed";

const TASK_STAGES = ["backlog", "ready", "doing", "review", "blocked", "archived", "done"] as const;

function getLocalCommandQueuePaths(workingRepoPath: string) {
  const root = path.join(workingRepoPath, BINDING_DIR, LOCAL_COMMAND_QUEUE_DIR);
  return {
    root,
    pending: path.join(root, LOCAL_COMMAND_PENDING_DIR),
    processed: path.join(root, LOCAL_COMMAND_PROCESSED_DIR),
    failed: path.join(root, LOCAL_COMMAND_FAILED_DIR),
  };
}

function ensureLocalCommandQueue(workingRepoPath: string): void {
  const paths = getLocalCommandQueuePaths(workingRepoPath);
  fs.mkdirSync(paths.pending, { recursive: true });
  fs.mkdirSync(paths.processed, { recursive: true });
  fs.mkdirSync(paths.failed, { recursive: true });
}

function buildLocalCommandId(): string {
  return `local-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function readActiveState(workingRepoPath: string): ActiveDevoryState {
  const filePath = path.join(workingRepoPath, ".devory", "active-state.json");
  if (!fs.existsSync(filePath)) {
    return buildDefaultActiveState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeActiveDevoryState(parsed) ?? buildDefaultActiveState();
  } catch {
    return buildDefaultActiveState();
  }
}

// ---------------------------------------------------------------------------
// devory governance init
// ---------------------------------------------------------------------------

export const INIT_NAME = "governance init";
export const INIT_USAGE =
  "devory governance init [--dir <path>] [--workspace-id <id>] [--force] [--dry-run]";

export interface GovernanceInitArgs {
  dir: string;
  workspaceId: string;
  force: boolean;
  dryRun: boolean;
}

export function parseInitArgs(
  argv: string[],
): { args: GovernanceInitArgs; error: null } | { args: null; error: string } {
  let dir = process.cwd();
  let workspaceId = path.basename(process.cwd()).replace(/[^a-z0-9-]/gi, "-");
  let force = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") {
      force = true;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    } else if (argv[i] === "--dir" && i + 1 < argv.length) {
      dir = path.resolve(argv[++i]);
    } else if (argv[i] === "--workspace-id" && i + 1 < argv.length) {
      workspaceId = argv[++i];
    }
  }

  return { args: { dir, workspaceId, force, dryRun }, error: null };
}

function buildInitDirectories(rootDir: string): string[] {
  return [
    path.join(rootDir, GOVERNANCE_CONFIG_DIR),
    ...TASK_STAGES.map((s) => path.join(rootDir, "tasks", s)),
    path.join(rootDir, "doctrine"),
    path.join(rootDir, "standards"),
    path.join(rootDir, "profiles"),
    path.join(rootDir, "runs"),
    path.join(rootDir, "reviews"),
    path.join(rootDir, "questions"),
    path.join(rootDir, "audit"),
    path.join(rootDir, "commands"),
  ];
}

export function runInit(args: GovernanceInitArgs): number {
  const { dir, workspaceId, force, dryRun } = args;

  const configPath = path.join(dir, GOVERNANCE_CONFIG_DIR, GOVERNANCE_CONFIG_FILE);

  // ── Already initialized check ──────────────────────────────────────────
  if (fs.existsSync(configPath) && !force) {
    process.stderr.write(
      `Error: ${dir} is already a Devory governance repo.\n` +
        `Use --force to reinitialize.\n`,
    );
    return 1;
  }

  const dirs = buildInitDirectories(dir);
  const now = new Date().toISOString();

  const config: GovernanceRepoConfig = {
    schema_version: "1",
    workspace_id: workspaceId,
    display_name: `${workspaceId} governance`,
    created_at: now,
  };

  // ── Dry run ────────────────────────────────────────────────────────────
  if (dryRun) {
    console.log(`Would initialize governance repo at: ${dir}`);
    console.log("\nDirectories to create:");
    for (const d of dirs) {
      console.log(`  ${path.relative(dir, d) || "."}`);
    }
    console.log(`\nConfig file: ${path.relative(dir, configPath)}`);
    console.log(JSON.stringify(config, null, 2));
    return 0;
  }

  // ── Create root dir if needed ──────────────────────────────────────────
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Create all directories ─────────────────────────────────────────────
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  // ── Write config file ──────────────────────────────────────────────────
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // ── Write .gitignore ───────────────────────────────────────────────────
  const gitignorePath = path.join(dir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "# Devory governance repo\n*.tmp\n", "utf-8");
  }

  // ── Git init + initial commit ──────────────────────────────────────────
  const isGitRepo = fs.existsSync(path.join(dir, ".git"));
  if (!isGitRepo) {
    execFileSync("git", ["init"], { cwd: dir });
    console.log(`Initialized Git repo at ${dir}`);
  }

  // Stage all new files and commit
  try {
    execFileSync("git", ["add", "--all"], { cwd: dir });
    const hasStaged = execSync("git diff --cached --name-only", { cwd: dir })
      .toString()
      .trim();
    if (hasStaged) {
      execFileSync(
        "git",
        ["commit", "--message", "chore: init devory governance repo"],
        { cwd: dir },
      );
      console.log("Initial commit created.");
    }
  } catch {
    // Git commit may fail if no files changed (force reinit). Not fatal.
  }

  console.log(`\nGovernance repo initialized at: ${dir}`);
  console.log(`  workspace_id: ${workspaceId}`);
  console.log(
    `\nNext step: bind a working repo to this governance repo:\n  devory governance bind --governance-repo ${dir}`,
  );

  return 0;
}

// ---------------------------------------------------------------------------
// devory governance bind
// ---------------------------------------------------------------------------

export const BIND_NAME = "governance bind";
export const BIND_USAGE =
  "devory governance bind --governance-repo <path> [--workspace-id <id>] [--working-repo <path>]";

export interface GovernanceBindArgs {
  governanceRepoPath: string;
  workspaceId: string | null;
  workingRepoPath: string;
}

export function parseBindArgs(
  argv: string[],
): { args: GovernanceBindArgs; error: null } | { args: null; error: string } {
  let governanceRepoPath: string | null = null;
  let workspaceId: string | null = null;
  let workingRepoPath = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--governance-repo" && i + 1 < argv.length) {
      governanceRepoPath = path.resolve(argv[++i]);
    } else if (argv[i] === "--workspace-id" && i + 1 < argv.length) {
      workspaceId = argv[++i];
    } else if (argv[i] === "--working-repo" && i + 1 < argv.length) {
      workingRepoPath = path.resolve(argv[++i]);
    }
  }

  if (!governanceRepoPath) {
    return { args: null, error: "--governance-repo <path> is required" };
  }

  return {
    args: { governanceRepoPath, workspaceId, workingRepoPath },
    error: null,
  };
}

export function runBind(args: GovernanceBindArgs): number {
  const { governanceRepoPath, workingRepoPath } = args;

  // ── Validate governance repo ───────────────────────────────────────────
  const govConfigPath = path.join(
    governanceRepoPath,
    GOVERNANCE_CONFIG_DIR,
    GOVERNANCE_CONFIG_FILE,
  );

  if (!fs.existsSync(govConfigPath)) {
    process.stderr.write(
      `Error: ${governanceRepoPath} is not a valid Devory governance repo.\n` +
        `Expected config at: ${govConfigPath}\n` +
        `Run \`devory governance init --dir ${governanceRepoPath}\` first.\n`,
    );
    return 1;
  }

  let govConfig: GovernanceRepoConfig;
  try {
    govConfig = JSON.parse(
      fs.readFileSync(govConfigPath, "utf-8"),
    ) as GovernanceRepoConfig;
  } catch {
    process.stderr.write(
      `Error: Could not read governance repo config at ${govConfigPath}\n`,
    );
    return 1;
  }

  const workspaceId = args.workspaceId ?? govConfig.workspace_id;

  // ── Write binding file ─────────────────────────────────────────────────
  const bindingDir = path.join(workingRepoPath, BINDING_DIR);
  const bindingPath = path.join(bindingDir, BINDING_FILE);

  if (!fs.existsSync(bindingDir)) {
    fs.mkdirSync(bindingDir, { recursive: true });
  }

  const binding: GovernanceRepoBinding = {
    schema_version: "1",
    governance_repo_path: governanceRepoPath,
    workspace_id: workspaceId,
    bound_working_repo: workingRepoPath,
    bound_at: new Date().toISOString(),
  };

  fs.writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + "\n", "utf-8");

  console.log(`Governance repo bound successfully.`);
  console.log(`  Working repo:    ${workingRepoPath}`);
  console.log(`  Governance repo: ${governanceRepoPath}`);
  console.log(`  Workspace ID:    ${workspaceId}`);
  console.log(`  Binding file:    ${bindingPath}`);
  console.log(
    `\nNext steps:\n` +
      `  1. Commit the binding: git add ${BINDING_DIR}/${BINDING_FILE} && git commit -m "chore: bind governance repo"\n` +
      `  2. Migrate existing assets: devory migrate --to-governance-repo --dry-run\n` +
      `  3. Enable governance mode: add {"governance_repo_enabled": true} to .devory/feature-flags.json`,
  );

  return 0;
}

// ---------------------------------------------------------------------------
// devory governance status
// ---------------------------------------------------------------------------

export const STATUS_NAME = "governance status";
export const STATUS_USAGE = "devory governance status [--working-repo <path>]";

export interface GovernanceStatusArgs {
  workingRepoPath: string;
}

export function parseStatusArgs(
  argv: string[],
): { args: GovernanceStatusArgs; error: null } {
  let workingRepoPath = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--working-repo" && i + 1 < argv.length) {
      workingRepoPath = path.resolve(argv[++i]);
    }
  }
  return { args: { workingRepoPath }, error: null };
}

// ---------------------------------------------------------------------------
// devory governance doctor
// ---------------------------------------------------------------------------

export const DOCTOR_NAME = "governance doctor";
export const DOCTOR_USAGE = "devory governance doctor [--working-repo <path>]";

// GovernanceDoctorArgs reuses GovernanceStatusArgs — same shape.
export type GovernanceDoctorArgs = GovernanceStatusArgs;

export function parseDoctorArgs(argv: string[]): { args: GovernanceDoctorArgs; error: null } {
  return parseStatusArgs(argv);
}

export interface CloudCommandReadiness {
  ready: boolean;
  supabaseUrl: string;
  supabaseUrlValid: boolean;
  serviceRoleKeyPresent: boolean;
  mode: "supabase" | "local-fallback" | "not-ready";
}

export function evaluateCloudCommandReadiness(
  env: NodeJS.ProcessEnv = process.env,
  runtimeReady = true,
): CloudCommandReadiness {
  const resolution = evaluateGovernanceCommandTransport({ env, runtimeReady });

  return {
    ready: resolution.mode === "supabase",
    supabaseUrl: resolution.supabaseUrl,
    supabaseUrlValid: resolution.supabaseUrlValid,
    serviceRoleKeyPresent: resolution.serviceRoleKeyPresent,
    mode: resolution.mode,
  };
}

export function formatCloudCommandReadinessLine(readiness: CloudCommandReadiness): string {
  if (readiness.mode === "supabase") {
    return "Cloud commands: READY (managed cloud backend)";
  }
  if (readiness.mode === "local-fallback") {
    return "Cloud commands: LOCAL FALLBACK (.devory/commands)";
  }
  return "Cloud commands: NOT READY";
}

/** Read HEAD SHA from a Git repo, returning null on any error. */
function readHeadSha(repoPath: string): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

/** Read git log -1 --pretty="%s" commit subject, returning null on any error. */
function readLastCommitSubject(repoPath: string): string | null {
  try {
    return execSync("git log -1 --pretty=%s", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function runDoctor(args: GovernanceDoctorArgs): number {
  const workingRepoPath = args.workingRepoPath;
  const bindingPath = path.join(workingRepoPath, BINDING_DIR, BINDING_FILE);
  const flagsPath = path.join(workingRepoPath, BINDING_DIR, "feature-flags.json");

  const SEP = "─".repeat(56);
  const ok = "✓";
  const warn = "⚠";
  const err = "✗";

  console.log(`\nDevory Governance Doctor`);
  console.log(SEP);

  // ── Feature flag ──────────────────────────────────────────────────────

  let flagEnabled = false;
  let flagSource = "default (off)";
  try {
    const resolved = loadFeatureFlags(workingRepoPath);
    flagEnabled = resolved.flags.governance_repo_enabled;
    if (resolved.source === "env-var") {
      flagSource = `env var DEVORY_GOVERNANCE_REPO_ENABLED=${process.env.DEVORY_GOVERNANCE_REPO_ENABLED ?? ""}`;
    } else if (resolved.source === "config-file" && resolved.file_path) {
      flagSource = resolved.file_path;
    } else {
      flagSource = "default (not set)";
    }
  } catch {
    flagSource = "error reading flags";
  }

  const flagIcon = flagEnabled ? ok : warn;
  console.log(`\n${flagIcon} Feature flag`);
  console.log(`  governance_repo_enabled: ${flagEnabled ? "true" : "false"}`);
  console.log(`  Source: ${flagSource}`);
  if (!flagEnabled) {
    console.log(`  → To enable: add {"governance_repo_enabled": true} to ${flagsPath}`);
    console.log(`    Or set:    DEVORY_GOVERNANCE_REPO_ENABLED=true`);
  }

  // ── Binding file ──────────────────────────────────────────────────────

  const hasBinding = fs.existsSync(bindingPath);
  const bindingIcon = hasBinding ? ok : warn;
  console.log(`\n${bindingIcon} Governance binding`);
  console.log(`  File: ${bindingPath}`);

  let binding: GovernanceRepoBinding | null = null;
  if (hasBinding) {
    try {
      binding = JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
      console.log(`  ${ok} Found — governance workspace ID: ${binding.workspace_id}`);
      console.log(`  Bound at: ${binding.bound_at}`);
    } catch {
      console.log(`  ${err} Could not parse binding file`);
      binding = null;
    }
  } else {
    console.log(`  ${warn} Not found`);
    console.log(`  → Run: devory governance bind --governance-repo <path>`);
  }

  // ── Governance repo health ─────────────────────────────────────────────

  let govRepoOk = false;
  if (binding) {
    const govPath = binding.governance_repo_path;
    const govConfigPath = path.join(govPath, GOVERNANCE_CONFIG_DIR, GOVERNANCE_CONFIG_FILE);
    const govRepoExists = fs.existsSync(govPath);
    const govConfigExists = fs.existsSync(govConfigPath);
    govRepoOk = govRepoExists && govConfigExists;

    const repoIcon = govRepoOk ? ok : err;
    console.log(`\n${repoIcon} Governance repo`);
    console.log(`  Path: ${govPath}`);

    if (!govRepoExists) {
      console.log(`  ${err} Directory not found`);
      console.log(`  → Run: devory governance init --dir ${govPath}`);
    } else if (!govConfigExists) {
      console.log(`  ${err} Config file missing (${GOVERNANCE_CONFIG_DIR}/${GOVERNANCE_CONFIG_FILE})`);
      console.log(`  → Run: devory governance init --dir ${govPath} --force`);
    } else {
      const headSha = readHeadSha(govPath);
      const lastSubject = readLastCommitSubject(govPath);
      if (headSha) {
        console.log(`  ${ok} HEAD: ${headSha.slice(0, 12)}  ${lastSubject ?? ""}`);
      } else {
        console.log(`  ${warn} No commits yet (run \`git init && git commit\` in ${govPath})`);
      }

      // Show task counts per stage
      const stages = ["backlog", "ready", "doing", "review", "blocked", "archived", "done"] as const;
      const counts: string[] = [];
      for (const stage of stages) {
        const dir = path.join(govPath, "tasks", stage);
        if (fs.existsSync(dir)) {
          const n = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).length;
          if (n > 0) counts.push(`${stage}:${n}`);
        }
      }
      if (counts.length > 0) {
        console.log(`  Tasks: ${counts.join("  ")}`);
      } else {
        console.log(`  Tasks: (none in any stage)`);
      }
    }
  } else {
    console.log(`\n${warn} Governance repo`);
    console.log(`  (skipped — no binding found)`);
  }

  // ── Runtime mode summary ──────────────────────────────────────────────

  const runtimeReady = flagEnabled && hasBinding && govRepoOk;
  const cloudReadiness = evaluateCloudCommandReadiness(process.env, runtimeReady);
  const activeState = readActiveState(args.workingRepoPath);
  console.log(`\n${runtimeReady ? ok : warn} Runtime mode`);

  if (runtimeReady) {
    console.log(`  Task discovery:    governance repo  (tasks/ in ${binding!.governance_repo_path})`);
    console.log(`  Task lifecycle:    TaskStore.moveTask() → Git commits`);
    console.log(`  Run lineage:       commits to ${binding!.governance_repo_path}/runs/`);
    console.log(`  Active workspace:  ${activeState.workspace_id} (local app workspace selection)`);
    console.log(`  Cloud workspace:   ${activeState.cloud_workspace_id ?? binding!.workspace_id} (workspace identity for cloud-backed features)`);
    console.log(`  Orchestrator log:  [orchestrator] governance mode: ON — task moves will be committed to ...`);
  } else {
    const missing: string[] = [];
    if (!flagEnabled) missing.push("feature flag is off");
    if (!hasBinding) missing.push("no binding file");
    if (binding && !govRepoOk) missing.push("governance repo not accessible");

    console.log(`  Task discovery:    working repo  (tasks/ready, tasks/doing, etc.)`);
    console.log(`  Task lifecycle:    legacy fs.renameSync — no Git commits`);
    console.log(`  Reason:           ${missing.join("; ")}`);
    console.log(`  Orchestrator log:  [orchestrator] governance mode: OFF — using legacy filesystem task moves`);
  }

  // ── Cloud command readiness ───────────────────────────────────────────

  console.log(`\n${cloudReadiness.mode === "not-ready" ? warn : ok} Cloud command polling`);
  console.log(`  Polling runtime: devory worker (factory-worker loop)`);
  console.log(`  ${formatCloudCommandReadinessLine(cloudReadiness)}`);
  console.log(`  Runtime transport: ${cloudReadiness.mode === "supabase" ? "managed cloud backend" : cloudReadiness.mode === "local-fallback" ? "local file queue" : "unavailable"}`);
  console.log(`  Local queue path: ${path.join(args.workingRepoPath, ".devory", "commands")}`);
  console.log(`  Cloud backend URL: ${cloudReadiness.supabaseUrl === "" ? "not set" : cloudReadiness.supabaseUrl}`);
  console.log(`  Cloud backend URL syntax: ${cloudReadiness.supabaseUrl === "" ? "NOT SET" : cloudReadiness.supabaseUrlValid ? "VALID" : "INVALID"}`);
  console.log(`  Runtime access key: ${cloudReadiness.serviceRoleKeyPresent ? "PRESENT" : "MISSING"}`);
  if (runtimeReady && cloudReadiness.mode === "local-fallback") {
    console.log(`  Note: governance repo mode is active; commands will be polled from the local queue until cloud runtime credentials are configured.`);
    console.log(`  Note: local/Core usage does not require sign-in or cloud setup to get started.`);
  }

  // ── Summary ───────────────────────────────────────────────────────────

  console.log(`\n${SEP}`);
  console.log(`Governance repo readiness: ${runtimeReady ? "READY" : "NOT READY"}`);
  console.log(formatCloudCommandReadinessLine(cloudReadiness));
  if (runtimeReady) {
    console.log(`Governance mode is ACTIVE. The next \`devory run\` will use the governance repo for task/runs state.`);
    console.log(`Governance command polling happens in \`devory worker\`, not one-shot \`devory run\`.`);
  } else {
    const steps: string[] = [];
    if (!hasBinding) {
      steps.push("1. devory governance init --dir <gov-repo-path>");
      steps.push("2. devory governance bind --governance-repo <gov-repo-path>");
      steps.push(`3. echo '{"governance_repo_enabled":true}' > ${flagsPath}`);
    } else if (!govRepoOk && binding) {
      steps.push(`1. devory governance init --dir ${binding.governance_repo_path}`);
      if (!flagEnabled) steps.push(`2. echo '{"governance_repo_enabled":true}' > ${flagsPath}`);
    } else if (!flagEnabled) {
      steps.push(`1. echo '{"governance_repo_enabled":true}' > ${flagsPath}`);
    }
    if (steps.length > 0) {
      console.log(`To activate governance mode:\n  ${steps.join("\n  ")}`);
    } else {
      console.log(`Governance mode is inactive. See details above.`);
    }
  }
  console.log("");

  return runtimeReady ? 0 : 1;
}

// ---------------------------------------------------------------------------
// devory governance enqueue-local
// ---------------------------------------------------------------------------

export const ENQUEUE_LOCAL_NAME = "governance enqueue-local";
export const ENQUEUE_LOCAL_USAGE =
  "devory governance enqueue-local --type <command-type> [--payload <json> | --payload-file <path>] [--target-task-id <id>] [--target-run-id <id>] [--issued-by <user>] [--expires-in-minutes <n>] [--working-repo <path>]";

export interface GovernanceEnqueueLocalArgs {
  workingRepoPath: string;
  commandType: string;
  payload: string | null;
  payloadFile: string | null;
  targetTaskId: string | null;
  targetRunId: string | null;
  issuedBy: string;
  expiresInMinutes: number;
}

export function parseEnqueueLocalArgs(
  argv: string[],
): { args: GovernanceEnqueueLocalArgs | null; error: string | null } {
  let workingRepoPath = process.cwd();
  let commandType: string | null = null;
  let payload: string | null = null;
  let payloadFile: string | null = null;
  let targetTaskId: string | null = null;
  let targetRunId: string | null = null;
  let issuedBy = "local-dev";
  let expiresInMinutes = 24 * 60;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--working-repo" && argv[i + 1]) {
      workingRepoPath = path.resolve(argv[++i]);
    } else if (arg === "--type" && argv[i + 1]) {
      commandType = argv[++i];
    } else if (arg === "--payload" && argv[i + 1]) {
      payload = argv[++i];
    } else if (arg === "--payload-file" && argv[i + 1]) {
      payloadFile = path.resolve(argv[++i]);
    } else if (arg === "--target-task-id" && argv[i + 1]) {
      targetTaskId = argv[++i];
    } else if (arg === "--target-run-id" && argv[i + 1]) {
      targetRunId = argv[++i];
    } else if (arg === "--issued-by" && argv[i + 1]) {
      issuedBy = argv[++i];
    } else if (arg === "--expires-in-minutes" && argv[i + 1]) {
      expiresInMinutes = Number.parseInt(argv[++i], 10);
    } else {
      return { args: null, error: `unknown or incomplete argument: ${arg}` };
    }
  }

  if (!commandType) {
    return { args: null, error: "--type <command-type> is required" };
  }
  if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
    return { args: null, error: "--expires-in-minutes must be a positive integer" };
  }

  return {
    args: {
      workingRepoPath,
      commandType,
      payload,
      payloadFile,
      targetTaskId,
      targetRunId,
      issuedBy,
      expiresInMinutes,
    },
    error: null,
  };
}

function readLocalPayload(args: GovernanceEnqueueLocalArgs): Record<string, unknown> {
  const raw = args.payloadFile
    ? fs.readFileSync(args.payloadFile, "utf-8")
    : args.payload ?? "{}";
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function runEnqueueLocal(args: GovernanceEnqueueLocalArgs): number {
  const bindingPath = path.join(args.workingRepoPath, BINDING_DIR, BINDING_FILE);
  if (!fs.existsSync(bindingPath)) {
    console.error(`No governance binding found at ${bindingPath}`);
    return 1;
  }

  const binding = JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
  const { flags } = loadFeatureFlags(args.workingRepoPath);
  if (!flags.governance_repo_enabled) {
    console.error("Governance mode is not enabled for this workspace.");
    return 1;
  }

  const payload = readLocalPayload(args);
  const command: GovernanceCommandEnvelope = {
    command_id: buildLocalCommandId(),
    command_type: args.commandType as GovernanceCommandEnvelope["command_type"],
    issued_by: args.issuedBy,
    issued_at: new Date().toISOString(),
    workspace_id: binding.workspace_id,
    target_task_id: args.targetTaskId ?? (typeof payload.task_id === "string" ? payload.task_id : undefined),
    target_run_id: args.targetRunId ?? undefined,
    governance_repo_ref: binding.governance_repo_path,
    expires_at: new Date(Date.now() + args.expiresInMinutes * 60_000).toISOString(),
    payload,
  } as GovernanceCommandEnvelope;

  const validation = validateGovernanceCommandEnvelope(command);
  if (!validation.ok) {
    console.error(`Invalid governance command: ${validation.errors.join("; ")}`);
    return 1;
  }

  ensureLocalCommandQueue(args.workingRepoPath);
  const queuePaths = getLocalCommandQueuePaths(args.workingRepoPath);
  const commandPath = path.join(queuePaths.pending, `${command.command_id}.json`);
  fs.writeFileSync(commandPath, `${JSON.stringify(command, null, 2)}\n`, {
    encoding: "utf-8",
    flag: "wx",
  });

  console.log(`Local governance command enqueued.`);
  console.log(`  Command ID: ${command.command_id}`);
  console.log(`  Type:       ${command.command_type}`);
  console.log(`  Queue file: ${commandPath}`);
  console.log(`  Transport:  ${formatCloudCommandReadinessLine(evaluateCloudCommandReadiness(process.env, true))}`);
  return 0;
}

export function runStatus(args: GovernanceStatusArgs): number {
  const bindingPath = path.join(args.workingRepoPath, BINDING_DIR, BINDING_FILE);

  if (!fs.existsSync(bindingPath)) {
    console.log("Governance mode: not configured");
    console.log(
      `No binding found at ${bindingPath}\n` +
        `Run \`devory governance init\` and \`devory governance bind\` to set up.`,
    );
    return 0;
  }

  let binding: GovernanceRepoBinding;
  try {
    binding = JSON.parse(fs.readFileSync(bindingPath, "utf-8")) as GovernanceRepoBinding;
  } catch {
    process.stderr.write(`Error: Could not read binding at ${bindingPath}\n`);
    return 1;
  }

  const govConfigPath = path.join(
    binding.governance_repo_path,
    GOVERNANCE_CONFIG_DIR,
    GOVERNANCE_CONFIG_FILE,
  );
  const repoExists = fs.existsSync(govConfigPath);

  console.log(`Governance mode: ${repoExists ? "ready" : "error — governance repo not found"}`);
  console.log(`  Governance repo: ${binding.governance_repo_path}`);
  console.log(`  Workspace ID:    ${binding.workspace_id}`);
  console.log(`  Bound at:        ${binding.bound_at}`);

  if (!repoExists) {
    process.stderr.write(
      `\nError: Governance repo not found at ${binding.governance_repo_path}\n` +
        `Run \`devory governance init --dir ${binding.governance_repo_path}\` to initialize.\n`,
    );
    return 1;
  }

  return 0;
}
