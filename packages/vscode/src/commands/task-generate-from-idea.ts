/**
 * packages/vscode/src/commands/task-generate-from-idea.ts
 *
 * devory.generateTasksFromIdea — convert a short idea description into
 * structured draft tasks, preview them, and commit to backlog on confirmation.
 *
 * Uses deterministic generation (no AI required). Pure generation functions
 * come from workers/lib/task-generator.ts; commit goes through
 * workers/lib/task-draft-commit.ts with an explicit factoryRoot.
 */

import * as vscode from "vscode";
import { buildRichTaskDraftFixture, applyTaskDraftValidation } from "@devory/core";
import type { TaskPlanningDraft } from "@devory/core";
import {
  normalizeIntent,
  buildGeneratedTaskSpec,
  deriveTaskId,
} from "../../../../workers/lib/task-generator.js";
import {
  deriveSmartFallback,
  inferChildType,
  buildChildAcceptanceCriteria,
  inheritVerification,
} from "../../../../workers/lib/planner-utils.js";
import { commitTaskDrafts } from "../../../../workers/lib/task-draft-commit.js";

export interface GenerateTasksFromIdeaCommitEntry {
  draft_id: string;
  task_id: string;
  target_path: string;
  target_stage: string;
}

// ---------------------------------------------------------------------------
// Tier detection (mirrors logic in task-draft-generator.ts)
// ---------------------------------------------------------------------------

