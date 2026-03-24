/**
 * packages/vscode/src/commands/run-inspect.ts
 *
 * devory.runInspect — show recent runs in a QuickPick for inspection.
 */

import * as vscode from "vscode";
import { listRuns, formatRunLabel } from "../lib/run-reader.js";

export async function runInspectCommand(runsDir: string): Promise<void> {
  if (!runsDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const runs = listRuns(runsDir).slice(0, 20); // show most recent 20

  if (runs.length === 0) {
    vscode.window.showInformationMessage("Devory: no run records found.");
    return;
  }

  const items: vscode.QuickPickItem[] = runs.map((run) => ({
    label: run.run_id,
    description: `[${run.status}]  ${run.tasks_executed?.length ?? 0} task(s)`,
    detail: `started: ${run.start_time ?? "unknown"}  ended: ${run.end_time ?? "in progress"}`,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "Devory: Recent Factory Runs",
    placeHolder: "Select a run to see details",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked) return;

  const run = runs.find((r) => r.run_id === picked.label);
  if (!run) return;

  const doc = await vscode.workspace.openTextDocument({
    content: buildRunReport(run),
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

function buildRunReport(run: Parameters<typeof formatRunLabel>[0]): string {
  const lines = [
    `# Run: ${run.run_id}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Status | ${run.status} |`,
    `| Start | ${run.start_time ?? "(unknown)"} |`,
    `| End | ${run.end_time ?? "(in progress)"} |`,
    `| Tasks queued | ${run.task_queue?.length ?? 0} |`,
    `| Tasks executed | ${run.tasks_executed?.length ?? 0} |`,
    "",
  ];

  if (run.tasks_executed?.length > 0) {
    lines.push("## Executed Tasks", "");
    for (const t of run.tasks_executed) {
      lines.push(`- **${t.task_id}** — ${t.outcome}  (engine: ${t.engine})`);
    }
    lines.push("");
  }

  if (run.failure) {
    lines.push(
      "## Failure",
      "",
      `- Task: ${run.failure.task_id}`,
      `- Reason: ${run.failure.reason}`,
      `- At: ${run.failure.timestamp}`,
      ""
    );
  }

  return lines.join("\n");
}
