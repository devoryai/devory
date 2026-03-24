/**
 * packages/vscode/src/commands/run-start.ts
 *
 * devory.runStart — configure and start a factory run via @devory/cli.
 */

import * as vscode from "vscode";
import { buildRunInvocation, spawnInvocation } from "../lib/cli-bridge.js";

export async function runStartCommand(factoryRoot: string): Promise<void> {
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

  const inv = buildRunInvocation({ limit, dryRun: false, validate: false });

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Devory: factory run started…",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "spawning orchestrator" });
      const result = await spawnInvocation(inv, factoryRoot);
      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Devory: factory run failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`
        );
      } else {
        vscode.window.showInformationMessage("Devory: factory run completed.");
      }
    }
  );
}
