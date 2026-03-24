/**
 * packages/github/src/test/pr-create.test.ts
 *
 * Tests for src/lib/pr-create.ts — gated PR creation helper.
 * All tests use pure functions; no process spawning.
 *
 * Run: tsx --test packages/github/src/test/pr-create.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  canCreatePr,
  prCreateBlockedReason,
  buildGhCreateArgs,
  createPr,
} from "../lib/pr-create.js";

const META = {
  id: "factory-071",
  title: "GitHub PR creation (gated automation)",
  project: "ai-dev-factory",
  type: "feature" as const,
  priority: "high" as const,
  status: "review" as const,
  repo: ".",
  branch: "task/factory-071-github-pr-creation",
};

const BODY = "## Goal\n\nAdd gated PR creation to the factory.";

// ---------------------------------------------------------------------------
// canCreatePr
// ---------------------------------------------------------------------------

describe("canCreatePr", () => {
  test("returns true when GITHUB_TOKEN is set", () => {
    assert.equal(canCreatePr({ GITHUB_TOKEN: "ghp_test_token" }), true);
  });

  test("returns false when GITHUB_TOKEN is absent", () => {
    assert.equal(canCreatePr({}), false);
  });

  test("returns false when GITHUB_TOKEN is empty string", () => {
    assert.equal(canCreatePr({ GITHUB_TOKEN: "" }), false);
  });

  test("returns false when GITHUB_TOKEN is whitespace only", () => {
    assert.equal(canCreatePr({ GITHUB_TOKEN: "   " }), false);
  });

  test("returns true for non-empty token with whitespace padding", () => {
    // Token itself has content — only the full value is checked
    assert.equal(canCreatePr({ GITHUB_TOKEN: " ghp_abc " }), true);
  });
});

// ---------------------------------------------------------------------------
// prCreateBlockedReason
// ---------------------------------------------------------------------------

describe("prCreateBlockedReason", () => {
  const validOptions = {
    confirm: true,
    branch: "task/factory-071",
    env: { GITHUB_TOKEN: "ghp_test" },
  };

  test("returns null when all guards pass", () => {
    assert.equal(
      prCreateBlockedReason(validOptions, { GITHUB_TOKEN: "ghp_test" }),
      null
    );
  });

  test("blocks when confirm is false", () => {
    const reason = prCreateBlockedReason(
      { ...validOptions, confirm: false },
      { GITHUB_TOKEN: "ghp_test" }
    );
    assert.ok(reason !== null);
    assert.ok(reason!.includes("--confirm"));
  });

  test("blocks when branch is empty string", () => {
    const reason = prCreateBlockedReason(
      { ...validOptions, branch: "" },
      { GITHUB_TOKEN: "ghp_test" }
    );
    assert.ok(reason !== null);
    assert.ok(reason!.includes("branch"));
  });

  test("blocks when branch is whitespace only", () => {
    const reason = prCreateBlockedReason(
      { ...validOptions, branch: "   " },
      { GITHUB_TOKEN: "ghp_test" }
    );
    assert.ok(reason !== null);
    assert.ok(reason!.includes("branch"));
  });

  test("blocks when GITHUB_TOKEN is absent", () => {
    const reason = prCreateBlockedReason(validOptions, {});
    assert.ok(reason !== null);
    assert.ok(reason!.includes("GITHUB_TOKEN"));
  });

  test("confirm guard takes priority over token guard", () => {
    const reason = prCreateBlockedReason(
      { ...validOptions, confirm: false },
      {} // no token
    );
    assert.ok(reason !== null);
    assert.ok(reason!.includes("--confirm"));
  });
});

// ---------------------------------------------------------------------------
// buildGhCreateArgs
// ---------------------------------------------------------------------------

describe("buildGhCreateArgs", () => {
  test("includes 'pr create' subcommand", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    assert.equal(args[0], "pr");
    assert.equal(args[1], "create");
  });

  test("includes --title derived from meta", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    const i = args.indexOf("--title");
    assert.ok(i >= 0);
    assert.ok(args[i + 1].includes("GitHub PR creation"));
  });

  test("includes --body derived from meta + task body", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    const i = args.indexOf("--body");
    assert.ok(i >= 0);
    assert.ok(args[i + 1].includes("factory-071"));
  });

  test("includes --head with branch name", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    const i = args.indexOf("--head");
    assert.ok(i >= 0 && args[i + 1] === "task/factory-071");
  });

  test("defaults --base to main", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    const i = args.indexOf("--base");
    assert.ok(i >= 0 && args[i + 1] === "main");
  });

  test("uses custom --base when provided", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071", base: "develop" });
    const i = args.indexOf("--base");
    assert.ok(i >= 0 && args[i + 1] === "develop");
  });

  test("title follows conventional-commit format", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    const i = args.indexOf("--title");
    assert.ok(args[i + 1].startsWith("feat("));
  });

  test("body contains summary section", () => {
    const args = buildGhCreateArgs(META, BODY, { branch: "task/factory-071" });
    const i = args.indexOf("--body");
    assert.ok(args[i + 1].includes("## Summary"));
  });
});

// ---------------------------------------------------------------------------
// createPr — guard paths (no process spawning)
// ---------------------------------------------------------------------------

describe("createPr — guard paths", () => {
  test("returns skipped when confirm is false", () => {
    const result = createPr(META, BODY, {
      confirm: false,
      branch: "task/factory-071",
      env: { GITHUB_TOKEN: "ghp_test" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.ok(result.error?.includes("--confirm"));
  });

  test("returns skipped when GITHUB_TOKEN is absent", () => {
    const result = createPr(META, BODY, {
      confirm: true,
      branch: "task/factory-071",
      env: {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.ok(result.error?.includes("GITHUB_TOKEN"));
  });

  test("returns skipped when branch is empty", () => {
    const result = createPr(META, BODY, {
      confirm: true,
      branch: "",
      env: { GITHUB_TOKEN: "ghp_test" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.ok(result.error?.includes("branch"));
  });

  test("skipped result has no prUrl", () => {
    const result = createPr(META, BODY, {
      confirm: false,
      branch: "task/factory-071",
      env: { GITHUB_TOKEN: "ghp_test" },
    });
    assert.equal(result.prUrl, undefined);
  });
});
