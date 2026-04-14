import fs from "node:fs";
import path from "node:path";
import {
  renderTaskDraftTarget,
  toPlanningDraftValidationRecord,
  type TaskPlanningDraft,
  validateTaskDraft,
  type TaskDraftCommitStage,
} from "@devory/core";

export interface TaskDraftCommitIssue {
  draft_id: string;
  task_id: string;
  target_path: string;
  errors: string[];
}

export interface TaskDraftCommitSuccess {
  draft_id: string;
  task_id: string;
  target_path: string;
  target_stage: TaskDraftCommitStage;
}

export type TaskDraftCommitFailureReason =
  | "validation_failed"
  | "target_conflict"
  | "duplicate_target";

export type TaskDraftCommitResult =
  | {
      ok: true;
      committed: TaskDraftCommitSuccess[];
      drafts: TaskPlanningDraft[];
    }
  | {
      ok: false;
      reason: TaskDraftCommitFailureReason;
      error: string;
      issues: TaskDraftCommitIssue[];
      drafts: TaskPlanningDraft[];
    };

interface PreparedTaskDraftCommit {
  draft: TaskPlanningDraft;
  taskId: string;
  targetPath: string;
  markdown: string;
}

const TASK_STAGE_DIRS = ["backlog", "ready", "doing", "review", "blocked", "archived", "done"] as const;

function buildBacklogCommitDraft(draft: TaskPlanningDraft): TaskPlanningDraft {
  const { inferred_fields: _inferredFields, ...persistableDraft } = draft;
  const taskId = draft.commit.committed_task_id ?? draft.draft_id;
  const target = renderTaskDraftTarget({
    ...persistableDraft,
    status: "backlog",
    commit: {
      ...persistableDraft.commit,
      state: "ready_to_commit",
      target_stage: "backlog",
      target_path: null,
      committed_task_id: taskId,
    },
  });
  const validation = validateTaskDraft(
    {
      ...persistableDraft,
      status: "backlog",
      commit: {
        ...persistableDraft.commit,
        state: "ready_to_commit",
        target_stage: "backlog",
        target_path: target.target_path,
        committed_task_id: taskId,
      },
    },
    "backlog"
  );

  return {
    ...persistableDraft,
    status: "backlog",
    commit: {
      ...persistableDraft.commit,
      state: "ready_to_commit",
      target_stage: "backlog",
      target_path: target.target_path,
      committed_task_id: taskId,
    },
    validation: toPlanningDraftValidationRecord(validation),
  };
}

function findTaskPathById(factoryRoot: string, taskId: string): string | null {
  const tasksDir = path.join(factoryRoot, "tasks");
  for (const stage of TASK_STAGE_DIRS) {
    const stageDir = path.join(tasksDir, stage);
    if (!fs.existsSync(stageDir)) continue;
    for (const filename of fs.readdirSync(stageDir)) {
      if (!filename.endsWith(".md")) continue;
      const filePath = path.join(stageDir, filename);
      const content = fs.readFileSync(filePath, "utf-8");
      if (new RegExp(`^id:\\s*${taskId}\\s*$`, "m").test(content)) {
        return filePath;
      }
    }
  }
  return null;
}

function prepareTaskDraftCommits(drafts: TaskPlanningDraft[]): {
  prepared: PreparedTaskDraftCommit[];
  normalizedDrafts: TaskPlanningDraft[];
  issues: TaskDraftCommitIssue[];
} {
  const normalizedDrafts = drafts.map(buildBacklogCommitDraft);
  const prepared: PreparedTaskDraftCommit[] = normalizedDrafts.map((draft) => {
    const rendered = renderTaskDraftTarget(draft);
    return {
      draft,
      taskId: draft.commit.committed_task_id ?? draft.draft_id,
      targetPath: rendered.target_path,
      markdown: rendered.markdown,
    };
  });

  const issues: TaskDraftCommitIssue[] = [];
  for (const draft of normalizedDrafts) {
    if (draft.validation.errors.length === 0) continue;
    issues.push({
      draft_id: draft.draft_id,
      task_id: draft.commit.committed_task_id ?? draft.draft_id,
      target_path: draft.commit.target_path ?? "",
      errors: [...draft.validation.errors],
    });
  }

  return { prepared, normalizedDrafts, issues };
}

export function commitTaskDrafts(
  drafts: TaskPlanningDraft[],
  options: { factoryRoot: string }
): TaskDraftCommitResult {
  const { factoryRoot } = options;
  const { prepared, normalizedDrafts, issues } = prepareTaskDraftCommits(drafts);

  if (issues.length > 0) {
    return {
      ok: false,
      reason: "validation_failed",
      error: "One or more task drafts still have blocking validation errors.",
      issues,
      drafts: normalizedDrafts,
    };
  }

  const seenTargetPaths = new Map<string, PreparedTaskDraftCommit>();
  const duplicateTargetIssues: TaskDraftCommitIssue[] = [];
  for (const entry of prepared) {
    const existing = seenTargetPaths.get(entry.targetPath);
    if (!existing) {
      seenTargetPaths.set(entry.targetPath, entry);
      continue;
    }
    duplicateTargetIssues.push({
      draft_id: entry.draft.draft_id,
      task_id: entry.taskId,
      target_path: entry.targetPath,
      errors: [`Target path conflicts with draft ${existing.draft.draft_id} in the same commit batch.`],
    });
  }

  if (duplicateTargetIssues.length > 0) {
    return {
      ok: false,
      reason: "duplicate_target",
      error: "Two or more drafts resolve to the same backlog file.",
      issues: duplicateTargetIssues,
      drafts: normalizedDrafts,
    };
  }

  const conflictIssues: TaskDraftCommitIssue[] = [];
  for (const entry of prepared) {
    const absoluteTargetPath = path.join(factoryRoot, entry.targetPath);
    if (fs.existsSync(absoluteTargetPath)) {
      conflictIssues.push({
        draft_id: entry.draft.draft_id,
        task_id: entry.taskId,
        target_path: entry.targetPath,
        errors: ["Target backlog file already exists."],
      });
      continue;
    }

    const existingTaskPath = findTaskPathById(factoryRoot, entry.taskId);
    if (existingTaskPath) {
      conflictIssues.push({
        draft_id: entry.draft.draft_id,
        task_id: entry.taskId,
        target_path: entry.targetPath,
        errors: [
          `Task id already exists at ${path.relative(factoryRoot, existingTaskPath).replace(/\\/g, "/")}.`,
        ],
      });
    }
  }

  if (conflictIssues.length > 0) {
    return {
      ok: false,
      reason: "target_conflict",
      error: "One or more drafts conflict with existing task files.",
      issues: conflictIssues,
      drafts: normalizedDrafts,
    };
  }

  for (const entry of prepared) {
    const absoluteTargetPath = path.join(factoryRoot, entry.targetPath);
    fs.mkdirSync(path.dirname(absoluteTargetPath), { recursive: true });
    fs.writeFileSync(absoluteTargetPath, entry.markdown, "utf-8");
  }

  const committedDrafts = normalizedDrafts.map((draft) => ({
    ...draft,
    commit: {
      ...draft.commit,
      state: "committed" as const,
    },
  }));

  return {
    ok: true,
    committed: prepared.map((entry) => ({
      draft_id: entry.draft.draft_id,
      task_id: entry.taskId,
      target_path: entry.targetPath,
      target_stage: "backlog",
    })),
    drafts: committedDrafts,
  };
}
