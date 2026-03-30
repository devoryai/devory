/**
 * packages/cli/src/commands/diagnostics.test.ts
 *
 * Tests for the `devory diagnostics` command.
 *
 * Covers:
 *   - parseArgs: valid and invalid inputs
 *   - runChecks: pass scenario (healthy workspace, reachable Ollama)
 *   - runChecks: fail scenario (missing workspace files, unreachable Ollama)
 *   - formatReport: output shape
 *
 * Run from factory root: tsx --test packages/cli/src/commands/diagnostics.test.ts
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  parseArgs,
  runChecks,
  formatReport,
  type DiagnosticsReport,
} from "./diagnostics.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkspace(opts: { contextFile?: boolean; tasksDir?: boolean } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-diagnostics-"));
  fs.mkdirSync(path.join(root, ".devory"), { recursive: true });

  if (opts.contextFile !== false) {
    fs.writeFileSync(path.join(root, "FACTORY_CONTEXT.md"), "# Test");
  }

  if (opts.tasksDir !== false) {
    fs.mkdirSync(path.join(root, "tasks", "backlog"), { recursive: true });
    fs.mkdirSync(path.join(root, "tasks", "done"), { recursive: true });
    fs.writeFileSync(path.join(root, "tasks", "backlog", "task-001.md"), "---\nid: task-001\n---");
    fs.writeFileSync(path.join(root, "tasks", "backlog", "task-002.md"), "---\nid: task-002\n---");
  }

  return root;
}

const ollamaPass = async (_url: string) => ({ ok: true, status: 200 });
const ollamaFail = async (_url: string) => ({ ok: false, status: 0 });

// Save and restore env
const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
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

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("diagnostics — parseArgs", () => {
  test("no args → empty args, no error", () => {
    const result = parseArgs([]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { root: undefined });
  });

  test("--root <path> is parsed", () => {
    const result = parseArgs(["--root", "/some/path"]);
    assert.equal(result.error, null);
    assert.equal(result.args?.root, "/some/path");
  });

  test("--root without value → error", () => {
    const result = parseArgs(["--root"]);
    assert.ok(result.error);
  });

  test("unknown flag → error", () => {
    const result = parseArgs(["--unknown"]);
    assert.ok(result.error);
  });
});

// ---------------------------------------------------------------------------
// runChecks — pass scenario
// ---------------------------------------------------------------------------

describe("diagnostics — pass scenario", () => {
  test("healthy workspace with Pro license returns all pass", async () => {
    const root = makeWorkspace();

    // Write a minimal license JWK + token so detectTier returns Pro
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "test-kid" };
    fs.writeFileSync(path.join(root, ".devory", "license.jwk"), JSON.stringify(jwk));

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT", kid: "test-kid" };
    const payload = { sub: "user-test", tier: "pro", iat: now, exp: now + 3600 };
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const sigInput = `${encode(header)}.${encode(payload)}`;
    const sig = crypto.createSign("RSA-SHA256").update(sigInput).sign(privateKey).toString("base64url");
    const token = `${sigInput}.${sig}`;
    fs.writeFileSync(path.join(root, ".devory", "license"), token);

    setEnv("FACTORY_DEFAULT_ENGINE", "ollama");
    setEnv("OLLAMA_BASE_URL", "http://localhost:11434");

    const report = await runChecks(root, "git-walk", { fetchOllama: ollamaPass });

    const byLabel = Object.fromEntries(report.checks.map((c) => [c.label, c]));

    assert.equal(byLabel["Factory root"].status, "pass");
    assert.equal(byLabel["FACTORY_CONTEXT.md"].status, "pass");
    assert.equal(byLabel["Tasks directory"].status, "pass");
    assert.equal(byLabel["License"].status, "pass");
    assert.equal(byLabel["Engine mode"].status, "pass");
    assert.equal(byLabel["OLLAMA_BASE_URL"].status, "pass");
    assert.equal(byLabel["Ollama reachable"].status, "pass");

    // Tasks detail mentions task count
    assert.ok(byLabel["Tasks directory"].detail.includes("2 tasks"));

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// runChecks — fail scenario
// ---------------------------------------------------------------------------

describe("diagnostics — fail scenario", () => {
  test("missing context file and tasks dir with unreachable Ollama returns fails", async () => {
    const root = makeWorkspace({ contextFile: false, tasksDir: false });

    setEnv("FACTORY_DEFAULT_ENGINE", "ollama");
    setEnv("OLLAMA_BASE_URL", "http://broken:11434");

    const report = await runChecks(root, "cwd", { fetchOllama: ollamaFail });

    const byLabel = Object.fromEntries(report.checks.map((c) => [c.label, c]));

    assert.equal(byLabel["Factory root"].status, "warn");         // cwd fallback
    assert.equal(byLabel["FACTORY_CONTEXT.md"].status, "fail");   // file missing
    assert.equal(byLabel["Tasks directory"].status, "fail");       // dir missing
    assert.equal(byLabel["Ollama reachable"].status, "fail");      // fetch returned ok=false

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("Core license (no key) produces warn", async () => {
    const root = makeWorkspace();
    setEnv("FACTORY_DEFAULT_ENGINE", "ollama");
    setEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    // Ensure no license key in env
    setEnv("DEVORY_LICENSE_KEY", undefined);

    const report = await runChecks(root, "git-walk", { fetchOllama: ollamaPass });
    const license = report.checks.find((c) => c.label === "License");
    assert.equal(license?.status, "warn");
    assert.ok(license?.detail.includes("Core"));

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("engine=claude skips Ollama reachability check", async () => {
    const root = makeWorkspace();
    setEnv("FACTORY_DEFAULT_ENGINE", "claude");
    setEnv("OLLAMA_BASE_URL", "http://localhost:11434");

    let fetchCalled = false;
    const noopFetch = async (_url: string) => {
      fetchCalled = true;
      return { ok: false, status: 0 };
    };

    const report = await runChecks(root, "git-walk", { fetchOllama: noopFetch });
    assert.equal(fetchCalled, false, "fetchOllama should not be called for non-ollama engine");

    const ollama = report.checks.find((c) => c.label === "Ollama reachable");
    assert.equal(ollama?.status, "pass");
    assert.ok(ollama?.detail.includes("skipped"));

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe("diagnostics — formatReport", () => {
  test("output contains status prefix and label for each check", () => {
    const report: DiagnosticsReport = {
      checks: [
        { label: "Factory root", status: "pass", detail: "/workspace" },
        { label: "FACTORY_CONTEXT.md", status: "fail", detail: "not found" },
        { label: "License", status: "warn", detail: "Core" },
      ],
    };

    const output = formatReport(report);
    const lines = output.split("\n");

    assert.equal(lines.length, 3);
    assert.ok(lines[0].startsWith("[PASS]"));
    assert.ok(lines[1].startsWith("[FAIL]"));
    assert.ok(lines[2].startsWith("[WARN]"));
    assert.ok(lines[0].includes("Factory root"));
    assert.ok(lines[1].includes("FACTORY_CONTEXT.md"));
    assert.ok(lines[2].includes("License"));
    assert.ok(lines[0].includes("/workspace"));
    assert.ok(lines[1].includes("not found"));
    assert.ok(lines[2].includes("Core"));
  });

  test("labels are padded to equal width", () => {
    const report: DiagnosticsReport = {
      checks: [
        { label: "A", status: "pass", detail: "d1" },
        { label: "Long label", status: "pass", detail: "d2" },
      ],
    };

    const output = formatReport(report);
    const lines = output.split("\n");
    // Both lines should have the same prefix+label segment length
    const prefixLen = "[PASS] ".length + "Long label".length;
    assert.ok(lines[0].length >= prefixLen);
  });
});
