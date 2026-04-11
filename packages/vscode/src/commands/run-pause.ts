import * as vscode from "vscode";
import type { RunController } from "../lib/run-controller.js";

export async function runPauseCommand(
  controller: RunController,
  runOutput: vscode.OutputChannel,
): Promise<void> {
  const paused = controller.pause({ onOutput: (chunk) => runOutput.append(chunk) });
  if (!paused.ok) {
    vscode.window.showInformationMessage(`Devory: ${paused.reason}`);
    return;
  }
  vscode.window.showInformationMessage("Devory: pause requested. The run will pause at the next safe checkpoint.");
}
