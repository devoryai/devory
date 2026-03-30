import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "./parse.ts";
import {
  buildMinimalTaskDraftFixture,
  buildRichTaskDraftFixture,
  normalizeTaskDraft,
  renderTaskDraftMarkdown,
  renderTaskDraftTarget,
  TASK_DRAFT_BODY_SECTION_ORDER,
  TASK_DRAFT_OPTIONAL_FRONTMATTER_FIELDS,
  TASK_DRAFT_RENDER_CONTRACT_VERSION,
  TASK_DRAFT_REQUIRED_FRONTMATTER_FIELDS,
} from "./task-draft.ts";
import { validateTask, validateTaskBody } from "./task-validation.ts";

describe("task draft render contract", () => {
  test("minimal task draft renders to valid markdown", () => {
    const draft = buildMinimalTaskDraftFixture();
    const markdown = renderTaskDraftMarkdown(draft);
    const { meta, body } = parseFrontmatter(markdown);

    assert.equal(normalizeTaskDraft(draft)?.draft_id, draft.draft_id);
    assert.deepEqual(
      TASK_DRAFT_REQUIRED_FRONTMATTER_FIELDS,
      ["id", "title", "project", "repo", "branch", "type", "priority", "status", "agent"]
    );
    assert.deepEqual(TASK_DRAFT_BODY_SECTION_ORDER.slice(0, 3), [
      "## Goal",
      "## Context",
      "## Acceptance Criteria",
    ]);
    assert.equal(validateTask(meta, "backlog").valid, true);
    assert.deepEqual(validateTaskBody(body).errors, []);
  });

  test("rich task draft preserves optional metadata deterministically", () => {
    const draft = buildRichTaskDraftFixture();
    const rendered = renderTaskDraftTarget(draft);

    assert.equal(rendered.target_path, "tasks/backlog/factory-184-rich-define-rich-task-draft-contract-with-optional-metadata.md");
    assert.match(rendered.markdown, /lane: planning/);
    assert.match(rendered.markdown, /repo_area: authoring/);
    assert.match(rendered.markdown, /bundle_id: epic-planning-authoring/);
    assert.match(rendered.markdown, /depends_on:\n  - factory-181/);
    assert.match(rendered.markdown, /verification:\n  - npm run validate:task -- tasks\/backlog\/factory-184.md/);
    assert.ok(TASK_DRAFT_OPTIONAL_FRONTMATTER_FIELDS.includes("bundle_phase"));
  });

  test("rejects non-task planning drafts", () => {
    assert.equal(
      normalizeTaskDraft({
        kind: "epic",
        draft_id: "epic-1",
      }),
      null
    );
  });

  test("publishes the task render contract version", () => {
    assert.equal(TASK_DRAFT_RENDER_CONTRACT_VERSION, "task-draft-render-v1");
  });
});
