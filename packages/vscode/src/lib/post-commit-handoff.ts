/**
 * packages/vscode/src/lib/post-commit-handoff.ts
 *
 * Shared helpers for post-commit task handoff in the VS Code extension.
 * Keeps task selection deterministic and handoff actions consistent.
 */

import type { LifecycleStage } from "./task-reader.js";

export interface CommittedTaskCandidate {
  taskId: string;
  stage: LifecycleStage | null;
  commitIndex: number;
}

export interface PostCommitAction {
  id: "run-first-task" | "reveal-task" | "open-show-work";
  label: string;
  detail: string;
}

/**
 * Deterministic selection rule:
 *  1) first committed task in ready
 *  2) else first committed task in backlog
 *  3) else first committed task in commit order
 */
export function selectFirstCommittedTask(
  committed: readonly CommittedTaskCandidate[]
): CommittedTaskCandidate | null {
  if (committed.length === 0) return null;

  const byOrder = [...committed].sort((a, b) => a.commitIndex - b.commitIndex);
  const ready = byOrder.find((entry) => entry.stage === "ready");
  if (ready) return ready;

  const backlog = byOrder.find((entry) => entry.stage === "backlog");
  if (backlog) return backlog;

  return byOrder[0] ?? null;
}

export function buildPostCommitActions(stage: LifecycleStage | null): PostCommitAction[] {
  const runDetail =
    stage === "backlog"
      ? "Promote the selected backlog task, then start a run."
      : stage === "ready"
        ? "Start a run using existing ready-task execution."
        : "Open the selected task first, then move it to ready before running.";

  return [
    {
      id: "run-first-task",
      label: "Run first task",
      detail: runDetail,
    },
    {
      id: "reveal-task",
      label: "Reveal in Task Explorer",
      detail: "Focus the selected task in the tree and update task context.",
    },
    {
      id: "open-show-work",
      label: "Open Show Work",
      detail: "Open the execution status panel (available without starting a run).",
    },
  ];
}
