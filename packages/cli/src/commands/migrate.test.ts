/**
 * packages/cli/src/commands/migrate.test.ts
 *
 * Tests for `devory migrate --to-governance-repo`.
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parseArgs, run, setGitExecFileSyncForTesting } from "./migrate.js";
import { runBind } from "./governance.js";

const originalCwd = process.cwd();
const originalGitEnv = {
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
};

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function setupGovernanceRepo(governanceRepo: string): void {
  const dirs = [
    path.join(governanceRepo, ".devory-governance"),
    ...["backlog", "ready", "doing", "review", "blocked", "done"].map((stage) =>
      path.join(governanceRepo, "tasks", stage),
    ),
    path.join(governanceRepo, "doctrine"),
    path.join(governanceRepo, "standards"),
    path.join(governanceRepo, "profiles"),
    path.join(governanceRepo, "runs"),
    path.join(governanceRepo, "reviews"),
    path.join(governanceRepo, "questions"),
    path.join(governanceRepo, "audit"),
    path.join(governanceRepo, "commands"),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  writeFile(
    path.join(governanceRepo, ".devory-governance", "config.json"),
    JSON.stringify(
      {
        schema_version: "1",
        workspace_id: "test-workspace",
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}

function setupRepos(): { workingRepo: string; governanceRepo: string } {
  const workingRepo = makeTempDir("devory-migrate-working-");
  const governanceRepo = makeTempDir("devory-migrate-governance-");
  setupGovernanceRepo(governanceRepo);
  fs.mkdirSync(path.join(workingRepo, ".git"), { recursive: true });
  assert.equal(
    runBind({
      governanceRepoPath: governanceRepo,
      workspaceId: "test-workspace",
      workingRepoPath: workingRepo,
    }),
    0,
  );

  return { workingRepo, governanceRepo };
}

function captureConsole(fn: () => number): { code: number; stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => { stdout.push(args.join(" ")); };
  console.warn = (...args: unknown[]) => { stderr.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { stderr.push(args.join(" ")); };

  try {
    return { code: fn(), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

beforeEach(() => {
  process.env.GIT_AUTHOR_NAME = "Devory Test";
  process.env.GIT_AUTHOR_EMAIL = "devory-test@example.com";
  process.env.GIT_COMMITTER_NAME = "Devory Test";
  process.env.GIT_COMMITTER_EMAIL = "devory-test@example.com";
  setGitExecFileSyncForTesting((command, args, options) => {
    assert.equal(command, "git");
    const cwd = String(options?.cwd ?? process.cwd());
    const stateDir = path.join(cwd, ".mock-git");
    const commitFile = path.join(stateDir, "last-commit.txt");
    fs.mkdirSync(stateDir, { recursive: true });

    if (args[0] === "status") return "";
    if (args[0] === "add") return "";

    if (args[0] === "diff" && args[1] === "--cached" && args[2] === "--name-only") {
      const listFiles = (root: string): string[] => {
        if (!fs.existsSync(root)) return [];
        const entries = fs.readdirSync(root, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          if (entry.name === ".git" || entry.name === ".mock-git") continue;
          const full = path.join(root, entry.name);
          if (entry.isDirectory()) {
            for (const child of listFiles(full)) {
              files.push(path.join(entry.name, child));
            }
            continue;
          }
          if (entry.isFile()) files.push(entry.name);
        }
        return files.sort();
      };
      return listFiles(cwd).join("\n");
    }

    if (args[0] === "commit") {
      const parts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-m" && i + 1 < args.length) parts.push(String(args[++i]));
      }
      fs.writeFileSync(commitFile, parts.join("\n\n"), "utf-8");
      return "";
    }

    throw new Error(`Unsupported fake git command: ${args.join(" ")}`);
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  process.env.GIT_AUTHOR_NAME = originalGitEnv.GIT_AUTHOR_NAME;
  process.env.GIT_AUTHOR_EMAIL = originalGitEnv.GIT_AUTHOR_EMAIL;
  process.env.GIT_COMMITTER_NAME = originalGitEnv.GIT_COMMITTER_NAME;
  process.env.GIT_COMMITTER_EMAIL = originalGitEnv.GIT_COMMITTER_EMAIL;
  setGitExecFileSyncForTesting();
});

describe("migrate parseArgs", () => {
  test("parses required flag and defaults", () => {
    const result = parseArgs(["--to-governance-repo"]);
    assert.equal(result.error, null);
    assert.equal(result.args?.toGovernanceRepo, true);
    assert.equal(result.args?.dryRun, false);
    assert.equal(result.args?.confirm, false);
  });

  test("parses --dry-run and --confirm", () => {
    const result = parseArgs(["--to-governance-repo", "--dry-run", "--confirm"]);
    assert.equal(result.error, null);
    assert.equal(result.args?.dryRun, true);
    assert.equal(result.args?.confirm, true);
  });

  test("requires migration target flag", () => {
    const result = parseArgs(["--dry-run"]);
    assert.ok(result.error?.includes("--to-governance-repo"));
  });
});

describe("migrate run", () => {
  test("dry-run prints per-category counts", () => {
    const { workingRepo, governanceRepo } = setupRepos();
    writeFile(path.join(workingRepo, "tasks", "backlog", "factory-001.md"), "# Task\n");
    writeFile(path.join(workingRepo, "doctrine", "core.md"), "# Doctrine\n");
    writeFile(path.join(workingRepo, "artifacts", "profiles", "default.json"), "{}\n");
    writeFile(path.join(workingRepo, "artifacts", "workspaces", "default.json"), "{}\n");
    writeFile(path.join(workingRepo, "runs", "run-1", "manifest.json"), "{\"run_id\":\"run-1\"}\n");

    process.chdir(workingRepo);
    const result = captureConsole(() =>
      run({
        toGovernanceRepo: true,
        dryRun: true,
        confirm: false,
        workingRepoPath: workingRepo,
      }),
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, new RegExp(governanceRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(result.stdout, /tasks\/backlog: 1 file\(s\)/);
    assert.match(result.stdout, /doctrine: 1 file\(s\)/);
    assert.match(result.stdout, /profiles: 1 file\(s\)/);
    assert.match(result.stdout, /standards: 1 file\(s\)/);
    assert.match(result.stdout, /runs: 1 file\(s\)/);
  });

  test("copies supported categories and commits them", () => {
    const { workingRepo, governanceRepo } = setupRepos();
    writeFile(path.join(workingRepo, "tasks", "backlog", "factory-001.md"), "# Task\n");
    writeFile(path.join(workingRepo, "doctrine", "core.md"), "# Doctrine\n");
    writeFile(path.join(workingRepo, "artifacts", "profiles", "default.json"), "{\"id\":\"default\"}\n");
    writeFile(path.join(workingRepo, "artifacts", "workspaces", "default.json"), "{\"workspace\":\"default\"}\n");
    writeFile(path.join(workingRepo, "runs", "run-1", "manifest.json"), "{\"run_id\":\"run-1\"}\n");
    writeFile(path.join(workingRepo, "runs", "run-1", "artifact-index.json"), "{\"ignored\":true}\n");

    process.chdir(workingRepo);
    const result = captureConsole(() =>
      run({
        toGovernanceRepo: true,
        dryRun: false,
        confirm: true,
        workingRepoPath: workingRepo,
      }),
    );

    assert.equal(result.code, 0);
    assert.ok(fs.existsSync(path.join(governanceRepo, "tasks", "backlog", "factory-001.md")));
    assert.ok(fs.existsSync(path.join(governanceRepo, "doctrine", "core.md")));
    assert.ok(fs.existsSync(path.join(governanceRepo, "profiles", "default.json")));
    assert.ok(fs.existsSync(path.join(governanceRepo, "standards", "default.json")));
    assert.ok(fs.existsSync(path.join(governanceRepo, "runs", "run-1", "manifest.json")));
    assert.ok(!fs.existsSync(path.join(governanceRepo, "runs", "run-1", "artifact-index.json")));

    const commitMessage = fs.readFileSync(
      path.join(governanceRepo, ".mock-git", "last-commit.txt"),
      "utf-8",
    );
    assert.match(commitMessage, /chore\(migration\): import existing artifacts from working repo/);
    assert.match(commitMessage, /Devory-Source: migration-tool/);
    assert.match(commitMessage, new RegExp(workingRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("second run skips identical files and warns on differing ones", () => {
    const { workingRepo, governanceRepo } = setupRepos();
    const sourceTask = path.join(workingRepo, "tasks", "backlog", "factory-001.md");
    const destTask = path.join(governanceRepo, "tasks", "backlog", "factory-001.md");
    writeFile(sourceTask, "# Task v1\n");

    process.chdir(workingRepo);
    assert.equal(
      run({
        toGovernanceRepo: true,
        dryRun: false,
        confirm: true,
        workingRepoPath: workingRepo,
      }),
      0,
    );

    let result = captureConsole(() =>
      run({
        toGovernanceRepo: true,
        dryRun: false,
        confirm: true,
        workingRepoPath: workingRepo,
      }),
    );
    assert.equal(result.code, 0);
    assert.match(result.stdout, /skipped 1 identical file\(s\)/);

    writeFile(sourceTask, "# Task v2\n");
    result = captureConsole(() =>
      run({
        toGovernanceRepo: true,
        dryRun: false,
        confirm: true,
        workingRepoPath: workingRepo,
      }),
    );

    assert.equal(result.code, 0);
    assert.match(result.stderr, /Skipped differing file:/);
    assert.equal(fs.readFileSync(destTask, "utf-8"), "# Task v1\n");
  });
});
