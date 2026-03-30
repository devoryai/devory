/**
 * packages/vscode/src/commands/run-resume.ts
 *
 * devory.runResume — resume a failed or paused factory run via the packaged
 * runtime adapter.
 */

import * as vscode from "vscode";
import { formatRunLabel, getResumableRuns } from "../lib/run-reader.js";
import { startFactoryRun } from "../lib/run-adapter.js";

export async function runResumeCommand(
  factoryRoot: string,
  runsDir: string,
  runtimeRoot: string
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const runs = getResumableRuns(runsDir);
  if (runs.length === 0) {
    vscode.window.showInformationMessage("Devory: no resumable runs were found.");
    return;
  }

  const pickedRun = await vscode.window.showQuickPick(
    runs.map((run) => ({
      label: run.run_id,
      description: formatRunLabel(run),
      detail: run.summary ?? run.failure_reason ?? run.status,
    })),
    {
      title: "Devory: Resume Run",
      placeHolder: "Select a run to resume",
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  if (!pickedRun) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Resuming ${pickedRun.label}…`,
      cancellable: false,
    },
    async () => {
      const result = await startFactoryRun(factoryRoot, runtimeRoot, {
        resumeId: pickedRun.label,
      });
      if (!result.ok) {
        vscode.window.showErrorMessage(result.message);
      } else {
        vscode.window.showInformationMessage(result.message);
      }
    }
  );
}
