import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  WORK_CONTEXT_STATUSES,
  buildWorkContextFixture,
  normalizeWorkContext,
} from "./work-context.ts";

describe("normalizeWorkContext", () => {
  it("returns a valid work context for well-formed input", () => {
    const value = normalizeWorkContext({
      context_id: "context-1",
      workspace_id: "default",
      profile_id: "balanced-default",
      name: "Issue owner/repo#123",
      source: "external",
      external_key: "owner/repo#123",
      external_url: "https://github.com/owner/repo/issues/123",
      task_ids: ["factory-123"],
      artifact_paths: ["artifacts/intake/github-owner-repo-123.md"],
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    assert.ok(value);
    assert.equal(value?.source, "external");
    assert.equal(value?.status, "active");
  });

  it("returns null for invalid status", () => {
    assert.equal(
      normalizeWorkContext({
        context_id: "context-1",
        workspace_id: "default",
        profile_id: "balanced-default",
        name: "Invalid",
        source: "external",
        status: "unknown",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      null
    );
  });
});

describe("work context fixtures", () => {
  it("exposes expected status literals", () => {
    assert.deepEqual(WORK_CONTEXT_STATUSES, ["active", "paused", "complete"]);
  });

  it("builds a fixture with deterministic defaults", () => {
    const fixture = buildWorkContextFixture();
    assert.equal(fixture.context_id, "context-1");
    assert.equal(fixture.status, "active");
  });
});