export const PLANNING_DRAFT_CONTRACT_VERSION = "planning-draft-v1" as const;

export const PLANNING_DRAFT_KINDS = ["epic", "task"] as const;
export type PlanningDraftKind = (typeof PLANNING_DRAFT_KINDS)[number];

export const PLANNING_DRAFT_PERSISTENCE_MODES = [
  "ephemeral",
  "artifact",
] as const;
export type PlanningDraftPersistenceMode =
  (typeof PLANNING_DRAFT_PERSISTENCE_MODES)[number];

export const PLANNING_DRAFT_COMMIT_STATES = [
  "draft",
  "ready_to_commit",
  "committed",
] as const;
export type PlanningDraftCommitState =
  (typeof PLANNING_DRAFT_COMMIT_STATES)[number];

export const PLANNING_DRAFT_VALIDATION_STATUSES = [
  "unchecked",
  "valid",
  "invalid",
] as const;
export type PlanningDraftValidationStatus =
  (typeof PLANNING_DRAFT_VALIDATION_STATUSES)[number];

export const TASK_DRAFT_COMMIT_STAGES = [
  "backlog",
  "ready",
  "doing",
  "review",
  "blocked",
  "done",
] as const;
export type TaskDraftCommitStage = (typeof TASK_DRAFT_COMMIT_STAGES)[number];

export interface PlanningDraftStorageRecord {
  authority: "planning-draft";
  persistence_mode: PlanningDraftPersistenceMode;
  artifact_path: string | null;
}

export interface PlanningDraftCommitRecord {
  state: PlanningDraftCommitState;
  target_stage: TaskDraftCommitStage | null;
  target_path: string | null;
  committed_task_id: string | null;
}

export interface PlanningDraftValidationRecord {
  status: PlanningDraftValidationStatus;
  errors: string[];
  warnings: string[];
}

export interface PlanningDraftBase {
  version: typeof PLANNING_DRAFT_CONTRACT_VERSION;
  draft_id: string;
  kind: PlanningDraftKind;
  created_at: string;
  updated_at: string;
  title: string;
  notes: string[];
  storage: PlanningDraftStorageRecord;
  commit: PlanningDraftCommitRecord;
  validation: PlanningDraftValidationRecord;
}

export interface EpicPlanningDraft extends PlanningDraftBase {
  kind: "epic";
  objective: string;
  scope: string[];
  out_of_scope: string[];
  constraints: string[];
  risks: string[];
  success_criteria: string[];
}

export interface TaskPlanningDraft extends PlanningDraftBase {
  kind: "task";
  project: string;
  repo: string;
  branch: string;
  type: string;
  priority: string;
  status: TaskDraftCommitStage;
  agent: string;
  depends_on: string[];
  files_likely_affected: string[];
  verification: string[];
  lane?: string;
  repo_area?: string;
  bundle_id?: string;
  bundle_title?: string;
  bundle_phase?: string;
  goal: string;
  context: string[];
  acceptance_criteria: string[];
  expected_artifacts: string[];
  failure_conditions: string[];
  reviewer_checklist: string[];
}

export type PlanningDraft = EpicPlanningDraft | TaskPlanningDraft;

export interface RenderedTaskDraftTarget {
  target_stage: TaskDraftCommitStage;
  target_path: string;
  markdown: string;
}

import {
  buildTaskDraftTargetPath,
  renderTaskDraftTarget as renderTaskDraftTargetShared,
} from "./task-markdown-renderer.ts";

export interface CreateEpicPlanningDraftInput {
  draft_id: string;
  title: string;
  objective: string;
  scope?: string[];
  out_of_scope?: string[];
  constraints?: string[];
  risks?: string[];
  success_criteria?: string[];
  notes?: string[];
  created_at?: string;
  updated_at?: string;
  persistence_mode?: PlanningDraftPersistenceMode;
  artifact_path?: string | null;
}

