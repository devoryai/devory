import * as path from "path";
import * as vscode from "vscode";
import { archiveDoctrineFile } from "../lib/factory-content.js";

export async function doctrineArchiveCommand(
  factoryRoot: string,
  filePath: string,
  onChanged?: () => void
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    `Archive ${path.basename(filePath)} from active doctrine?`,
    { modal: true },
    "Archive"
  );
  if (confirmed !== "Archive") return;

  const result = archiveDoctrineFile(factoryRoot, filePath);
  if (!result.ok) {
    vscode.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }

  onChanged?.();
  vscode.window.showInformationMessage(
    `Devory: archived doctrine/${path.basename(filePath)} to doctrine/archive/.`
  );
}