function tierOf(name: string): 0 | 1 | 2 {
  if (/\b(setup|init|scaffold|configure|prepare|provision|bootstrap)\b/i.test(name)) return 0;
  if (/\b(verify|test|check|validate|qa|audit|assert|spec|document|docs)\b/i.test(name)) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Draft builders — pure, no filesystem access
// ---------------------------------------------------------------------------

function buildSingleDraft(description: string, project: string): TaskPlanningDraft {
  const input = { description, project };
  const intentSpec = normalizeIntent(input);
  const spec = buildGeneratedTaskSpec(intentSpec, input);

  return applyTaskDraftValidation(
    buildRichTaskDraftFixture({
      draft_id: spec.id,
      title: spec.title,
      project: spec.project,
      repo: spec.repo,
      branch: spec.branch,
      type: spec.type,
      priority: spec.priority,
      status: "backlog",
      agent: spec.agent,
      verification: spec.verification,
      goal: spec.title,
      context: [description],
      acceptance_criteria: spec.acceptanceCriteria.map((e) =>
        e.replace(/^- \[ \]\s*/, "")
      ),
      expected_artifacts: ["Implementation changes", "Verification evidence"],
      failure_conditions: [
        "Requirements are not met",
        "Verification does not pass",
        "Unintended side effects are introduced",
      ],
      reviewer_checklist: [
        "Scope remains aligned with request",
        "No unrelated files changed",
        "Verification commands pass",
      ],
      depends_on: [],
      commit: {
        state: "draft",
        target_stage: "backlog",
        target_path: null,
        committed_task_id: null,
      },
    })
  );
}

function buildMultipleDrafts(description: string, project: string): TaskPlanningDraft[] {
  const input = { description, project };
  const intentSpec = normalizeIntent(input);
  const baseId = deriveTaskId(project, intentSpec.suggestedTitle);
  const { names } = deriveSmartFallback({ type: intentSpec.type });

  let previousId: string | null = null;

  return names.map((name, i) => {
    const id = `${baseId}-${String(i + 1).padStart(2, "0")}`;
    const tier = tierOf(name);
    const title = `${intentSpec.suggestedTitle}: ${name}`;
    const type = inferChildType(name, tier);
    const verification = inheritVerification(["npm run test", "npm run build"], tier);
    const criteria = buildChildAcceptanceCriteria(name, tier);

    const draft = applyTaskDraftValidation(
      buildRichTaskDraftFixture({
        draft_id: id,
        title,
        project,
        repo: ".",
        branch: `task/${id}`,
        type,
        priority: intentSpec.suggestedPriority,
        status: "backlog",
        agent: intentSpec.suggestedAgent,
        verification,
        goal: title,
        context: [description],
        acceptance_criteria: criteria.map((e) => e.replace(/^- \[ \]\s*/, "")),
        expected_artifacts: ["Implementation changes aligned to this step"],
        failure_conditions: [
          "Task drifts outside its scoped concern",
          "Required verification cannot be completed",
        ],
        reviewer_checklist: [
          "Scope is contained and vertically useful",
          "Dependencies are satisfied before this task runs",
        ],
        depends_on: previousId ? [previousId] : [],
        commit: {
          state: "draft",
          target_stage: "backlog",
          target_path: null,
          committed_task_id: null,
        },
      })
    );

    previousId = draft.draft_id;
    return draft;
  });
}

export function buildDrafts(
  description: string,
  project: string,
  forceSplit?: boolean
): TaskPlanningDraft[] {
  const intentSpec = normalizeIntent({ description, project });

  if (forceSplit || intentSpec.scope === "broad") {
    return buildMultipleDrafts(description, project);
  }

  return [buildSingleDraft(description, project)];
}

// ---------------------------------------------------------------------------
// QuickPick items type
// ---------------------------------------------------------------------------

interface PreviewItem extends vscode.QuickPickItem {
  isAccept: boolean;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function generateTasksFromIdeaCommand(
  factoryRoot: string,
  onSuccess: () => void,
  onCommitted?: (committed: GenerateTasksFromIdeaCommitEntry[]) => Promise<void> | void
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  // Step 1: Get description
  const description = await vscode.window.showInputBox({
    title: "Devory: Generate Tasks from Idea",
    prompt: "Describe the work to be done in 1–3 sentences",
    placeHolder: "Add JWT authentication to the API endpoints",
    validateInput: (v) =>
      v.trim().length < 5
        ? "Please describe the work in more detail"
        : null,
  });
  if (!description) return;

  // Step 2: Detect project name — use last segment of factoryRoot as default
  const { default: nodePath } = await import("node:path");
  const projectDefault = nodePath.basename(factoryRoot.trim()) || "project";

  const project = await vscode.window.showInputBox({
    title: "Devory: Generate Tasks from Idea — Project",
    prompt: "Project name (used in task IDs and metadata)",
    value: projectDefault,
    placeHolder: projectDefault,
    validateInput: (v) => (v.trim() ? null : "Project name is required"),
  });
  if (!project) return;

  // Step 3: Generate drafts (deterministic, pure)
  let drafts: TaskPlanningDraft[];
  try {
    drafts = buildDrafts(description.trim(), project.trim());
  } catch (err) {
    vscode.window.showErrorMessage(
      `Devory: task generation failed — ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (drafts.length === 0) {
    vscode.window.showInformationMessage(
      "Devory: no tasks could be generated from that description. Try rephrasing."
    );
    return;
  }

  // Step 4: Show preview QuickPick
  const acceptLabel = `$(check) Accept all — save ${drafts.length} task${drafts.length > 1 ? "s" : ""} to backlog`;
  const previewItems: PreviewItem[] = [
    {
      label: acceptLabel,
      description: "Writes task files to tasks/backlog/",
      isAccept: true,
    },
    {
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
      isAccept: false,
    },
    ...drafts.map((d, i): PreviewItem => ({
      label: `${i + 1}. ${d.title}`,
      description: `${d.type} · ${d.priority}`,
      detail: d.depends_on && d.depends_on.length > 0
        ? `depends on: ${d.depends_on.join(", ")}`
        : undefined,
      isAccept: false,
    })),
  ];

  const picked = await vscode.window.showQuickPick(previewItems, {
    title: "Devory: Generate Tasks from Idea — Preview",
    placeHolder: "Select 'Accept all' to save tasks, or press Escape to cancel.",
    ignoreFocusOut: true,
  });

  if (!picked || !picked.isAccept) return;

  // Step 5: Commit to backlog
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Saving ${drafts.length} task${drafts.length > 1 ? "s" : ""} to backlog…`,
    },
    async () => {
      const result = commitTaskDrafts(drafts, { factoryRoot });

      if (!result.ok) {
        const detail = result.issues.length > 0
          ? ` (${result.issues.map((i) => i.errors[0]).join("; ")})`
          : "";
        vscode.window.showErrorMessage(`Devory: failed to save tasks — ${result.error}${detail}`);
        return;
      }

      onSuccess();

      const ids = result.committed.map((c) => c.task_id);
      if (onCommitted) {
        await onCommitted(result.committed);
      } else {
        vscode.window.showInformationMessage(
          `Devory: ${result.committed.length} task${result.committed.length > 1 ? "s" : ""} added to backlog: ${ids.join(", ")}`
        );
      }
    }
  );
}
