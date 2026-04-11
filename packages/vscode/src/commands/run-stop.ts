import * as vscode from "vscode";
import type { RunController } from "../lib/run-controller.js";

export async function runStopCommand(
  controller: RunController,
  runOutput: vscode.OutputChannel,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    "Stop the active factory run? Devory will ask it to stop at the next safe checkpoint before it falls back to terminating the process.",
    { modal: true },
    "Stop Run",
  );

  if (confirmed !== "Stop Run") {
    return;
  }

  const stopped = controller.stop({ onOutput: (chunk) => runOutput.append(chunk) });
  if (!stopped.ok) {
    vscode.window.showInformationMessage(`Devory: ${stopped.reason}`);
    return;
  }

  vscode.window.showInformationMessage("Devory: stop requested. The run will stop at the next safe checkpoint.");
}
