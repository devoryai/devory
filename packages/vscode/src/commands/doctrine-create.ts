import * as path from "path";
import * as vscode from "vscode";
import { createDoctrineFile } from "../lib/factory-content.js";

export async function doctrineCreateCommand(
  factoryRoot: string,
  onChanged?: () => void
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const filename = await vscode.window.showInputBox({
    title: "Devory: Create Doctrine File",
    prompt: "Markdown filename inside doctrine/",
    placeHolder: "architecture-rules.md",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return "Doctrine file name is required";
      if (trimmed.includes("/") || trimmed.includes("\\")) return "Use a single filename, not a path";
      if (trimmed.includes("..")) return "Doctrine file name cannot contain '..'";
      return null;
    },
  });
  if (!filename) return;

  const result = createDoctrineFile(factoryRoot, filename);
  if (!result.ok) {
    vscode.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }

  onChanged?.();
  const document = await vscode.workspace.openTextDocument(result.filePath);
  await vscode.window.showTextDocument(document);
  vscode.window.showInformationMessage(
    `Devory: created doctrine/${path.basename(result.filePath)}.`
  );
}
