import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./parse.ts";
import {
  buildMinimalTaskDraftFixture,
  buildRichTaskDraftFixture,
  validateTask,
  validateTaskBody,
} from "./index.ts";
import {
  buildTaskDraftTargetPath,
  renderTaskDraftMarkdown,
  renderTaskDraftTarget,
  TASK_MARKDOWN_FRONTMATTER_ORDER,
  TASK_MARKDOWN_RENDERER_VERSION,
  TASK_MARKDOWN_SECTION_ORDER,
} from "./task-markdown-renderer.ts";

const MODULE_FILE =
  typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
const MODULE_DIR =
  typeof __dirname === "string" ? __dirname : path.dirname(MODULE_FILE);
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..", "..");

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, "templates", name), "utf-8");
}

describe("task markdown renderer", () => {
  test("renders minimal draft to the shared fixture deterministically", () => {
    const draft = buildMinimalTaskDraftFixture();
    const rendered = renderTaskDraftMarkdown(draft);

    assert.equal(rendered, readTemplate("task-draft-render-minimal.md"));
    assert.equal(rendered, renderTaskDraftMarkdown(draft));
  });

  test("renders rich draft to the shared fixture with stable field ordering", () => {
    const draft = buildRichTaskDraftFixture();
    const rendered = renderTaskDraftTarget(draft);
    const frontmatterLines = rendered.markdown.split("\n").slice(1, 18);

    assert.equal(rendered.markdown, readTemplate("task-draft-render-rich.md"));
    assert.deepEqual(
      frontmatterLines.map((line) => line.split(":")[0]),
      [
        "id",
        "title",
        "project",
        "repo",
        "branch",
        "type",
        "priority",
        "status",
        "agent",
        "lane",
        "repo_area",
        "bundle_id",
        "bundle_title",
        "bundle_phase",
        "depends_on",
        "  - factory-181",
        "files_likely_affected",
      ]
    );
    assert.ok(TASK_MARKDOWN_FRONTMATTER_ORDER.includes("verification"));
    assert.deepEqual(TASK_MARKDOWN_SECTION_ORDER, [
      "## Goal",
      "## Context",
      "## Acceptance Criteria",
      "## Expected Artifacts",
      "## Failure Conditions",
      "## Reviewer Checklist",
    ]);
  });

  test("renders markdown round-trip cleanly through existing readers and validators", () => {
    const draft = buildRichTaskDraftFixture();
    const rendered = renderTaskDraftTarget(draft);
    const { meta, body } = parseFrontmatter(rendered.markdown);

    assert.equal(validateTask(meta, rendered.target_stage).valid, true);
    assert.deepEqual(validateTaskBody(body).errors, []);
    assert.equal(rendered.target_path, buildTaskDraftTargetPath("factory-184-rich", draft.title, "backlog"));
  });

  test("publishes the dedicated renderer version", () => {
    assert.equal(TASK_MARKDOWN_RENDERER_VERSION, "task-markdown-renderer-v1");
  });

  test("renders external traceability fields in frontmatter when present", () => {
    const draft = buildMinimalTaskDraftFixture({
      external_source: "github-issue",
      external_key: "owner/repo#123",
      external_url: "https://github.com/owner/repo/issues/123",
    });

    const rendered = renderTaskDraftMarkdown(draft);
    assert.match(rendered, /external_source: github-issue/);
    assert.match(rendered, /external_key: owner\/repo#123/);
    assert.match(rendered, /external_url: https:\/\/github.com\/owner\/repo\/issues\/123/);
  });
});
