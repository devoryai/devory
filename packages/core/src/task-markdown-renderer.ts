import type {
  RenderedTaskDraftTarget,
  TaskDraftCommitStage,
  TaskPlanningDraft,
} from "./planning-draft.ts";

export const TASK_MARKDOWN_RENDERER_VERSION = "task-markdown-renderer-v1" as const;

export const TASK_MARKDOWN_FRONTMATTER_ORDER = [
  "id",
  "title",
  "project",
  "repo",
  "branch",
  "type",
  "priority",
  "status",
  "agent",
  "external_source",
  "external_key",
  "external_url",
  "lane",
  "repo_area",
  "bundle_id",
  "bundle_title",
  "bundle_phase",
  "depends_on",
  "files_likely_affected",
  "verification",
] as const;

export const TASK_MARKDOWN_SECTION_ORDER = [
  "## Goal",
  "## Context",
  "## Acceptance Criteria",
  "## Expected Artifacts",
  "## Failure Conditions",
  "## Reviewer Checklist",
] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTaskDraftTargetPath(
  taskId: string,
  title: string,
  stage: TaskDraftCommitStage
): string {
  return `tasks/${stage}/${taskId}-${slugify(title)}.md`;
}

function pushOptionalFrontmatter(lines: string[], key: string, value: string | undefined): void {
  if (value) lines.push(`${key}: ${value}`);
}

function pushArrayField(lines: string[], key: string, values: string[]): void {
  if (values.length === 0) {
    lines.push(`${key}: []`);
    return;
  }

  lines.push(`${key}:`);
  for (const value of values) lines.push(`  - ${value}`);
}

function pushSection(lines: string[], heading: string, entries: string[]): void {
  lines.push(heading, "");
  if (entries.length === 0) {
    lines.push("- (none)");
  } else {
    for (const entry of entries) lines.push(`- ${entry}`);
  }
  lines.push("");
}

function pushReviewerChecklist(lines: string[], entries: string[]): void {
  lines.push("## Reviewer Checklist", "");
  for (const entry of entries) lines.push(`- ${entry}`);
  lines.push("");
}

export function renderTaskDraftTarget(
  draft: TaskPlanningDraft
): RenderedTaskDraftTarget {
  const targetStage = draft.commit.target_stage ?? draft.status;
  const committedTaskId = draft.commit.committed_task_id ?? draft.draft_id;
  const targetPath =
    draft.commit.target_path ??
    buildTaskDraftTargetPath(committedTaskId, draft.title, targetStage);

  const lines: string[] = [
    "---",
    `id: ${committedTaskId}`,
    `title: ${draft.title}`,
    `project: ${draft.project}`,
    `repo: ${draft.repo}`,
    `branch: ${draft.branch}`,
    `type: ${draft.type}`,
    `priority: ${draft.priority}`,
    `status: ${targetStage}`,
    `agent: ${draft.agent}`,
  ];

  pushOptionalFrontmatter(lines, "external_source", draft.external_source);
  pushOptionalFrontmatter(lines, "external_key", draft.external_key);
  pushOptionalFrontmatter(lines, "external_url", draft.external_url);
  pushOptionalFrontmatter(lines, "lane", draft.lane);
  pushOptionalFrontmatter(lines, "repo_area", draft.repo_area);
  pushOptionalFrontmatter(lines, "bundle_id", draft.bundle_id);
  pushOptionalFrontmatter(lines, "bundle_title", draft.bundle_title);
  pushOptionalFrontmatter(lines, "bundle_phase", draft.bundle_phase);
  pushArrayField(lines, "depends_on", draft.depends_on);
  pushArrayField(lines, "files_likely_affected", draft.files_likely_affected);
  pushArrayField(lines, "verification", draft.verification);

  lines.push("---", "", "## Goal", "", draft.goal, "");
  pushSection(lines, "## Context", draft.context);
  pushSection(lines, "## Acceptance Criteria", draft.acceptance_criteria);
  pushSection(lines, "## Expected Artifacts", draft.expected_artifacts);
  pushSection(lines, "## Failure Conditions", draft.failure_conditions);
  pushReviewerChecklist(lines, draft.reviewer_checklist);

  return {
    target_stage: targetStage,
    target_path: targetPath,
    markdown: lines.join("\n").trimEnd() + "\n",
  };
}

export function renderTaskDraftMarkdown(draft: TaskPlanningDraft): string {
  return renderTaskDraftTarget(draft).markdown;
}
