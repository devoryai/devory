import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import {
  parseArgs,
  run,
  setSetupPromptHandlersForTesting,
} from "./setup.js";

const originalGitEnv = {
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
};

const originalSupabaseEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function readGitLogSubject(repoPath: string): string {
  return execFileSync("git", ["log", "-1", "--pretty=%s"], {
    cwd: repoPath,
    encoding: "utf-8",
  }).trim();
}

async function captureConsoleAsync(
  fn: () => Promise<number>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => { stdout.push(args.join(" ")); };
  console.warn = (...args: unknown[]) => { stderr.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { stderr.push(args.join(" ")); };

  try {
    return { code: await fn(), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
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
});

afterEach(() => {
  process.env.GIT_AUTHOR_NAME = originalGitEnv.GIT_AUTHOR_NAME;
  process.env.GIT_AUTHOR_EMAIL = originalGitEnv.GIT_AUTHOR_EMAIL;
  process.env.GIT_COMMITTER_NAME = originalGitEnv.GIT_COMMITTER_NAME;
  process.env.GIT_COMMITTER_EMAIL = originalGitEnv.GIT_COMMITTER_EMAIL;
  process.env.SUPABASE_URL = originalSupabaseEnv.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = originalSupabaseEnv.SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseEnv.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseEnv.SUPABASE_SERVICE_ROLE_KEY;
  setSetupPromptHandlersForTesting();
});

describe("setup parseArgs", () => {
  test("parses --migrate-tasks", () => {
    const result = parseArgs(["--governance-repo", "/tmp/gov", "--migrate-tasks"]);
    assert.equal(result.error, null);
    assert.equal(result.args?.migrateTasks, true);
  });
});

describe("setup run", () => {
  test("non-interactive mode migrates tasks, skips existing files, and commits copied tasks", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const workingRepo = makeTempDir("devory-setup-working-");
    const governanceRepo = makeTempDir("devory-setup-governance-");

    writeFile(path.join(workingRepo, "tasks", "backlog", "factory-001.md"), "# Backlog\n");
    writeFile(path.join(workingRepo, "tasks", "ready", "nested", "factory-002.md"), "# Ready\n");
    writeFile(path.join(governanceRepo, "tasks", "backlog", "factory-001.md"), "# Existing\n");

    const result = await captureConsoleAsync(() =>
      run({
        governanceRepoPath: governanceRepo,
        workspaceId: "test-workspace",
        enableGovernance: true,
        migrateTasks: true,
        workingRepoPath: workingRepo,
        nonInteractive: true,
      }),
    );

    assert.equal(result.code, 0);
    assert.equal(
      fs.readFileSync(path.join(governanceRepo, "tasks", "backlog", "factory-001.md"), "utf-8"),
      "# Existing\n",
    );
    assert.equal(
      fs.readFileSync(path.join(governanceRepo, "tasks", "ready", "nested", "factory-002.md"), "utf-8"),
      "# Ready\n",
    );
    assert.match(result.stdout, /Tasks migrated:\s+yes/);
    assert.match(result.stdout, /Task files:\s+copied 1, skipped 1/);
    assert.match(result.stdout, /Cloud commands:\s+LOCAL FALLBACK \(.devory\/commands\)/);
    assert.equal(
      readGitLogSubject(governanceRepo),
      "chore(tasks): seed tasks from working repo during setup",
    );
  });

  test("final summary shows cloud commands READY when Supabase env is configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    const workingRepo = makeTempDir("devory-setup-ready-working-");
    const governanceRepo = makeTempDir("devory-setup-ready-governance-");

    const result = await captureConsoleAsync(() =>
      run({
        governanceRepoPath: governanceRepo,
        workspaceId: "test-workspace",
        enableGovernance: true,
        migrateTasks: false,
        workingRepoPath: workingRepo,
        nonInteractive: true,
      }),
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Cloud commands:\s+READY/);
  });

  test("interactive mode prompts for task migration after binding and migrates when confirmed", async () => {
    const workingRepo = makeTempDir("devory-setup-interactive-working-");
    const governanceRepo = makeTempDir("devory-setup-interactive-governance-");

    writeFile(path.join(workingRepo, "tasks", "review", "factory-003.md"), "# Review\n");

    const yesNoQuestions: string[] = [];
    setSetupPromptHandlersForTesting({
      prompt: async (_rl, question, defaultValue) => {
        if (question.startsWith("Governance repo path")) return governanceRepo;
        if (question === "Workspace ID") return "interactive-workspace";
        return defaultValue;
      },
      promptYesNo: async (_rl, question, defaultYes) => {
        yesNoQuestions.push(question);
        if (question === "Copy existing tasks from this working repo into the governance repo now?") {
          return true;
        }
        return defaultYes;
      },
    });

    const result = await captureConsoleAsync(() =>
      run({
        enableGovernance: true,
        migrateTasks: false,
        workingRepoPath: workingRepo,
        nonInteractive: false,
      }),
    );

    assert.equal(result.code, 0);
    assert.ok(
      yesNoQuestions.includes("Copy existing tasks from this working repo into the governance repo now?"),
    );
    assert.equal(
      fs.readFileSync(path.join(governanceRepo, "tasks", "review", "factory-003.md"), "utf-8"),
      "# Review\n",
    );
  });
});
