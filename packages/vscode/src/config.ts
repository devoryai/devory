/**
 * packages/vscode/src/config.ts
 *
 * Resolves the factory root path from VS Code workspace settings,
 * falling back to the first workspace folder root when not explicitly set.
 */

import * as path from "path";

const CONFIG_KEY = "devory.factoryRoot";

function loadVscodeWorkspace(): {
  getConfiguration(): { get<T>(section: string, defaultValue: T): T };
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
} | null {
  try {
    // `vscode` exists in the extension host, but plain Node test runs do not provide it.
    // Lazily loading keeps pure helper imports testable outside VS Code.
    return require("vscode").workspace;
  } catch {
    return null;
  }
}

/**
 * Returns the absolute factory root path.
 * Resolution order:
 *  1. devory.factoryRoot workspace setting (if non-empty)
 *  2. First VS Code workspace folder root
 *  3. Empty string (caller should handle gracefully)
 */
export function getFactoryRoot(): string {
  const workspace = loadVscodeWorkspace();
  if (!workspace) return "";

  const cfg = workspace
    .getConfiguration()
    .get<string>(CONFIG_KEY, "")
    .trim();

  if (cfg) return cfg;

  const folders = workspace.workspaceFolders;
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

export function getExtensionRuntimeRoot(extensionPath: string): string {
  return path.join(extensionPath, "runtime");
}
