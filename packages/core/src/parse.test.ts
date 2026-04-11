/**
 * @devory/core — parseFrontmatter tests.
 *
 * Run from factory root: tsx --test packages/core/src/parse.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "./parse.js";

// ── Basic parsing ─────────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  test("parses a minimal frontmatter block", () => {
    const content = `---
id: factory-001
title: My Task
status: backlog
---
Body text here.`;
    const { meta, body } = parseFrontmatter(content);
    assert.equal(meta.id, "factory-001");
    assert.equal(meta.title, "My Task");
    assert.equal(meta.status, "backlog");
    assert.ok(body.includes("Body text here."));
  });

  test("returns empty meta and full content when no frontmatter delimiter", () => {
    const content = "No frontmatter here.";
    const { meta, body } = parseFrontmatter(content);
    assert.deepEqual(meta, {});
    assert.equal(body, content);
  });

  test("returns empty meta when opening delimiter missing", () => {
    const content = "id: factory-001\n---\nbody";
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta, {});
  });

  test("returns empty meta when closing delimiter missing", () => {
    const content = "---\nid: factory-001\nbody without close";
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta, {});
  });

  test("parses string arrays from list items", () => {
    const content = `---
depends_on:
  - factory-001
  - factory-002
---
`;
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta.depends_on, ["factory-001", "factory-002"]);
  });

  test("parses empty array from empty value", () => {
    const content = `---
depends_on:
---
`;
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta.depends_on, []);
  });

  test("parses empty array from [] syntax", () => {
    const content = `---
depends_on: []
---
`;
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta.depends_on, []);
  });

  test("parses inline array values", () => {
    const content = `---
skills: [database-migration, test-generation]
---
`;
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta.skills, ["database-migration", "test-generation"]);
  });

  test("body does not include frontmatter", () => {
    const content = `---
id: factory-001
---
## Section
Content here.`;
    const { body } = parseFrontmatter(content);
    assert.ok(!body.includes("id: factory-001"));
    assert.ok(body.includes("## Section"));
  });

  test("parses all standard task fields", () => {
    const content = `---
id: factory-010
title: Test Task
project: ai-dev-factory
repo: .
branch: task/factory-010
type: feature
priority: high
status: ready
agent: fullstack-builder
---
`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.id, "factory-010");
    assert.equal(meta.title, "Test Task");
    assert.equal(meta.project, "ai-dev-factory");
    assert.equal(meta.type, "feature");
    assert.equal(meta.priority, "high");
    assert.equal(meta.agent, "fullstack-builder");
  });

  test("parses verification list", () => {
    const content = `---
verification:
  - npm run test
  - npm run build
---
`;
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta.verification, ["npm run test", "npm run build"]);
  });

  test("handles hyphen-containing keys like depends_on", () => {
    const content = `---
bundle-id: epic-auth
---
`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta["bundle-id"], "epic-auth");
  });

  test("trims whitespace from scalar values", () => {
    const content = `---
title:   My Task
status:  backlog
---
`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.title, "My Task");
    assert.equal(meta.status, "backlog");
  });

  test("ignores list items before any key is set", () => {
    const content = `---
  - orphaned-item
id: factory-001
---
`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.id, "factory-001");
  });

  test("empty content returns empty meta and empty body", () => {
    const { meta, body } = parseFrontmatter("");
    assert.deepEqual(meta, {});
    assert.equal(body, "");
  });

  test("content with only delimiter lines returns empty meta", () => {
    const content = "---\n---\n";
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta, {});
  });
});
