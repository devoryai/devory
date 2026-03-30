/**
 * packages/vscode/src/lib/capabilities.ts
 *
 * Detects which Devory features a workspace can support inside the editor.
 * This keeps command gating and messaging explicit and testable.
 */

import * as fs from "fs";
import * as path from "path";

export type CapabilityLevel =
  | "none"
  | "read-only"
  | "local-mutations"
  | "full-run";

export interface WorkspaceCapabilities {
  factoryRoot: string;
  runtimeRoot: string | null;
  capabilityLevel: CapabilityLevel;
  hasFactoryRoot: boolean;
  hasTasksDir: boolean;
  hasRunsDir: boolean;
  hasArtifactsDir: boolean;
  hasPackagedRunner: boolean;
  hasRuntimeManifest: boolean;
  supportsTaskBrowse: boolean;
  supportsTaskMutations: boolean;
  supportsRunInspect: boolean;
  supportsArtifactInspect: boolean;
  supportsRunExecution: boolean;
}

export function detectWorkspaceCapabilities(
  factoryRoot: string,
  runtimeRoot: string | null = null
): WorkspaceCapabilities {
  const hasFactoryRoot = Boolean(factoryRoot) && fs.existsSync(factoryRoot);
  const tasksDir = path.join(factoryRoot, "tasks");
  const runsDir = path.join(factoryRoot, "runs");
  const artifactsDir = path.join(factoryRoot, "artifacts");
  const resolvedRuntimeRoot = runtimeRoot ? path.resolve(runtimeRoot) : null;
  const packagedRunner = resolvedRuntimeRoot
    ? path.join(resolvedRuntimeRoot, "packages", "runner", "src", "factory-run.js")
    : "";
  const runtimeManifest = resolvedRuntimeRoot
    ? path.join(resolvedRuntimeRoot, "runtime-manifest.json")
    : "";

  const hasTasksDir = hasFactoryRoot && fs.existsSync(tasksDir);
  const hasRunsDir = hasFactoryRoot && fs.existsSync(runsDir);
  const hasArtifactsDir = hasFactoryRoot && fs.existsSync(artifactsDir);
  const hasPackagedRunner = hasFactoryRoot && fs.existsSync(packagedRunner);
  const hasRuntimeManifest = hasFactoryRoot && fs.existsSync(runtimeManifest);

  const supportsTaskBrowse = hasTasksDir;
  const supportsTaskMutations = hasTasksDir;
  const supportsRunInspect = hasRunsDir;
  const supportsArtifactInspect = hasArtifactsDir;
  const supportsRunExecution = hasTasksDir && hasPackagedRunner;

  const hasReadOnlySurface =
    supportsTaskBrowse || supportsRunInspect || supportsArtifactInspect;

  let capabilityLevel: CapabilityLevel = "none";
  if (supportsRunExecution) {
    capabilityLevel = "full-run";
  } else if (supportsTaskMutations) {
    capabilityLevel = "local-mutations";
  } else if (hasReadOnlySurface) {
    capabilityLevel = "read-only";
  }

  return {
    factoryRoot,
    runtimeRoot: resolvedRuntimeRoot,
    capabilityLevel,
    hasFactoryRoot,
    hasTasksDir,
    hasRunsDir,
    hasArtifactsDir,
    hasPackagedRunner,
    hasRuntimeManifest,
    supportsTaskBrowse,
    supportsTaskMutations,
    supportsRunInspect,
    supportsArtifactInspect,
    supportsRunExecution,
  };
}

export type CommandCapability =
  | "taskList"
  | "taskCreate"
  | "taskMove"
  | "runStart"
  | "runInspect"
  | "artifactInspect";

export function getUnsupportedCommandMessage(
  command: CommandCapability,
  capabilities: WorkspaceCapabilities
): string | null {
  if (!capabilities.hasFactoryRoot) {
    return "Devory: factory root not found. Set devory.factoryRoot in settings.";
  }

  switch (command) {
    case "taskList":
      return capabilities.supportsTaskBrowse
        ? null
        : "Devory: this workspace does not expose a tasks/ directory yet, so task browsing is unavailable.";
    case "taskCreate":
    case "taskMove":
      return capabilities.supportsTaskMutations
        ? null
        : "Devory: this workspace is read-only right now. Task creation and movement need a Devory workspace with a tasks/ directory.";
    case "runInspect":
      return capabilities.supportsRunInspect
        ? null
        : "Devory: no runs/ directory was found, so there are no run records to inspect here.";
    case "artifactInspect":
      return capabilities.supportsArtifactInspect
        ? null
        : "Devory: no artifacts/ directory was found, so artifact inspection is unavailable here.";
    case "runStart":
      if (capabilities.supportsRunExecution) return null;
      if (!capabilities.hasTasksDir) {
        return "Devory: this workspace does not look like a runnable Devory factory yet. Expected a tasks/ directory at the factory root.";
      }
      return "Devory: this workspace supports browsing and local task mutations, but not factory runs yet. Install or package the extension with its bundled runtime so the local runner is available.";
  }
}