export interface UpdateEpicPlanningDraftInput {
  title?: string;
  objective?: string;
  scope?: string[];
  out_of_scope?: string[];
  constraints?: string[];
  risks?: string[];
  success_criteria?: string[];
  notes?: string[];
  updated_at?: string;
  validation?: Partial<PlanningDraftValidationRecord>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function normalizePersistenceMode(value: unknown): PlanningDraftPersistenceMode {
  return value === "ephemeral" ? "ephemeral" : "artifact";
}

function normalizeCommitState(value: unknown): PlanningDraftCommitState {
  return value === "ready_to_commit" || value === "committed" ? value : "draft";
}

function normalizeCommitStage(value: unknown): TaskDraftCommitStage | null {
  return typeof value === "string" &&
    (TASK_DRAFT_COMMIT_STAGES as readonly string[]).includes(value)
    ? (value as TaskDraftCommitStage)
    : null;
}

function normalizeValidationStatus(value: unknown): PlanningDraftValidationStatus {
  return value === "valid" || value === "invalid" ? value : "unchecked";
}

function normalizeStorage(value: unknown): PlanningDraftStorageRecord {
  const record = isRecord(value) ? value : {};
  return {
    authority: "planning-draft",
    persistence_mode: normalizePersistenceMode(record.persistence_mode),
    artifact_path: asString(record.artifact_path),
  };
}

function normalizeCommit(value: unknown): PlanningDraftCommitRecord {
  const record = isRecord(value) ? value : {};
  return {
    state: normalizeCommitState(record.state),
    target_stage: normalizeCommitStage(record.target_stage),
    target_path: asString(record.target_path),
    committed_task_id: asString(record.committed_task_id),
  };
}

function normalizeValidation(value: unknown): PlanningDraftValidationRecord {
  const record = isRecord(value) ? value : {};
  return {
    status: normalizeValidationStatus(record.status),
    errors: asStringArray(record.errors),
    warnings: asStringArray(record.warnings),
  };
}

function normalizeBase(
  value: unknown
): (Omit<PlanningDraftBase, "kind"> & { kind: PlanningDraftKind }) | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const draftId = asString(record.draft_id);
  const createdAt = asString(record.created_at);
  const updatedAt = asString(record.updated_at);
  const title = asString(record.title);
  const kind =
    record.kind === "epic" || record.kind === "task"
      ? (record.kind as PlanningDraftKind)
      : null;

  if (!draftId || !createdAt || !updatedAt || !title || !kind) return null;

  return {
    version: PLANNING_DRAFT_CONTRACT_VERSION,
    draft_id: draftId,
    kind,
    created_at: createdAt,
    updated_at: updatedAt,
    title,
    notes: asStringArray(record.notes),
    storage: normalizeStorage(record.storage),
    commit: normalizeCommit(record.commit),
    validation: normalizeValidation(record.validation),
  };
}

export function buildPlanningDraftStorageRelativePath(
  kind: PlanningDraftKind,
  draftId: string
): string {
  return `planning-drafts/${kind}/${draftId}.json`;
}

export function buildPlanningDraftArtifactPath(
  kind: PlanningDraftKind,
  draftId: string
): string {
  return `artifacts/${buildPlanningDraftStorageRelativePath(kind, draftId)}`;
}

export function buildEpicPlanningDraftFixture(
  overrides: Partial<EpicPlanningDraft> = {}
): EpicPlanningDraft {
  const draftId = overrides.draft_id ?? "epic-draft-auth-reliability";
  const artifactPath =
    overrides.storage?.artifact_path ??
    buildPlanningDraftArtifactPath("epic", draftId);
  return {
    version: PLANNING_DRAFT_CONTRACT_VERSION,
    draft_id: draftId,
    kind: "epic",
    created_at: overrides.created_at ?? "2026-03-29T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-03-29T00:00:00.000Z",
    title: overrides.title ?? "Improve auth and review workflow reliability",
    objective:
      overrides.objective ??
      "Reduce operator friction by making planning, review, and recovery flows more predictable.",
    scope: overrides.scope ?? [
      "Define the planning draft contract",
      "Persist epic intent before task generation",
    ],
    out_of_scope: overrides.out_of_scope ?? [
      "Replacing the existing markdown task storage contract",
    ],
    constraints: overrides.constraints ?? [
      "Committed tasks must remain valid against the current validator",
      "Draft records must remain separate from lifecycle folders",
    ],
    risks: overrides.risks ?? [
      "UI and generator layers could drift without one shared schema",
    ],
    success_criteria: overrides.success_criteria ?? [
      "Epic intent can be saved and reopened without markdown editing",
      "Generated task drafts can map back to the current markdown protocol",
    ],
    notes: overrides.notes ?? ["Used as a stable contract fixture for planning flows."],
    storage: overrides.storage ?? {
      authority: "planning-draft",
      persistence_mode: "artifact",
      artifact_path: artifactPath,
    },
    commit: overrides.commit ?? {
      state: "draft",
      target_stage: null,
      target_path: null,
      committed_task_id: null,
    },
    validation: overrides.validation ?? {
      status: "unchecked",
      errors: [],
      warnings: [],
    },
  };
}

