import * as path from "path";
import * as vscode from "vscode";
import { archiveSkillDirectory } from "../lib/factory-content.js";

export async function skillArchiveCommand(
  factoryRoot: string,
  skillMdPath: string,
  onChanged?: () => void
): Promise<void> {
  const skillName = path.basename(path.dirname(skillMdPath));
  const confirmed = await vscode.window.showWarningMessage(
    `Archive skill ${skillName} from active skills?`,
    { modal: true },
    "Archive"
  );
  if (confirmed !== "Archive") return;

  const result = archiveSkillDirectory(factoryRoot, skillMdPath);
  if (!result.ok) {
    vscode.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }

  onChanged?.();
  vscode.window.showInformationMessage(
    `Devory: archived skills/${skillName}/ to skills/archive/.`
  );
}
