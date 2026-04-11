import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  parseEnqueueLocalArgs,
  runBind,
  runDoctor,
  runEnqueueLocal,
} from "./governance.js";

const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function captureConsole(fn: () => number): { code: number; stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    stdout.push(args.join(" "));
  };
  console.warn = (...args: unknown[]) => {
    stderr.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.join(" "));
  };

  try {
    return { code: fn(), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function seedGovernanceRepo(governanceRepoPath: string): void {
  fs.mkdirSync(path.join(governanceRepoPath, ".devory-governance"), { recursive: true });
  fs.writeFileSync(
    path.join(governanceRepoPath, ".devory-governance", "config.json"),
    `${JSON.stringify(
      {
        schema_version: "1",
        workspace_id: "test-workspace",
        display_name: "test-workspace governance",
        created_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function writeFeatureFlag(workingRepoPath: string): void {
  fs.mkdirSync(path.join(workingRepoPath, ".devory"), { recursive: true });
  fs.writeFileSync(
    path.join(workingRepoPath, ".devory", "feature-flags.json"),
    "{\"governance_repo_enabled\":true}\n",
    "utf-8",
  );
}

function writeActiveState(
  workingRepoPath: string,
  state: { workspace_id: string; profile_id?: string; cloud_workspace_id?: string },
): void {
  fs.mkdirSync(path.join(workingRepoPath, ".devory"), { recursive: true });
  fs.writeFileSync(
    path.join(workingRepoPath, ".devory", "active-state.json"),
    `${JSON.stringify(
      {
        workspace_id: state.workspace_id,
        profile_id: state.profile_id ?? "balanced-default",
        cloud_workspace_id: state.cloud_workspace_id,
        updated_at: "2026-04-11T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  for (const key of Object.keys(savedEnv)) {
    delete savedEnv[key];
  }
});

describe("governance doctor cloud command readiness", () => {
  test("reports LOCAL FALLBACK with missing Supabase runtime env vars while governance mode stays ACTIVE", () => {
    const workingRepo = makeTempDir("devory-governance-working-");
    const governanceRepo = makeTempDir("devory-governance-repo-");
    seedGovernanceRepo(governanceRepo);
    writeFeatureFlag(workingRepo);
    writeActiveState(workingRepo, { workspace_id: "default", cloud_workspace_id: "cloud-ws-1" });
    assert.equal(
      runBind({
        governanceRepoPath: governanceRepo,
        workspaceId: "test-workspace",
        workingRepoPath: workingRepo,
      }),
      0,
    );

    setEnv("SUPABASE_URL", undefined);
    setEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);

    const result = captureConsole(() => runDoctor({ workingRepoPath: workingRepo }));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Governance repo readiness: READY/);
    assert.match(result.stdout, /Cloud commands: LOCAL FALLBACK \(.devory\/commands\)/);
    assert.match(result.stdout, /Polling runtime: devory worker \(factory-worker loop\)/);
    assert.match(result.stdout, /Runtime transport: local file queue/);
    assert.match(result.stdout, /Active workspace:\s+default \(local app workspace selection\)/);
    assert.match(result.stdout, /Cloud workspace:\s+cloud-ws-1 \(workspace identity for cloud-backed features\)/);
    assert.match(result.stdout, /Cloud backend URL: not set/);
    assert.match(result.stdout, /Runtime access key: MISSING/);
    assert.match(result.stdout, /local\/Core usage does not require sign-in or cloud setup to get started/);
    assert.match(result.stdout, /Governance command polling happens in `devory worker`, not one-shot `devory run`\./);
  });

  test("reports READY when Supabase runtime env vars are configured", () => {
    const workingRepo = makeTempDir("devory-governance-working-");
    const governanceRepo = makeTempDir("devory-governance-repo-");
    seedGovernanceRepo(governanceRepo);
    writeFeatureFlag(workingRepo);
    assert.equal(
      runBind({
        governanceRepoPath: governanceRepo,
        workspaceId: "test-workspace",
        workingRepoPath: workingRepo,
      }),
      0,
    );

    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const result = captureConsole(() => runDoctor({ workingRepoPath: workingRepo }));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Cloud commands: READY \(managed cloud backend\)/);
    assert.match(result.stdout, /Runtime transport: managed cloud backend/);
  });
});

describe("governance enqueue-local", () => {
  test("writes a validated local command into the pending queue", () => {
    const workingRepo = makeTempDir("devory-governance-working-");
    const governanceRepo = makeTempDir("devory-governance-repo-");
    seedGovernanceRepo(governanceRepo);
    writeFeatureFlag(workingRepo);
    assert.equal(
      runBind({
        governanceRepoPath: governanceRepo,
        workspaceId: "test-workspace",
        workingRepoPath: workingRepo,
      }),
      0,
    );

    const parsed = parseEnqueueLocalArgs([
      "--working-repo", workingRepo,
      "--type", "approve-task",
      "--payload", "{\"task_id\":\"factory-373\"}",
    ]);
    assert.equal(parsed.error, null);

    const result = captureConsole(() => runEnqueueLocal(parsed.args!));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Local governance command enqueued/);

    const pendingDir = path.join(workingRepo, ".devory", "commands", "pending");
    const files = fs.readdirSync(pendingDir).filter((file) => file.endsWith(".json"));
    assert.equal(files.length, 1);
    const written = JSON.parse(
      fs.readFileSync(path.join(pendingDir, files[0]!), "utf-8"),
    ) as { command_type: string; payload: { task_id: string } };
    assert.equal(written.command_type, "approve-task");
    assert.equal(written.payload.task_id, "factory-373");
  });
});
