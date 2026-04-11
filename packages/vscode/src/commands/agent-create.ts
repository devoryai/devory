import * as path from "path";
import * as vscode from "vscode";
import { createAgentFile, AGENT_NAME_PATTERN } from "../lib/factory-content.js";

export async function agentCreateCommand(
  factoryRoot: string,
  onChanged?: () => void
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const agentName = await vscode.window.showInputBox({
    title: "Devory: Create Agent",
    prompt: "Agent ID — lowercase kebab-case, e.g. backend-builder",
    placeHolder: "backend-builder",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return "Agent name is required";
      if (!AGENT_NAME_PATTERN.test(trimmed)) return "Agent name must match ^[a-z][a-z0-9-]*$";
      return null;
    },
  });
  if (!agentName) return;

  const result = createAgentFile(factoryRoot, agentName);
  if (!result.ok) {
    vscode.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }

  onChanged?.();
  const document = await vscode.workspace.openTextDocument(result.filePath);
  await vscode.window.showTextDocument(document);
  vscode.window.showInformationMessage(
    `Devory: created agents/${path.basename(result.filePath)}.`
  );
}
