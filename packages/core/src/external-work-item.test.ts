import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildExternalWorkItemFixture,
  normalizeExternalWorkItem,
} from "./external-work-item.ts";

describe("normalizeExternalWorkItem", () => {
  it("returns a valid item for well-formed input", () => {
    const value = normalizeExternalWorkItem({
      source: "github-issue",
      key: "owner/repo#123",
      url: "https://github.com/owner/repo/issues/123",
      title: "Fix flaky tests",
      description: "Stabilize runtime test suite.",
      acceptance_criteria: ["Flake rate is reduced"],
      labels: ["bug"],
      repo: "owner/repo",
      project: "ai-dev-factory",
    });

    assert.ok(value);
    assert.equal(value?.source, "github-issue");
    assert.equal(value?.key, "owner/repo#123");
    assert.deepEqual(value?.acceptance_criteria, ["Flake rate is reduced"]);
  });

  it("falls back unknown source values to github-issue", () => {
    const value = normalizeExternalWorkItem({
      source: "unknown-system",
      key: "PROJ-456",
      url: "https://example.atlassian.net/browse/PROJ-456",
      title: "Add write-back drafts",
      description: "Generate status comments for external systems.",
      acceptance_criteria: [],
      labels: [],
    });

    assert.ok(value);
    assert.equal(value?.source, "github-issue");
  });

  it("returns null when required fields are missing", () => {
    assert.equal(
      normalizeExternalWorkItem({
        source: "jira",
        key: "PROJ-456",
        url: "https://example.atlassian.net/browse/PROJ-456",
      }),
      null
    );
  });
});

describe("buildExternalWorkItemFixture", () => {
  it("returns a stable valid fixture without overrides", () => {
    const fixture = buildExternalWorkItemFixture();
    assert.equal(fixture.source, "github-issue");
    assert.equal(fixture.key, "owner/repo#123");
    assert.ok(fixture.title.length > 0);
  });
});
