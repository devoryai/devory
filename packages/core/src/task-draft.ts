import {
  buildTaskPlanningDraftFixture,
  normalizePlanningDraft,
  type RenderedTaskDraftTarget,
  type TaskDraftCommitStage,
  type TaskPlanningDraft,
} from "./planning-draft.ts";
import {
  renderTaskDraftMarkdown as renderTaskDraftMarkdownShared,
  renderTaskDraftTarget as renderTaskDraftTargetShared,
} from "./task-markdown-renderer.ts";

export const TASK_DRAFT_RENDER_CONTRACT_VERSION = "task-draft-render-v1" as const;

export const TASK_DRAFT_REQUIRED_FRONTMATTER_FIELDS = [
  "id",
  "title",
  "project",
  "repo",
  "branch",
  "type",
  "priority",
  "status",
  "agent",
] as const;

export const TASK_DRAFT_OPTIONAL_FRONTMATTER_FIELDS = [
  "lane",
  "repo_area",
  "bundle_id",
  "bundle_title",
  "bundle_phase",
  "depends_on",
  "files_likely_affected",
  "verification",
] as const;

export const TASK_DRAFT_BODY_SECTION_ORDER = [
  "## Goal",
  "## Context",
  "## Acceptance Criteria",
  "## Expected Artifacts",
  "## Failure Conditions",
  "## Reviewer Checklist",
] as const;

export type TaskDraft = TaskPlanningDraft;

export function normalizeTaskDraft(value: unknown): TaskPlanningDraft | null {
  const draft = normalizePlanningDraft(value);
  return draft?.kind === "task" ? draft : null;
}

export function buildMinimalTaskDraftFixture(
  overrides: Partial<TaskPlanningDraft> = {}
): TaskPlanningDraft {
  return buildTaskPlanningDraftFixture({
    draft_id: overrides.draft_id ?? "factory-184-minimal",
    title: overrides.title ?? "Define minimal task draft contract",
    project: overrides.project ?? "ai-dev-factory",
    repo: overrides.repo ?? ".",
    branch: overrides.branch ?? "task/factory-184-minimal-task-draft-contract",
    type: overrides.type ?? "feature",
    priority: overrides.priority ?? "high",
    status: overrides.status ?? "backlog",
    agent: overrides.agent ?? "backend-builder",
    external_source: overrides.external_source,
    external_key: overrides.external_key,
    external_url: overrides.external_url,
    goal:
      overrides.goal ??
      "Define the minimum structured task draft that renders to valid Devory markdown.",
    context: overrides.context ?? [
      "The render contract must remain compatible with the current validators.",
    ],
    acceptance_criteria: overrides.acceptance_criteria ?? [
      "A minimal task draft renders to valid markdown.",
    ],
    expected_artifacts: overrides.expected_artifacts ?? [
      "Shared task draft contract",
    ],
    failure_conditions: overrides.failure_conditions ?? [
      "Rendered markdown omits required sections",
    ],
    reviewer_checklist: overrides.reviewer_checklist ?? [
      "[ ] Minimal draft is validator-compatible",
    ],
    depends_on: overrides.depends_on ?? [],
    files_likely_affected: overrides.files_likely_affected ?? [],
    verification: overrides.verification ?? ["npm run test"],
    lane: overrides.lane,
    repo_area: overrides.repo_area,
    bundle_id: overrides.bundle_id,
    bundle_title: overrides.bundle_title,
    bundle_phase: overrides.bundle_phase,
  });
}

export function buildRichTaskDraftFixture(
  overrides: Partial<TaskPlanningDraft> = {}
): TaskPlanningDraft {
  return buildTaskPlanningDraftFixture({
    draft_id: overrides.draft_id ?? "factory-184-rich",
    title: overrides.title ?? "Define rich task draft contract with optional metadata",
    project: overrides.project ?? "ai-dev-factory",
    repo: overrides.repo ?? ".",
    branch: overrides.branch ?? "task/factory-184-rich-task-draft-contract",
    type: overrides.type ?? "feature",
    priority: overrides.priority ?? "high",
    status: overrides.status ?? "backlog",
    agent: overrides.agent ?? "backend-builder",
    external_source: overrides.external_source,
    external_key: overrides.external_key,
    external_url: overrides.external_url,
    lane: overrides.lane ?? "planning",
    repo_area: overrides.repo_area ?? "authoring",
    bundle_id: overrides.bundle_id ?? "epic-planning-authoring",
    bundle_title: overrides.bundle_title ?? "Planning & Task Authoring",
    bundle_phase: overrides.bundle_phase ?? "contract",
    depends_on: overrides.depends_on ?? ["factory-181"],
    files_likely_affected:
      overrides.files_likely_affected ?? [
        "packages/core/src/",
        "templates/",
      ],
    verification: overrides.verification ?? [
      "npm run validate:task -- tasks/backlog/factory-184.md",
      "npm run test",
    ],
    goal:
      overrides.goal ??
      "Define the rich structured task draft contract including optional metadata and render ordering.",
    context: overrides.context ?? [
      "Task drafts must support workflow metadata such as dependencies and bundle linkage.",
      "Rendered markdown must remain compatible with existing readers and validators.",
    ],
    acceptance_criteria: overrides.acceptance_criteria ?? [
      "Optional metadata renders deterministically.",
      "Required sections preserve the existing heading order.",
    ],
    expected_artifacts: overrides.expected_artifacts ?? [
      "Task draft contract module",
      "Task render contract fixture",
      "Task draft tests",
    ],
    failure_conditions: overrides.failure_conditions ?? [
      "Optional metadata ordering drifts across renderers",
      "Rendered markdown breaks current task readers",
    ],
    reviewer_checklist: overrides.reviewer_checklist ?? [
      "[ ] Rich draft covers optional metadata",
      "[ ] Markdown ordering is explicit and deterministic",
    ],
  });
}

export function renderTaskDraftMarkdown(draft: TaskPlanningDraft): string {
  return renderTaskDraftMarkdownShared(draft);
}

export function renderTaskDraftTarget(
  draft: TaskPlanningDraft
): RenderedTaskDraftTarget {
  return renderTaskDraftTargetShared(draft);
}

export function buildTaskDraftRenderFixture(input: {
  draft?: Partial<TaskPlanningDraft>;
  richness?: "minimal" | "rich";
  target_stage?: TaskDraftCommitStage;
} = {}): RenderedTaskDraftTarget {
  const draft =
    input.richness === "rich"
      ? buildRichTaskDraftFixture(input.draft)
      : buildMinimalTaskDraftFixture(input.draft);

  return renderTaskDraftTarget({
    ...draft,
    status: input.target_stage ?? draft.status,
    commit: {
      ...draft.commit,
      target_stage: input.target_stage ?? draft.commit.target_stage ?? draft.status,
    },
  });
}
