/**
 * packages/vscode/src/test/init-workspace.test.ts
 *
 * Unit tests for the built-in workspace initializer (runBuiltinInit).
 * Tests the pure filesystem logic — no vscode or spawn stubs required.
 *
 * The higher-level initWorkspaceCommand (which wraps vscode UI) is covered
 * by VS Code integration tests and cannot be unit-tested with tsx --test.
 *
 * Run: tsx --test packages/vscode/src/test/init-workspace.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { runBuiltinInit } from "../commands/init-workspace.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devory-init-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeOutputSpy(): { lines: string[]; appendLine(l: string): void } {
  const lines: string[] = [];
  return { lines, appendLine(l: string) { lines.push(l); } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runBuiltinInit", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmp);
  });

  it("creates the full task stage directory structure", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    for (const stage of ["backlog", "ready", "doing", "review", "done", "blocked"]) {
      assert.ok(
        fs.existsSync(path.join(tmp, "tasks", stage)),
        `tasks/${stage} should be created`
      );
    }
  });

  it("creates support directories", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.ok(fs.existsSync(path.join(tmp, "runs")), "runs/ should be created");
    assert.ok(fs.existsSync(path.join(tmp, "artifacts")), "artifacts/ should be created");
    assert.ok(fs.existsSync(path.join(tmp, "doctrine")), "doctrine/ should be created");
    assert.ok(fs.existsSync(path.join(tmp, "templates")), "templates/ should be created");
  });

  it("writes FACTORY_CONTEXT.md", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    const contextFile = path.join(tmp, "FACTORY_CONTEXT.md");
    assert.ok(fs.existsSync(contextFile), "FACTORY_CONTEXT.md should be created");
    const content = fs.readFileSync(contextFile, "utf8");
    assert.ok(content.includes("Factory Context"), "FACTORY_CONTEXT.md should have expected heading");
  });

  it("writes task-template.md in templates/", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.ok(
      fs.existsSync(path.join(tmp, "templates", "task-template.md")),
      "templates/task-template.md should be created"
    );
  });

  it("writes devory.standards.yml", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.ok(
      fs.existsSync(path.join(tmp, "devory.standards.yml")),
      "devory.standards.yml should be created"
    );
  });

  it("writes README.md when none exists", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.ok(fs.existsSync(path.join(tmp, "README.md")), "README.md should be created");
  });

  it("does not overwrite FACTORY_CONTEXT.md when it already exists", () => {
    const contextFile = path.join(tmp, "FACTORY_CONTEXT.md");
    fs.writeFileSync(contextFile, "# My custom content\n");

    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.strictEqual(
      fs.readFileSync(contextFile, "utf8"),
      "# My custom content\n",
      "existing FACTORY_CONTEXT.md must not be overwritten"
    );
  });

  it("does not overwrite README.md when it already exists", () => {
    const readmePath = path.join(tmp, "README.md");
    fs.writeFileSync(readmePath, "# My custom README\n");

    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.strictEqual(
      fs.readFileSync(readmePath, "utf8"),
      "# My custom README\n",
      "existing README.md must not be overwritten"
    );
  });

  it("logs created and skipped items to the output channel", () => {
    const output = makeOutputSpy();
    runBuiltinInit(tmp, output as any);

    assert.ok(output.lines.some(l => l.includes("created")), "should log 'created' entries");
  });

  it("logs skipped items when workspace is already initialized", () => {
    const output1 = makeOutputSpy();
    runBuiltinInit(tmp, output1 as any);

    // Run again — everything should be skipped
    const output2 = makeOutputSpy();
    runBuiltinInit(tmp, output2 as any);

    const hasSkipped = output2.lines.some(l => l.includes("skipped") || l.includes("exists"));
    assert.ok(hasSkipped, "second run should log skipped/exists entries");
  });
});