export function buildEpicPlanningDraft(
  input: CreateEpicPlanningDraftInput
): EpicPlanningDraft {
  const createdAt = input.created_at ?? new Date().toISOString();
  const updatedAt = input.updated_at ?? createdAt;
  const artifactPath =
    input.artifact_path === null
      ? null
      : input.artifact_path ??
        buildPlanningDraftArtifactPath("epic", input.draft_id);

  return {
    version: PLANNING_DRAFT_CONTRACT_VERSION,
    draft_id: input.draft_id,
    kind: "epic",
    created_at: createdAt,
    updated_at: updatedAt,
    title: input.title.trim(),
    objective: input.objective.trim(),
    scope: input.scope ?? [],
    out_of_scope: input.out_of_scope ?? [],
    constraints: input.constraints ?? [],
    risks: input.risks ?? [],
    success_criteria: input.success_criteria ?? [],
    notes: input.notes ?? [],
    storage: {
      authority: "planning-draft",
      persistence_mode: input.persistence_mode ?? "artifact",
      artifact_path: artifactPath,
    },
    commit: {
      state: "draft",
      target_stage: null,
      target_path: null,
      committed_task_id: null,
    },
    validation: {
      status: "unchecked",
      errors: [],
      warnings: [],
    },
  };
}

export function buildTaskPlanningDraftFixture(
  overrides: Partial<TaskPlanningDraft> = {}
): TaskPlanningDraft {
  const taskId = overrides.commit?.committed_task_id ?? overrides.draft_id ?? "factory-181";
  const title =
    overrides.title ?? "Define the structured planning draft model for epics and tasks";
  const status = overrides.status ?? "backlog";
  const artifactPath =
    overrides.storage?.artifact_path ??
    buildPlanningDraftArtifactPath("task", taskId);
  const targetPath =
    overrides.commit?.target_path ?? buildTaskDraftTargetPath(taskId, title, status);

  return {
    version: PLANNING_DRAFT_CONTRACT_VERSION,
    draft_id: overrides.draft_id ?? taskId,
    kind: "task",
    created_at: overrides.created_at ?? "2026-03-29T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-03-29T00:00:00.000Z",
    title,
    project: overrides.project ?? "ai-dev-factory",
    repo: overrides.repo ?? ".",
    branch: overrides.branch ?? `task/${taskId}-planning-draft-contract`,
    type: overrides.type ?? "feature",
    priority: overrides.priority ?? "high",
    status,
    agent: overrides.agent ?? "backend-builder",
    depends_on: overrides.depends_on ?? [],
    files_likely_affected:
      overrides.files_likely_affected ?? [
        "/home/bridger/dev/devory/docs/adr/",
        "/home/bridger/dev/devory/packages/core/src/",
      ],
    verification: overrides.verification ?? [
      "npm run validate:task -- tasks/backlog/factory-181.md",
      "npm run test",
    ],
    lane: overrides.lane,
    repo_area: overrides.repo_area,
    bundle_id: overrides.bundle_id,
    bundle_title: overrides.bundle_title,
    bundle_phase: overrides.bundle_phase,
    goal:
      overrides.goal ??
      "Define a shared draft contract for epic and task authoring before markdown commit time.",
    context: overrides.context ?? [
      "Markdown task storage already exists and remains authoritative after commit.",
      "Planning flows need a durable structure above raw markdown.",
    ],
    acceptance_criteria: overrides.acceptance_criteria ?? [
      "A shared planning draft contract exists for epics and tasks.",
      "Task drafts render to markdown compatible with the current validator.",
    ],
    expected_artifacts: overrides.expected_artifacts ?? [
      "Planning draft ADR",
      "Shared planning draft types",
      "Planning draft contract tests",
    ],
    failure_conditions: overrides.failure_conditions ?? [
      "Draft storage semantics are left ambiguous",
      "Rendered task markdown diverges from the current protocol",
    ],
    reviewer_checklist: overrides.reviewer_checklist ?? [
      "[ ] Contract covers epic and task drafts",
      "[ ] Draft storage remains distinct from lifecycle folders",
      "[ ] Rendered task target stays validator-compatible",
    ],
    notes: overrides.notes ?? ["Canonical fixture for planning draft tests."],
    storage: overrides.storage ?? {
      authority: "planning-draft",
      persistence_mode: "artifact",
      artifact_path: artifactPath,
    },
    commit: overrides.commit ?? {
      state: "ready_to_commit",
      target_stage: status,
      target_path: targetPath,
      committed_task_id: taskId,
    },
    validation: overrides.validation ?? {
      status: "valid",
      errors: [],
      warnings: [],
    },
  };
}

