/**
 * packages/vscode/src/commands/artifact-inspect.ts
 *
 * devory.artifactInspect — browse recent run artifacts from the artifacts/ directory.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export async function artifactInspectCommand(artifactsDir: string): Promise<void> {
  if (!artifactsDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  if (!fs.existsSync(artifactsDir)) {
    vscode.window.showInformationMessage("Devory: artifacts directory not found.");
    return;
  }

  // Collect all .md artifacts recursively, newest first
  const files = collectMdFiles(artifactsDir)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 50);

  if (files.length === 0) {
    vscode.window.showInformationMessage("Devory: no artifacts found.");
    return;
  }

  const items: vscode.QuickPickItem[] = files.map((filepath) => ({
    label: path.basename(filepath),
    description: path.relative(artifactsDir, path.dirname(filepath)),
    detail: filepath,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "Devory: Artifacts",
    placeHolder: "Select an artifact to open",
    matchOnDescription: true,
  });

  if (!picked || !picked.detail) return;

  const doc = await vscode.workspace.openTextDocument(picked.detail);
  await vscode.window.showTextDocument(doc);
}

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(full);
      }
    }
  } catch {
    /* permission errors — skip */
  }
  return results;
}
