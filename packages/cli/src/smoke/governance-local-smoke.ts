import * as assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { runDoctor, runEnqueueLocal } from "../commands/governance.ts";
import { run as runSetup } from "../commands/setup.ts";

const MODULE_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(MODULE_FILE), "..", "..", "..", "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const WORKER_SCRIPT = path.join(REPO_ROOT, "scripts", "factory-worker.ts");

interface CapturedRun {
  code: number;
  stdout: string;
  stderr: string;
}

export interface GovernanceLocalSmokeResult {
  workingRepoPath: string;
  governanceRepoPath: string;
  commandId: string;
  queuePendingPath: string;
  queueProcessedPath: string;
  commandOutcomePath: string;
  readyTaskPath: string;
  doneTaskPath: string;
  workerLogPath: string;
  doctorSummaryLine: string;
  workerTransportLine: string;
  workerProcessedLine: string;
  recentGovernanceCommits: string[];
  runArtifacts: string[];
}

function captureConsole(fn: () => number | Promise<number>): Promise<CapturedRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => { stdout.push(args.join(" ")); };
  console.warn = (...args: unknown[]) => { stderr.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { stderr.push(args.join(" ")); };

  return Promise.resolve()
    .then(fn)
    .then((code) => ({ code, stdout: stdout.join("\n"), stderr: stderr.join("\n") }))
    .finally(() => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    });
}

function runTsxInWorkspace(
  scriptPath: string,
  args: string[],
  workingRepoPath: string,
): CapturedRun {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, scriptPath, ...args],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        DEVORY_FACTORY_ROOT: workingRepoPath,
        DEVORY_RUNTIME_ROOT: REPO_ROOT,
      },
    },
  );

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function initGitRepo(dir: string): void {
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "smoke@devory.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Devory Smoke"], { cwd: dir });
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function taskMarkdown(
  taskId: string,
  status: "ready" | "review",
  repo = "."
): string {
  return `---
id: ${taskId}
title: ${taskId} smoke task
project: ai-dev-factory
repo: ${repo}
branch: task/${taskId}
type: feature
priority: medium
status: ${status}
agent: backend-builder
depends_on: []
files_likely_affected: []
verification: []
---

## Goal
Exercise the governance smoke path.

## Context
- This task exists only for local governance smoke verification.

## Acceptance Criteria
- [ ] The smoke path can observe this task in governance mode.
`;
}

