/**
 * packages/vscode/src/test/seed-starter.test.ts
 *
 * Tests for src/lib/seed-starter.ts
 * No vscode dependency — runs directly under tsx --test.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { seedStarterFiles } from "../lib/seed-starter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devory-seed-test-"));
}

function makeRuntimeRoot(): string {
  const root = makeTmpDir();
  const doctrineDir = path.join(root, "templates", "starter", "doctrine");
  const skillDir = path.join(root, "templates", "starter", "skills", "test-generation");
  fs.mkdirSync(doctrineDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(doctrineDir, "engineering-principles.md"), "# Engineering Principles\n");
  fs.writeFileSync(path.join(doctrineDir, "code-style.md"), "# Code Style\n");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Test Generation\n");
  return root;
}

function makeOutputAppender(): { lines: string[]; appendLine(s: string): void } {
  const lines: string[] = [];
  return { lines, appendLine(s: string) { lines.push(s); } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("seedStarterFiles", () => {
  let factoryRoot: string;
  let runtimeRoot: string;

  beforeEach(() => {
    factoryRoot = makeTmpDir();
    runtimeRoot = makeRuntimeRoot();
  });

  afterEach(() => {
    fs.rmSync(factoryRoot, { recursive: true, force: true });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });

  test("copies starter doctrine files into a fresh workspace", () => {
    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    assert.ok(
      fs.existsSync(path.join(factoryRoot, "doctrine", "engineering-principles.md")),
      "engineering-principles.md should be seeded"
    );
    assert.ok(
      fs.existsSync(path.join(factoryRoot, "doctrine", "code-style.md")),
      "code-style.md should be seeded"
    );
  });

  test("copies starter skill files into a fresh workspace", () => {
    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    assert.ok(
      fs.existsSync(path.join(factoryRoot, "skills", "test-generation", "SKILL.md")),
      "SKILL.md should be seeded"
    );
  });

  test("appends a confirmation line to the output channel", () => {
    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    assert.ok(
      output.lines.some((l) => l.includes("Starter doctrine and skills copied")),
      "should log confirmation message"
    );
  });

  test("does not overwrite existing doctrine files", () => {
    const doctrineDir = path.join(factoryRoot, "doctrine");
    fs.mkdirSync(doctrineDir, { recursive: true });
    fs.writeFileSync(
      path.join(doctrineDir, "engineering-principles.md"),
      "# My custom principles\n"
    );

    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    const content = fs.readFileSync(
      path.join(doctrineDir, "engineering-principles.md"),
      "utf8"
    );
    assert.strictEqual(content, "# My custom principles\n", "existing doctrine file must not be overwritten");
  });

  test("does not seed doctrine when existing .md files are present", () => {
    const doctrineDir = path.join(factoryRoot, "doctrine");
    fs.mkdirSync(doctrineDir, { recursive: true });
    fs.writeFileSync(path.join(doctrineDir, "custom.md"), "custom\n");

    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    // code-style.md should NOT have been copied since doctrine already has .md files
    assert.ok(
      !fs.existsSync(path.join(doctrineDir, "code-style.md")),
      "should not seed doctrine when .md files already exist"
    );
  });

  test("does not overwrite existing skill files", () => {
    const skillDir = path.join(factoryRoot, "skills", "test-generation");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My custom skill\n");

    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    const content = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
    assert.strictEqual(content, "# My custom skill\n", "existing skill file must not be overwritten");
  });

  test("does not seed skills when SKILL.md subdirectory already exists", () => {
    const skillDir = path.join(factoryRoot, "skills", "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My skill\n");

    const output = makeOutputAppender();
    seedStarterFiles(factoryRoot, runtimeRoot, output);

    // test-generation should NOT have been added since skills already has SKILL.md dirs
    assert.ok(
      !fs.existsSync(path.join(factoryRoot, "skills", "test-generation", "SKILL.md")),
      "should not seed skills when SKILL.md subdirs already exist"
    );
  });

  test("silently skips when runtimeRoot templates do not exist", () => {
    const emptyRuntime = makeTmpDir();
    const output = makeOutputAppender();

    // Should not throw even though templates dir doesn't exist
    assert.doesNotThrow(() => seedStarterFiles(factoryRoot, emptyRuntime, output));

    fs.rmSync(emptyRuntime, { recursive: true, force: true });
  });
});
