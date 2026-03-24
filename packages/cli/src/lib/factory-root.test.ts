/**
 * packages/cli/src/lib/factory-root.test.ts
 *
 * Tests for factory-root resolver.
 * Run: tsx --test packages/cli/src/lib/factory-root.test.ts
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  findFactoryContextDir,
  resolveFactoryRoot,
  factoryPaths,
} from "./factory-root.js";

// ── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-root-test-"));
  // Clear env vars that could interfere with tests
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
});

// ── findFactoryContextDir ──────────────────────────────────────────────────

describe("findFactoryContextDir", () => {
  test("returns the directory containing FACTORY_CONTEXT.md", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    assert.equal(findFactoryContextDir(tmpDir), tmpDir);
  });

  test("walks up to find FACTORY_CONTEXT.md in parent", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    const subDir = path.join(tmpDir, "sub", "deep");
    fs.mkdirSync(subDir, { recursive: true });
    assert.equal(findFactoryContextDir(subDir), tmpDir);
  });

  test("returns null when FACTORY_CONTEXT.md is not found", () => {
    const subDir = path.join(tmpDir, "sub");
    fs.mkdirSync(subDir);
    assert.equal(findFactoryContextDir(subDir), null);
  });

  test("stops at filesystem root without crashing", () => {
    // Start from a deeply nested path where marker doesn't exist
    const result = findFactoryContextDir(os.tmpdir());
    // May or may not be null depending on whether /tmp has FACTORY_CONTEXT.md
    // — just ensure it returns without throwing
    assert.ok(result === null || typeof result === "string");
  });
});

// ── resolveFactoryRoot ─────────────────────────────────────────────────────

describe("resolveFactoryRoot", () => {
  test("DEVORY_FACTORY_ROOT env takes highest priority", () => {
    process.env.DEVORY_FACTORY_ROOT = "/explicit/path";
    process.env.FACTORY_ROOT = "/legacy/path";
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");

    const result = resolveFactoryRoot(tmpDir);
    assert.equal(result.root, "/explicit/path");
    assert.equal(result.source, "env:DEVORY_FACTORY_ROOT");
  });

  test("FACTORY_ROOT env is used when DEVORY_FACTORY_ROOT is absent", () => {
    process.env.FACTORY_ROOT = "/legacy/path";
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");

    const result = resolveFactoryRoot(tmpDir);
    assert.equal(result.root, "/legacy/path");
    assert.equal(result.source, "env:FACTORY_ROOT");
  });

  test("git-walk wins when no env vars set and marker found", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    const subDir = path.join(tmpDir, "deep");
    fs.mkdirSync(subDir);

    const result = resolveFactoryRoot(subDir);
    assert.equal(result.root, tmpDir);
    assert.equal(result.source, "git-walk");
  });

  test("falls back to cwd when no marker and no env vars", () => {
    const subDir = path.join(tmpDir, "no-marker");
    fs.mkdirSync(subDir);

    const result = resolveFactoryRoot(subDir);
    assert.equal(result.root, subDir);
    assert.equal(result.source, "cwd");
  });

  test("trims whitespace from DEVORY_FACTORY_ROOT", () => {
    process.env.DEVORY_FACTORY_ROOT = "  /trimmed/path  ";
    const result = resolveFactoryRoot(tmpDir);
    assert.equal(result.root, "/trimmed/path");
  });

  test("trims whitespace from FACTORY_ROOT", () => {
    process.env.FACTORY_ROOT = "  /legacy/trimmed  ";
    const result = resolveFactoryRoot(tmpDir);
    assert.equal(result.root, "/legacy/trimmed");
  });

  test("ignores empty DEVORY_FACTORY_ROOT string", () => {
    process.env.DEVORY_FACTORY_ROOT = "";
    process.env.FACTORY_ROOT = "/legacy";
    const result = resolveFactoryRoot(tmpDir);
    assert.equal(result.source, "env:FACTORY_ROOT");
  });

  test("ignores whitespace-only FACTORY_ROOT", () => {
    process.env.FACTORY_ROOT = "   ";
    const subDir = path.join(tmpDir, "no-marker");
    fs.mkdirSync(subDir);
    const result = resolveFactoryRoot(subDir);
    assert.equal(result.source, "cwd");
  });
});

// ── factoryPaths ───────────────────────────────────────────────────────────

describe("factoryPaths", () => {
  test("returns correct paths derived from root", () => {
    const paths = factoryPaths("/my/factory");
    assert.equal(paths.tasksDir, "/my/factory/tasks");
    assert.equal(paths.runsDir, "/my/factory/runs");
    assert.equal(paths.artifactsDir, "/my/factory/artifacts");
    assert.equal(paths.contextFile, "/my/factory/FACTORY_CONTEXT.md");
  });

  test("uses path.join for correct OS separators", () => {
    const paths = factoryPaths("/root");
    assert.ok(paths.tasksDir.startsWith("/root"));
    assert.ok(paths.tasksDir.endsWith("tasks"));
  });
});
