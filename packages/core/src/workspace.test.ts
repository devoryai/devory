import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WORKSPACE,
  buildWorkspaceFixture,
  normalizeWorkspace,
} from "./workspace.ts";

describe("normalizeWorkspace", () => {
  it("returns a valid workspace for well-formed input", () => {
    const value = normalizeWorkspace({
      workspace_id: "workspace-1",
      name: "Client Work",
      description: "Workspace for client repos",
      repos: ["client-app", "client-api"],
      default_profile_id: "safe-default",
      integrations: {
        github_org: "client-org",
        jira_base_url: "https://jira.example.com",
      },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    assert.ok(value);
    assert.equal(value?.workspace_id, "workspace-1");
    assert.equal(value?.integrations.github_org, "client-org");
  });

  it("normalizes optional fields and defaults collections", () => {
    const value = normalizeWorkspace({
      workspace_id: "workspace-2",
      name: "Personal",
      default_profile_id: "balanced-default",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    assert.ok(value);
    assert.equal(value?.description, undefined);
    assert.deepEqual(value?.repos, []);
    assert.deepEqual(value?.integrations, {});
  });

  it("returns null for invalid input", () => {
    assert.equal(
      normalizeWorkspace({
        name: "Missing Id",
        default_profile_id: "balanced-default",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      null
    );
  });
});

describe("workspace fixtures", () => {
  it("exposes the sentinel default workspace", () => {
    assert.equal(DEFAULT_WORKSPACE.workspace_id, "default");
    assert.equal(DEFAULT_WORKSPACE.default_profile_id, "balanced-default");
  });

  it("builds a workspace fixture with stable defaults", () => {
    const fixture = buildWorkspaceFixture();
    assert.equal(fixture.workspace_id, "workspace-1");
    assert.deepEqual(fixture.integrations, {});
  });
});