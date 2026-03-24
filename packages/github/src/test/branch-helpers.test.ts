/**
 * packages/github/src/test/branch-helpers.test.ts
 *
 * Tests for src/lib/branch-helpers.ts.
 * Run: tsx --test packages/github/src/test/branch-helpers.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  slugify,
  branchPrefix,
  buildBranchName,
} from "../lib/branch-helpers.js";

// ── slugify ────────────────────────────────────────────────────────────────

describe("slugify", () => {
  test("lowercases input", () => {
    assert.equal(slugify("Hello World"), "hello-world");
  });

  test("replaces spaces with hyphens", () => {
    assert.equal(slugify("foo bar baz"), "foo-bar-baz");
  });

  test("collapses multiple non-alphanumeric chars to one hyphen", () => {
    assert.equal(slugify("foo  --  bar"), "foo-bar");
  });

  test("strips leading and trailing hyphens", () => {
    assert.equal(slugify("  hello  "), "hello");
  });

  test("handles numbers", () => {
    assert.equal(slugify("Factory 066 MVP"), "factory-066-mvp");
  });

  test("truncates at maxLen", () => {
    const long = "a".repeat(100);
    assert.equal(slugify(long, 10).length, 10);
  });

  test("empty string returns empty string", () => {
    assert.equal(slugify(""), "");
  });

  test("strips special characters", () => {
    assert.equal(slugify("feat: add @devory/core"), "feat-add-devory-core");
  });
});

// ── branchPrefix ──────────────────────────────────────────────────────────

describe("branchPrefix", () => {
  test("feature → feat", () => assert.equal(branchPrefix("feature"), "feat"));
  test("feat → feat", () => assert.equal(branchPrefix("feat"), "feat"));
  test("bugfix → fix", () => assert.equal(branchPrefix("bugfix"), "fix"));
  test("bug → fix", () => assert.equal(branchPrefix("bug"), "fix"));
  test("refactor → refactor", () => assert.equal(branchPrefix("refactor"), "refactor"));
  test("chore → chore", () => assert.equal(branchPrefix("chore"), "chore"));
  test("docs → docs", () => assert.equal(branchPrefix("docs"), "docs"));
  test("documentation → docs", () => assert.equal(branchPrefix("documentation"), "docs"));
  test("unknown type defaults to task", () => assert.equal(branchPrefix("unknown"), "task"));
  test("undefined defaults to task", () => assert.equal(branchPrefix(undefined), "task"));
  test("case-insensitive", () => assert.equal(branchPrefix("FEATURE"), "feat"));
});

// ── buildBranchName ────────────────────────────────────────────────────────

describe("buildBranchName — task-meta source", () => {
  test("uses meta.branch when present", () => {
    const r = buildBranchName({ branch: "task/factory-066-my-feature" });
    assert.equal(r.branch, "task/factory-066-my-feature");
    assert.equal(r.source, "task-meta");
    assert.equal(r.warnings.length, 0);
  });

  test("uses meta.branch even if type/id/title are present", () => {
    const r = buildBranchName({
      branch: "custom/my-branch",
      id: "factory-001",
      title: "Something else",
      type: "feature",
    });
    assert.equal(r.branch, "custom/my-branch");
    assert.equal(r.source, "task-meta");
  });

  test("trims whitespace from meta.branch", () => {
    const r = buildBranchName({ branch: "  feat/some-branch  " });
    assert.equal(r.branch, "feat/some-branch");
  });
});

describe("buildBranchName — derived source", () => {
  test("derives from id and title when no branch field", () => {
    const r = buildBranchName({
      id: "factory-066",
      title: "GitHub Integration MVP",
      type: "feature",
    });
    assert.equal(r.source, "derived");
    assert.ok(r.branch.includes("factory-066"));
    assert.ok(r.branch.includes("github-integration-mvp"));
  });

  test("branch starts with type-based prefix", () => {
    const r = buildBranchName({ id: "x", title: "y", type: "bugfix" });
    assert.ok(r.branch.startsWith("fix/"));
  });

  test("branch starts with 'task/' for unknown type", () => {
    const r = buildBranchName({ id: "x", title: "y", type: "unknown" });
    assert.ok(r.branch.startsWith("task/"));
  });

  test("branch starts with 'task/' when type is missing", () => {
    const r = buildBranchName({ id: "x", title: "y" });
    assert.ok(r.branch.startsWith("task/"));
  });

  test("branch contains id", () => {
    const r = buildBranchName({ id: "factory-099", title: "My Task" });
    assert.ok(r.branch.includes("factory-099"));
  });

  test("branch slug is lowercase", () => {
    const r = buildBranchName({ id: "x", title: "Hello World" });
    assert.equal(r.branch, r.branch.toLowerCase());
  });

  test("handles title with special chars", () => {
    const r = buildBranchName({ id: "f-001", title: "Add @devory/core to repo" });
    assert.ok(!r.branch.includes("@"));
    assert.ok(!r.branch.includes("/devory"));
  });

  test("falls back to id-only when title is empty", () => {
    const r = buildBranchName({ id: "factory-001", title: "" });
    assert.equal(r.source, "derived");
    assert.ok(r.branch.includes("factory-001"));
    assert.equal(r.warnings.length, 1);
  });

  test("returns fallback branch when id and title both empty", () => {
    const r = buildBranchName({});
    assert.equal(r.branch, "task/unnamed");
    assert.ok(r.warnings.length > 0);
  });
});

describe("buildBranchName — branch name format", () => {
  test("branch contains no whitespace", () => {
    const r = buildBranchName({ id: "factory-066", title: "Multi Word Title Here" });
    assert.ok(!/\s/.test(r.branch));
  });

  test("branch length is reasonable (under 80 chars)", () => {
    const r = buildBranchName({
      id: "factory-066",
      title: "A very long task title that might overflow the branch name limit",
      type: "feature",
    });
    assert.ok(r.branch.length <= 80);
  });
});
