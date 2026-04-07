import * as path from "path";
import * as vscode from "vscode";
import { createSkillFile, SKILL_NAME_PATTERN } from "../lib/factory-content.js";

export async function skillCreateCommand(
  factoryRoot: string,
  runtimeRoot?: string,
  onChanged?: () => void
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const skillName = await vscode.window.showInputBox({
    title: "Devory: Create Skill",
    prompt: "Skill name — lowercase kebab-case directory under skills/",
    placeHolder: "database-migration",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return "Skill name is required";
      if (!SKILL_NAME_PATTERN.test(trimmed)) return "Skill name must match ^[a-z][a-z0-9-]*$";
      return null;
    },
  });
  if (!skillName) return;

  const result = createSkillFile(factoryRoot, skillName, runtimeRoot);
  if (!result.ok) {
    vscode.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }

  onChanged?.();
  const document = await vscode.workspace.openTextDocument(result.filePath);
  await vscode.window.showTextDocument(document);
  vscode.window.showInformationMessage(
    `Devory: created skills/${path.basename(path.dirname(result.filePath))}/SKILL.md.`
  );
}
