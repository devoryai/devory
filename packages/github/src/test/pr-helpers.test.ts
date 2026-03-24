/**
 * packages/github/src/test/pr-helpers.test.ts
 *
 * Tests for src/lib/pr-helpers.ts.
 * Run: tsx --test packages/github/src/test/pr-helpers.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  commitType,
  taskScope,
  buildPrTitle,
  buildPrBody,
  buildPrMetadata,
} from "../lib/pr-helpers.js";

// ── commitType ─────────────────────────────────────────────────────────────

describe("commitType", () => {
  test("feature → feat", () => assert.equal(commitType("feature"), "feat"));
  test("feat → feat", () => assert.equal(commitType("feat"), "feat"));
  test("bugfix → fix", () => assert.equal(commitType("bugfix"), "fix"));
  test("bug → fix", () => assert.equal(commitType("bug"), "fix"));
  test("refactor → refactor", () => assert.equal(commitType("refactor"), "refactor"));
  test("chore → chore", () => assert.equal(commitType("chore"), "chore"));
  test("docs → docs", () => assert.equal(commitType("docs"), "docs"));
  test("documentation → docs", () => assert.equal(commitType("documentation"), "docs"));
  test("test → test", () => assert.equal(commitType("test"), "test"));
  test("perf → perf", () => assert.equal(commitType("perf"), "perf"));
  test("subtask → feat", () => assert.equal(commitType("subtask"), "feat"));
  test("unknown → feat", () => assert.equal(commitType("unknown"), "feat"));
  test("undefined → feat", () => assert.equal(commitType(undefined), "feat"));
  test("case-insensitive", () => assert.equal(commitType("FEATURE"), "feat"));
});

// ── taskScope ──────────────────────────────────────────────────────────────

describe("taskScope", () => {
  test("uses repo_area first", () => {
    assert.equal(taskScope({ repo_area: "api", lane: "infra", project: "proj" }), "api");
  });

  test("falls back to lane when no repo_area", () => {
    assert.equal(taskScope({ lane: "infra", project: "proj" }), "infra");
  });

  test("falls back to project when no repo_area or lane", () => {
    assert.equal(taskScope({ project: "ai-dev-factory" }), "ai-dev-factory");
  });

  test("defaults to 'core' when all empty", () => {
    assert.equal(taskScope({}), "core");
  });

  test("trims whitespace", () => {
    assert.equal(taskScope({ repo_area: "  api  " }), "api");
  });
});

// ── buildPrTitle ───────────────────────────────────────────────────────────

describe("buildPrTitle", () => {
  test("builds conventional-commit title", () => {
    const title = buildPrTitle({
      type: "feature",
      project: "ai-dev-factory",
      title: "GitHub Integration MVP",
    });
    assert.equal(title, "feat(ai-dev-factory): GitHub Integration MVP");
  });

  test("uses repo_area as scope when present", () => {
    const title = buildPrTitle({
      type: "bugfix",
      repo_area: "api",
      title: "Fix null pointer",
    });
    assert.ok(title.startsWith("fix(api):"));
  });

  test("truncates to 72 chars with ellipsis", () => {
    const longTitle = "A".repeat(100);
    const title = buildPrTitle({ type: "feature", project: "p", title: longTitle });
    assert.ok(title.length <= 72);
    assert.ok(title.endsWith("…"));
  });

  test("does not truncate short titles", () => {
    const title = buildPrTitle({ type: "chore", project: "proj", title: "short" });
    assert.ok(title.length < 72);
    assert.ok(!title.endsWith("…"));
  });

  test("handles missing type (defaults to feat)", () => {
    const title = buildPrTitle({ project: "p", title: "My task" });
    assert.ok(title.startsWith("feat("));
  });

  test("handles missing title", () => {
    const title = buildPrTitle({ type: "feature", project: "p" });
    assert.ok(title.includes("(untitled)"));
  });
});

// ── buildPrBody ────────────────────────────────────────────────────────────

describe("buildPrBody", () => {
  const meta = {
    id: "factory-066",
    title: "GitHub Integration MVP",
    project: "ai-dev-factory",
    type: "feature",
    priority: "medium",
    agent: "fullstack-builder",
    depends_on: ["factory-054", "factory-063"],
    verification: ["npm run test", "npm run validate:task -- tasks/backlog/factory-066.md"],
  };

  test("includes task id in body", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("factory-066"));
  });

  test("includes task title in body", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("GitHub Integration MVP"));
  });

  test("includes project in body", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("ai-dev-factory"));
  });

  test("includes depends_on when present", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("factory-054"));
    assert.ok(body.includes("factory-063"));
  });

  test("includes verification commands as checklist items", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("- [ ] `npm run test`"));
  });

  test("includes task body content when provided", () => {
    const body = buildPrBody(meta, "## Goal\nDo the thing.");
    assert.ok(body.includes("Do the thing."));
  });

  test("omits context section when body is empty", () => {
    const body = buildPrBody(meta, "");
    assert.ok(!body.includes("## Context"));
  });

  test("includes safety footer", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("human review required before merge"));
  });

  test("includes Summary section header", () => {
    const body = buildPrBody(meta, "");
    assert.ok(body.includes("## Summary"));
  });

  test("omits verification section when verification is empty", () => {
    const body = buildPrBody({ ...meta, verification: [] }, "");
    assert.ok(!body.includes("## Verification"));
  });
});

// ── buildPrMetadata ────────────────────────────────────────────────────────

describe("buildPrMetadata", () => {
  test("returns object with title and body", () => {
    const result = buildPrMetadata({ type: "feature", project: "p", title: "T" }, "");
    assert.ok(typeof result.title === "string" && result.title.length > 0);
    assert.ok(typeof result.body === "string" && result.body.length > 0);
  });

  test("title matches buildPrTitle output", () => {
    const meta = { type: "bugfix", project: "proj", title: "Fix bug" };
    const result = buildPrMetadata(meta, "");
    assert.equal(result.title, buildPrTitle(meta));
  });
});
