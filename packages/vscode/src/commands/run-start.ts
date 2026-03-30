/**
 * packages/vscode/src/commands/run-start.ts
 *
 * devory.runStart — configure and start a factory run via the packaged
 * local runtime adapter.
 */

import * as vscode from "vscode";
import { startFactoryRun } from "../lib/run-adapter.js";

export async function runStartCommand(factoryRoot: string, runtimeRoot: string): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  // Ask for optional limit
  const limitStr = await vscode.window.showInputBox({
    title: "Devory: Start Factory Run",
    prompt: "Max tasks to run (leave blank for no limit)",
    placeHolder: "e.g. 3",
    validateInput: (v) => {
      if (!v.trim()) return null;
      const n = Number(v);
      return isNaN(n) || n < 1 ? "Enter a positive integer or leave blank" : null;
    },
  });
  if (limitStr === undefined) return; // user cancelled

  const limit = limitStr.trim() ? Number(limitStr.trim()) : undefined;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Devory: starting factory run…",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "launching packaged runtime" });
      const result = await startFactoryRun(factoryRoot, runtimeRoot, { limit });
      if (!result.ok) {
        vscode.window.showErrorMessage(result.message);
      } else {
        vscode.window.showInformationMessage(result.message);
      }
    }
  );
}
