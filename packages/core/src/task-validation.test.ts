import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  applyTaskDraftValidation,
  buildMinimalTaskDraftFixture,
  buildRichTaskDraftFixture,
  validateTaskDraft,
  validateTaskMarkdown,
} from "./index.ts";

describe("task draft validation integration", () => {
  test("valid draft passes with no blocking errors", () => {
    const draft = buildMinimalTaskDraftFixture({
      draft_id: "factory-186-valid",
      reviewer_checklist: ["[ ] Validation state is populated"],
    });

    const result = validateTaskDraft(draft);

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.target_stage, "backlog");
    assert.match(result.target_path, /tasks\/backlog\/factory-186-valid-/);
  });

  test("missing required markdown sections produce blocking errors", () => {
    const result = validateTaskMarkdown(
      [
        "---",
        "id: factory-186-invalid",
        "title: Invalid markdown draft target",
        "project: ai-dev-factory",
        "repo: .",
        "branch: task/factory-186-invalid",
        "type: feature",
        "priority: high",
        "status: backlog",
        "agent: backend-builder",
        "---",
        "",
        "## Goal",
        "",
        "Show missing section failures clearly.",
        "",
        "## Context",
        "",
        "- This draft omits required sections on purpose.",
        "",
        "## Acceptance Criteria",
        "",
        "- Validation reports blocking errors.",
        "",
        "## Reviewer Checklist",
        "",
        "- [ ] Failure is explicit",
        "",
      ].join("\n"),
      "backlog"
    );

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes('Missing required section: "## Expected Artifacts"')
    );
    assert.ok(
      result.errors.includes('Missing required section: "## Failure Conditions"')
    );
  });

  test("warning-only drafts remain valid and preserve warnings", () => {
    const draft = buildMinimalTaskDraftFixture({
      draft_id: "factory-186-warning",
      reviewer_checklist: [],
    });

    const result = validateTaskDraft(draft);
    const applied = applyTaskDraftValidation(draft);

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, ['"## Reviewer Checklist" has no items']);
    assert.equal(applied.validation.status, "valid");
    assert.deepEqual(applied.validation.errors, []);
    assert.deepEqual(applied.validation.warnings, ['"## Reviewer Checklist" has no items']);
  });

  test("markdown validation stays compatible with rendered task output", () => {
    const draft = buildRichTaskDraftFixture({
      draft_id: "factory-186-markdown",
      reviewer_checklist: ["[ ] Shared validator uses markdown protocol rules"],
    });

    const rendered = validateTaskMarkdown(
      [
        "---",
        "id: factory-186-markdown",
        "title: Shared validator compatibility",
        "project: ai-dev-factory",
        "repo: .",
        "branch: task/factory-186-markdown",
        "type: feature",
        "priority: high",
        "status: backlog",
        "agent: backend-builder",
        "---",
        "",
        "## Goal",
        "",
        "Confirm markdown validation remains available.",
        "",
        "## Context",
        "",
        "- Structured drafts render through one adapter.",
        "",
        "## Acceptance Criteria",
        "",
        "- Validation uses the current markdown protocol.",
        "",
        "## Expected Artifacts",
        "",
        "- Shared validation module",
        "",
        "## Failure Conditions",
        "",
        "- Validation forks the task rules",
        "",
        "## Reviewer Checklist",
        "",
        "- [ ] Compatibility is preserved",
        "",
      ].join("\n"),
      draft.status
    );

    assert.equal(rendered.valid, true);
    assert.deepEqual(rendered.errors, []);
    assert.deepEqual(rendered.warnings, []);
  });

  test("skills inline array validates when skill directory exists", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-factory-248-"));
    fs.mkdirSync(path.join(tempRoot, "skills", "database-migration"), {
      recursive: true,
    });

    const result = validateTaskMarkdown(
      [
        "---",
        "id: factory-248-valid-skill",
        "title: Skills validation success",
        "project: ai-dev-factory",
        "repo: .",
        "branch: task/factory-248-valid-skill",
        "type: feature",
        "priority: high",
        "status: backlog",
        "agent: backend-builder",
        "skills: [database-migration]",
        "---",
        "",
        "## Goal",
        "",
        "Validate declared skills metadata.",
        "",
        "## Context",
        "",
        "- Skills are optional metadata.",
        "",
        "## Acceptance Criteria",
        "",
        "- Validator accepts known skills.",
        "",
        "## Expected Artifacts",
        "",
        "- Task metadata validation",
        "",
        "## Failure Conditions",
        "",
        "- Validation rejects known skills",
        "",
        "## Reviewer Checklist",
        "",
        "- [ ] Validation keeps warning channel clean",
      ].join("\n"),
      "backlog",
      { factoryRoot: tempRoot }
    );

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test("skills warning is advisory when directory is missing", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-factory-248-"));
    fs.mkdirSync(path.join(tempRoot, "skills"), { recursive: true });

    const result = validateTaskMarkdown(
      [
        "---",
        "id: factory-248-missing-skill",
        "title: Skills warning behavior",
        "project: ai-dev-factory",
        "repo: .",
        "branch: task/factory-248-missing-skill",
        "type: feature",
        "priority: high",
        "status: backlog",
        "agent: backend-builder",
        "skills: [unknown-skill]",
        "---",
        "",
        "## Goal",
        "",
        "Warn when referenced skill is missing.",
        "",
        "## Context",
        "",
        "- Skill directories are resolved at factory root.",
        "",
        "## Acceptance Criteria",
        "",
        "- Missing skills yield warnings.",
        "",
        "## Expected Artifacts",
        "",
        "- Warning output",
        "",
        "## Failure Conditions",
        "",
        "- Missing skills are treated as hard errors",
        "",
        "## Reviewer Checklist",
        "",
        "- [ ] Warning remains non-blocking",
      ].join("\n"),
      "backlog",
      { factoryRoot: tempRoot }
    );

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, [
      'Task metadata "skills" references unknown skill "unknown-skill" (expected directory: skills/unknown-skill)',
    ]);
  });
});
