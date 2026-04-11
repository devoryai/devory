/**
 * packages/vscode/src/commands/run-start.ts
 *
 * devory.runStart — configure and start a factory run via the packaged
 * local runtime adapter.
 */

import * as vscode from "vscode";
import { startFactoryRun } from "../lib/run-adapter.js";

export async function runStartCommand(
  factoryRoot: string,
  runtimeRoot: string,
  runOutput: vscode.OutputChannel
): Promise<void> {
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

  runOutput.clear();
  runOutput.appendLine(`[Devory] Starting factory run${limit !== undefined ? ` (limit: ${limit})` : ""}…`);
  runOutput.show(true);

  try {
    const result = await startFactoryRun(factoryRoot, runtimeRoot, { limit }, undefined, (chunk) =>
      runOutput.append(chunk)
    );

    if (!result.ok) {
      vscode.window.showErrorMessage(result.message);
    } else {
      vscode.window.showInformationMessage(result.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runOutput.appendLine(`[Devory] Run failed unexpectedly: ${message}`);
    vscode.window.showErrorMessage(`Devory: factory run failed before startup: ${message}`);
  }
}
