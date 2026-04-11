/**
 * packages/vscode/src/commands/run-start.ts
 *
 * devory.runStart — configure and start a factory run via the packaged
 * local runtime adapter.
 */

import * as vscode from "vscode";
import type { ManagedRunState, RunController } from "../lib/run-controller.js";

export async function runStartCommand(
  factoryRoot: string,
  runtimeRoot: string,
  runOutput: vscode.OutputChannel,
  controller: RunController,
  onStateChange: (state: ManagedRunState) => void,
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

  const started = await controller.start(factoryRoot, runtimeRoot, { limit }, {
    onOutput: (chunk) => runOutput.append(chunk),
    onStateChange,
    onExit: (result) => {
      if (controller.getState() === "paused") {
        vscode.window.showInformationMessage(
          "Devory: factory run paused at a safe checkpoint. Use Play to resume.",
        );
        return;
      }
      const noOutput = result.stdout.length === 0 && result.stderr.length === 0;
      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Devory: factory run failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`,
        );
        return;
      }
      if (noOutput) {
        runOutput.append("[Devory] No output received — no ready tasks detected.\n");
      }
      vscode.window.showInformationMessage(
        "Devory: factory run completed. Use Devory: Inspect Recent Runs to review the result.",
      );
    },
  });

  if (!started.started) {
    vscode.window.showInformationMessage(`Devory: ${started.reason}`);
  }
}
