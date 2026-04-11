import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { fetchGitHubIssue, isGitHubIssueUrl } from "../lib/issue-adapter.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
});

describe("isGitHubIssueUrl", () => {
  test("returns true for issue URLs", () => {
    assert.equal(isGitHubIssueUrl("https://github.com/owner/repo/issues/123"), true);
    assert.equal(isGitHubIssueUrl("https://github.com/owner/repo/issues/123/"), true);
    assert.equal(isGitHubIssueUrl("https://github.com/owner/repo/issues/123?x=1"), true);
  });

  test("returns false for non-issue GitHub URLs", () => {
    assert.equal(isGitHubIssueUrl("https://github.com/owner/repo/pull/123"), false);
    assert.equal(isGitHubIssueUrl("https://example.com/foo"), false);
  });
});

describe("fetchGitHubIssue", () => {
  test("returns normalized ExternalWorkItem for successful response", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        title: "Improve intake flow",
        body: "Implement URL normalization",
        html_url: "https://github.com/owner/repo/issues/123",
        labels: [{ name: "intake" }, { name: "planning" }],
      }),
    })) as typeof fetch;

    const item = await fetchGitHubIssue("https://github.com/owner/repo/issues/123");
    assert.equal(item.source, "github-issue");
    assert.equal(item.key, "owner/repo#123");
    assert.equal(item.repo, "owner/repo");
    assert.deepEqual(item.labels, ["intake", "planning"]);
  });

  test("throws descriptive 404 error", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    globalThis.fetch = (async () => ({ ok: false, status: 404 })) as typeof fetch;

    await assert.rejects(
      () => fetchGitHubIssue("https://github.com/owner/repo/issues/404"),
      /GitHub issue not found/
    );
  });

  test("throws descriptive auth error", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    globalThis.fetch = (async () => ({ ok: false, status: 401 })) as typeof fetch;

    await assert.rejects(
      () => fetchGitHubIssue("https://github.com/owner/repo/issues/1"),
      /GitHub authentication failed/
    );
  });

  test("throws when GITHUB_TOKEN is missing at call time", async () => {
    delete process.env.GITHUB_TOKEN;
    await assert.rejects(
      () => fetchGitHubIssue("https://github.com/owner/repo/issues/1"),
      /GITHUB_TOKEN is required/
    );
  });

  test("throws on malformed issue URL", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    await assert.rejects(() => fetchGitHubIssue("https://github.com/owner/repo/pull/1"), /invalid/);
  });
});