export function updateEpicPlanningDraft(
  draft: EpicPlanningDraft,
  patch: UpdateEpicPlanningDraftInput
): EpicPlanningDraft {
  return {
    ...draft,
    title: patch.title?.trim() || draft.title,
    objective: patch.objective?.trim() || draft.objective,
    scope: patch.scope ?? draft.scope,
    out_of_scope: patch.out_of_scope ?? draft.out_of_scope,
    constraints: patch.constraints ?? draft.constraints,
    risks: patch.risks ?? draft.risks,
    success_criteria: patch.success_criteria ?? draft.success_criteria,
    notes: patch.notes ?? draft.notes,
    updated_at: patch.updated_at ?? new Date().toISOString(),
    validation: patch.validation
      ? {
          status: patch.validation.status ?? draft.validation.status,
          errors: patch.validation.errors ?? draft.validation.errors,
          warnings: patch.validation.warnings ?? draft.validation.warnings,
        }
      : draft.validation,
  };
}

export function normalizePlanningDraft(value: unknown): PlanningDraft | null {
  const base = normalizeBase(value);
  const record = isRecord(value) ? value : null;
  if (!base || !record) return null;

  if (base.kind === "epic") {
    const objective = asString(record.objective);
    if (!objective) return null;

    return {
      ...base,
      kind: "epic",
      objective,
      scope: asStringArray(record.scope),
      out_of_scope: asStringArray(record.out_of_scope),
      constraints: asStringArray(record.constraints),
      risks: asStringArray(record.risks),
      success_criteria: asStringArray(record.success_criteria),
    };
  }

  const project = asString(record.project);
  const repo = asString(record.repo);
  const branch = asString(record.branch);
  const type = asString(record.type);
  const priority = asString(record.priority);
  const agent = asString(record.agent);
  const goal = asString(record.goal);
  if (!project || !repo || !branch || !type || !priority || !agent || !goal) {
    return null;
  }

  return {
    ...base,
    kind: "task",
    project,
    repo,
    branch,
    type,
    priority,
    status: normalizeCommitStage(record.status) ?? "backlog",
    agent,
    depends_on: asStringArray(record.depends_on),
    files_likely_affected: asStringArray(record.files_likely_affected),
    verification: asStringArray(record.verification),
    lane: asOptionalString(record.lane),
    repo_area: asOptionalString(record.repo_area),
    bundle_id: asOptionalString(record.bundle_id),
    bundle_title: asOptionalString(record.bundle_title),
    bundle_phase: asOptionalString(record.bundle_phase),
    goal,
    context: asStringArray(record.context),
    acceptance_criteria: asStringArray(record.acceptance_criteria),
    expected_artifacts: asStringArray(record.expected_artifacts),
    failure_conditions: asStringArray(record.failure_conditions),
    reviewer_checklist: asStringArray(record.reviewer_checklist),
  };
}

export function renderTaskPlanningDraftTarget(
  draft: TaskPlanningDraft
): RenderedTaskDraftTarget {
  return renderTaskDraftTargetShared(draft);
}

export function serializePlanningDraft(draft: PlanningDraft): string {
  const normalized = normalizePlanningDraft(draft);
  if (!normalized) {
    throw new Error(`Cannot serialize invalid planning draft: ${draft.draft_id}`);
  }
  return JSON.stringify(normalized, null, 2) + "\n";
}
