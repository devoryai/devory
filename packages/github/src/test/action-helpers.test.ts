/**
 * packages/github/src/test/action-helpers.test.ts
 *
 * Tests for src/lib/action-helpers.ts.
 * Verifies the correct output format without actually writing to env files.
 *
 * Run: tsx --test packages/github/src/test/action-helpers.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  setOutput,
  setOutputs,
  setEnv,
  appendStepSummary,
  isGitHubActions,
  getRunId,
  getRepoSlug,
} from "../lib/action-helpers.js";

// ── Return value tests (no env files) ─────────────────────────────────────

describe("setOutput return value", () => {
  test("returns name=value string", () => {
    const line = setOutput("branch", "feat/factory-066");
    assert.equal(line, "branch=feat/factory-066");
  });

  test("handles values with spaces", () => {
    const line = setOutput("title", "feat(core): My Title");
    assert.equal(line, "title=feat(core): My Title");
  });
});

describe("setOutputs return value", () => {
  test("returns array of name=value strings", () => {
    const lines = setOutputs({ branch: "feat/x", title: "feat(p): T" });
    assert.equal(lines.length, 2);
    assert.ok(lines.includes("branch=feat/x"));
    assert.ok(lines.includes("title=feat(p): T"));
  });

  test("returns empty array for empty input", () => {
    const lines = setOutputs({});
    assert.deepEqual(lines, []);
  });
});

describe("setEnv return value", () => {
  test("returns NAME=value string", () => {
    const line = setEnv("DEVORY_BRANCH", "feat/my-branch");
    assert.equal(line, "DEVORY_BRANCH=feat/my-branch");
  });
});

describe("appendStepSummary return value", () => {
  test("returns the markdown passed in", () => {
    const md = "# My Summary\nSome content.";
    const result = appendStepSummary(md);
    assert.equal(result, md);
  });
});

// ── Detection helpers ──────────────────────────────────────────────────────

describe("isGitHubActions", () => {
  test("returns false when GITHUB_ACTIONS is not set", () => {
    const saved = process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_ACTIONS;
    assert.equal(isGitHubActions(), false);
    if (saved !== undefined) process.env.GITHUB_ACTIONS = saved;
  });

  test("returns true when GITHUB_ACTIONS=true", () => {
    const saved = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "true";
    assert.equal(isGitHubActions(), true);
    if (saved !== undefined) process.env.GITHUB_ACTIONS = saved;
    else delete process.env.GITHUB_ACTIONS;
  });
});

describe("getRunId", () => {
  test("returns null when GITHUB_RUN_ID not set", () => {
    const saved = process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ID;
    assert.equal(getRunId(), null);
    if (saved !== undefined) process.env.GITHUB_RUN_ID = saved;
  });

  test("returns run ID string when set", () => {
    const saved = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = "12345";
    assert.equal(getRunId(), "12345");
    if (saved !== undefined) process.env.GITHUB_RUN_ID = saved;
    else delete process.env.GITHUB_RUN_ID;
  });
});

describe("getRepoSlug", () => {
  test("returns null when GITHUB_REPOSITORY not set", () => {
    const saved = process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_REPOSITORY;
    assert.equal(getRepoSlug(), null);
    if (saved !== undefined) process.env.GITHUB_REPOSITORY = saved;
  });

  test("returns owner/repo when set", () => {
    const saved = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = "devory/ai-dev-factory";
    assert.equal(getRepoSlug(), "devory/ai-dev-factory");
    if (saved !== undefined) process.env.GITHUB_REPOSITORY = saved;
    else delete process.env.GITHUB_REPOSITORY;
  });
});

// ── Live file writing (with GITHUB_OUTPUT set) ─────────────────────────────

describe("setOutput file writing", () => {
  let tmpDir: string;
  let outputFile: string;
  const originalEnv = process.env.GITHUB_OUTPUT;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-gh-test-"));
    outputFile = path.join(tmpDir, "output");
    fs.writeFileSync(outputFile, "", "utf-8");
    process.env.GITHUB_OUTPUT = outputFile;
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.GITHUB_OUTPUT = originalEnv;
    } else {
      delete process.env.GITHUB_OUTPUT;
    }
  });

  test("appends name=value to GITHUB_OUTPUT file", () => {
    setOutput("my-key", "my-value");
    const content = fs.readFileSync(outputFile, "utf-8");
    assert.ok(content.includes("my-key=my-value"));
  });

  test("multiple outputs are each on their own line", () => {
    fs.writeFileSync(outputFile, "", "utf-8"); // reset
    setOutput("a", "1");
    setOutput("b", "2");
    const lines = fs.readFileSync(outputFile, "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);
  });
});