function recentGitSubjects(repoPath: string, count = 5): string[] {
  return execFileSync(
    "git",
    ["log", `-${count}`, "--pretty=%s"],
    { cwd: repoPath, encoding: "utf-8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

export async function runGovernanceLocalSmoke(): Promise<GovernanceLocalSmokeResult> {
  const workingRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "devory-governance-smoke-working-"));
  const governanceRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "devory-governance-smoke-repo-"));
  const readyTaskId = "factory-smoke-ready";
  const reviewTaskId = "factory-smoke-review";

  initGitRepo(workingRepoPath);
  writeFile(path.join(workingRepoPath, "FACTORY_CONTEXT.md"), "# Smoke Workspace\n");
  writeFile(path.join(workingRepoPath, "tasks", "ready", `${readyTaskId}.md`), taskMarkdown(readyTaskId, "ready"));
  writeFile(
    path.join(workingRepoPath, "tasks", "review", `${reviewTaskId}.md`),
    taskMarkdown(reviewTaskId, "review", "https://example.com/smoke.git")
  );

  const setup = await captureConsole(() => runSetup({
    governanceRepoPath,
    workspaceId: "governance-local-smoke",
    enableGovernance: true,
    migrateTasks: true,
    workingRepoPath,
    nonInteractive: true,
  }));
  assert.equal(setup.code, 0, `setup failed:\n${setup.stdout}\n${setup.stderr}`);

  const doctor = await captureConsole(() => runDoctor({ workingRepoPath }));
  assert.equal(doctor.code, 0, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  assert.match(doctor.stdout, /Governance repo readiness: READY/);
  assert.match(doctor.stdout, /Cloud commands: LOCAL FALLBACK \(.devory\/commands\)/);

  const enqueue = await captureConsole(() => runEnqueueLocal({
    workingRepoPath,
    commandType: "approve-task",
    payload: JSON.stringify({ task_id: reviewTaskId }),
    payloadFile: null,
    targetTaskId: reviewTaskId,
    targetRunId: null,
    issuedBy: "governance-smoke",
    expiresInMinutes: 60,
  }));
  assert.equal(enqueue.code, 0, `enqueue failed:\n${enqueue.stdout}\n${enqueue.stderr}`);

  const queuePendingDir = path.join(workingRepoPath, ".devory", "commands", "pending");
  const pendingFiles = fs.readdirSync(queuePendingDir).filter((file) => file.endsWith(".json"));
  assert.equal(pendingFiles.length, 1, "expected exactly one pending local command");
  const commandId = pendingFiles[0]!.replace(/\.json$/, "");
  const queuePendingPath = path.join(queuePendingDir, pendingFiles[0]!);

  const worker = runTsxInWorkspace(WORKER_SCRIPT, ["--once", "--dry-run"], workingRepoPath);
  assert.equal(worker.code, 0, `worker failed:\n${worker.stdout}\n${worker.stderr}`);
  assert.match(worker.stdout, /governance command transport: local file fallback/);
  assert.match(worker.stdout, /processed 1 governance command\(s\): approve-task:accepted/);

  const queueProcessedPath = path.join(
    workingRepoPath,
    ".devory",
    "commands",
    "processed",
    `${commandId}.json`,
  );
  const commandOutcomePath = path.join(governanceRepoPath, "commands", `${commandId}.json`);
  const readyTaskPath = path.join(governanceRepoPath, "tasks", "ready", `${readyTaskId}.md`);
  const doneTaskPath = path.join(governanceRepoPath, "tasks", "done", `${reviewTaskId}.md`);
  const workerLogPath = path.join(workingRepoPath, "runs", "factory-worker.log");

  assert.equal(fs.existsSync(queueProcessedPath), true, "expected processed local queue receipt");
  assert.equal(fs.existsSync(commandOutcomePath), true, "expected governance command outcome file");
  assert.equal(fs.existsSync(readyTaskPath), true, "expected migrated ready task in governance repo");
  assert.equal(fs.existsSync(doneTaskPath), true, "expected approved task moved to done in governance repo");
  assert.equal(fs.existsSync(workerLogPath), true, "expected worker log file");

  const runArtifacts = fs.existsSync(path.join(workingRepoPath, "runs"))
    ? fs.readdirSync(path.join(workingRepoPath, "runs")).filter((name) =>
        name.startsWith("orchestrator-run-") && (name.endsWith(".json") || name.endsWith(".md")))
    : [];
  assert.ok(runArtifacts.length > 0, "expected run artifacts to be written under workingRepo/runs");

  const recentGovernanceCommits = recentGitSubjects(governanceRepoPath, 6);
  assert.ok(
    recentGovernanceCommits.some((subject) => subject.includes(`record outcome for approve-task [${commandId}]`)),
    "expected governance log to include command outcome commit",
  );

  return {
    workingRepoPath,
    governanceRepoPath,
    commandId,
    queuePendingPath,
    queueProcessedPath,
    commandOutcomePath,
    readyTaskPath,
    doneTaskPath,
    workerLogPath,
    doctorSummaryLine: doctor.stdout.split(/\r?\n/).find((line) => line.startsWith("Cloud commands:")) ?? "",
    workerTransportLine: worker.stdout.split(/\r?\n/).find((line) => line.includes("governance command transport:")) ?? "",
    workerProcessedLine: worker.stdout.split(/\r?\n/).find((line) => line.includes("processed 1 governance command")) ?? "",
    recentGovernanceCommits,
    runArtifacts,
  };
}

async function main(): Promise<void> {
  const result = await runGovernanceLocalSmoke();
  console.log("Governance local smoke: PASS");
  console.log(`Working repo: ${result.workingRepoPath}`);
  console.log(`Governance repo: ${result.governanceRepoPath}`);
  console.log(`Transport: ${result.doctorSummaryLine}`);
  console.log(`Worker transport: ${result.workerTransportLine}`);
  console.log(`Worker command result: ${result.workerProcessedLine}`);
  console.log(`Processed queue receipt: ${result.queueProcessedPath}`);
  console.log(`Governance outcome file: ${result.commandOutcomePath}`);
  console.log(`Approved task path: ${result.doneTaskPath}`);
  console.log(`Worker log: ${result.workerLogPath}`);
  console.log(`Recent governance commits:`);
  for (const subject of result.recentGovernanceCommits) {
    console.log(`  ${subject}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_FILE) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
