/**
 * packages/vscode/src/config.ts
 *
 * Resolves the factory root path from VS Code workspace settings,
 * falling back to the first workspace folder root when not explicitly set.
 */

import * as vscode from "vscode";
import * as path from "path";

const CONFIG_KEY = "devory.factoryRoot";

/**
 * Returns the absolute factory root path.
 * Resolution order:
 *  1. devory.factoryRoot workspace setting (if non-empty)
 *  2. First VS Code workspace folder root
 *  3. Empty string (caller should handle gracefully)
 */
export function getFactoryRoot(): string {
  const cfg = vscode.workspace
    .getConfiguration()
    .get<string>(CONFIG_KEY, "")
    .trim();

  if (cfg) return cfg;

  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }

  return "";
}

/** Derived paths from the factory root. */
export function getFactoryPaths(factoryRoot: string) {
  return {
    tasksDir: path.join(factoryRoot, "tasks"),
    runsDir: path.join(factoryRoot, "runs"),
    artifactsDir: path.join(factoryRoot, "artifacts"),
  };
}
