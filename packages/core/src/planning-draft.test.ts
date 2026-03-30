import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "./parse.ts";
import {
  buildEpicPlanningDraft,
  buildEpicPlanningDraftFixture,
  buildPlanningDraftArtifactPath,
  buildPlanningDraftStorageRelativePath,
  buildTaskPlanningDraftFixture,
  normalizePlanningDraft,
  PLANNING_DRAFT_CONTRACT_VERSION,
  renderTaskPlanningDraftTarget,
  serializePlanningDraft,
  updateEpicPlanningDraft,
} from "./planning-draft.ts";
import { validateTask, validateTaskBody } from "./task-validation.ts";

describe("planning draft contract", () => {
  test("builds and normalizes an epic planning draft fixture", () => {
    const draft = buildEpicPlanningDraftFixture();
    const normalized = normalizePlanningDraft(draft);

    assert.equal(draft.version, PLANNING_DRAFT_CONTRACT_VERSION);
    assert.equal(draft.kind, "epic");
    assert.equal(draft.storage.artifact_path, buildPlanningDraftArtifactPath("epic", draft.draft_id));
    assert.deepEqual(normalized, draft);
  });

  test("builds and normalizes a task planning draft fixture", () => {
    const draft = buildTaskPlanningDraftFixture({
      draft_id: "factory-181",
    });
    const normalized = normalizePlanningDraft(draft);

    assert.equal(draft.kind, "task");
    assert.equal(draft.commit.state, "ready_to_commit");
    assert.equal(draft.commit.committed_task_id, "factory-181");
    assert.deepEqual(normalized, draft);
  });

  test("builds and updates an epic planning draft from canonical inputs", () => {
    const draft = buildEpicPlanningDraft({
      draft_id: "epic-build-test",
      title: "  Build planning draft  ",
      objective: "  Capture epic intent  ",
      scope: ["Initial scope"],
      created_at: "2026-03-29T00:00:00.000Z",
    });
    const updated = updateEpicPlanningDraft(draft, {
      notes: ["Refined after review"],
      updated_at: "2026-03-29T00:30:00.000Z",
    });

    assert.equal(draft.storage.artifact_path, buildPlanningDraftArtifactPath("epic", "epic-build-test"));
    assert.equal(
      buildPlanningDraftStorageRelativePath("epic", "epic-build-test"),
      "planning-drafts/epic/epic-build-test.json"
    );
    assert.equal(updated.title, "Build planning draft");
    assert.equal(updated.objective, "Capture epic intent");
    assert.deepEqual(updated.notes, ["Refined after review"]);
  });

  test("renders a committed task target compatible with the current markdown protocol", () => {
    const draft = buildTaskPlanningDraftFixture({
      draft_id: "factory-181",
      reviewer_checklist: [
        "[ ] Contract covers epic and task drafts",
        "[ ] Markdown compatibility is explicit",
      ],
    });

    const rendered = renderTaskPlanningDraftTarget(draft);
    const { meta, body } = parseFrontmatter(rendered.markdown);
    const frontmatterValidation = validateTask(meta, rendered.target_stage);
    const bodyValidation = validateTaskBody(body);

    assert.equal(rendered.target_path, "tasks/backlog/factory-181-define-the-structured-planning-draft-model-for-epics-and-tasks.md");
    assert.equal(meta.id, "factory-181");
    assert.equal(meta.status, "backlog");
    assert.equal(frontmatterValidation.valid, true);
    assert.deepEqual(bodyValidation.errors, []);
  });

  test("rejects invalid draft records", () => {
    assert.equal(
      normalizePlanningDraft({
        kind: "task",
        draft_id: "broken-task",
        title: "Broken draft",
      }),
      null
    );
    assert.equal(
      normalizePlanningDraft({
        kind: "epic",
        draft_id: "broken-epic",
        created_at: "2026-03-29T00:00:00.000Z",
        updated_at: "2026-03-29T00:00:00.000Z",
        title: "Broken epic",
      }),
      null
    );
  });

  test("serializes normalized planning drafts as newline-terminated JSON", () => {
    const serialized = serializePlanningDraft(buildEpicPlanningDraftFixture());
    assert.match(serialized, /"kind": "epic"/);
    assert.ok(serialized.endsWith("\n"));
  });
});
