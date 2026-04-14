import * as fs from "fs";
import * as path from "path";

export const FIRST_RUN_STATE_KEY = "devory.firstRunCompleted";

export type StoredDataClassification =
  | "SAFE_TO_DELETE"
  | "PROJECT_DATA"
  | "UNKNOWN";

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export interface UriLike {
  fsPath: string;
}

export interface StoredDataContext {
  globalState: MementoLike;
  globalStorageUri: UriLike;
  storageUri?: UriLike;
  logUri?: UriLike;
}

export interface StoredDataLocation {
  id: string;
  label: string;
  location: string;
  usage: string;
  classification: StoredDataClassification;
  exists: boolean;
  sizeBytes: number | null;
  canSweep: boolean;
  cleanupNote: string;
}

export interface SweepResult {
  cleared: StoredDataLocation[];
  skipped: StoredDataLocation[];
}

function safeStat(targetPath: string): fs.Stats | null {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function pathExists(targetPath: string): boolean {
  return safeStat(targetPath) !== null;
}

function isDirectory(targetPath: string): boolean {
  return safeStat(targetPath)?.isDirectory() ?? false;
}

function isFile(targetPath: string): boolean {
  return safeStat(targetPath)?.isFile() ?? false;
}

function getDirectorySize(targetPath: string): number {
  const stat = safeStat(targetPath);
  if (!stat) return 0;
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  let total = 0;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySize(childPath);
    } else if (entry.isFile()) {
      total += safeStat(childPath)?.size ?? 0;
    }
  }
  return total;
}

function makeDirectoryEntry(
  id: string,
  label: string,
  targetPath: string,
  usage: string,
  classification: StoredDataClassification,
  canSweep: boolean,
  cleanupNote: string,
): StoredDataLocation {
  const exists = pathExists(targetPath);
  return {
    id,
    label,
    location: targetPath,
    usage,
    classification,
    exists,
    sizeBytes: exists ? getDirectorySize(targetPath) : 0,
    canSweep,
    cleanupNote,
  };
}

function makeMementoEntry(
  id: string,
  label: string,
  usage: string,
  hasValue: boolean,
  canSweep: boolean,
  cleanupNote: string,
): StoredDataLocation {
  return {
    id,
    label,
    location: "Managed by VS Code (no stable file path exposed)",
    usage,
    classification: "SAFE_TO_DELETE",
    exists: hasValue,
    sizeBytes: null,
    canSweep,
    cleanupNote,
  };
}

function buildProjectEntries(factoryRoot: string): StoredDataLocation[] {
  if (!factoryRoot) return [];

  const directoryEntries = [
    ["tasks", "Task files and lifecycle queues"],
    ["runs", "Run records and execution outputs stored in the workspace"],
    ["artifacts", "Generated artifacts stored in the workspace"],
    ["doctrine", "Doctrine files authored for the project"],
    ["skills", "Skill definitions authored for the project"],
    ["templates", "Project templates and scaffolding"],
    [".devory", "Project-local Devory config and governance state"],
    [".devory-governance", "Governance repo data stored with the project"],
  ] as const;

  const fileEntries = [
    ["FACTORY_CONTEXT.md", "Project factory context file"],
    ["devory.standards.yml", "Project standards definition"],
  ] as const;

  const entries: StoredDataLocation[] = [];

  for (const [subpath, usage] of directoryEntries) {
    const targetPath = path.join(factoryRoot, subpath);
    if (!isDirectory(targetPath)) continue;
    entries.push(
      makeDirectoryEntry(
        `project:${subpath}`,
        subpath,
        targetPath,
        usage,
        "PROJECT_DATA",
        false,
        "Project data. This tool will never delete it.",
      ),
    );
  }

  for (const [filename, usage] of fileEntries) {
    const targetPath = path.join(factoryRoot, filename);
    if (!isFile(targetPath)) continue;
    entries.push({
      id: `project:${filename}`,
      label: filename,
      location: targetPath,
      usage,
      classification: "PROJECT_DATA",
      exists: true,
      sizeBytes: safeStat(targetPath)?.size ?? 0,
      canSweep: false,
      cleanupNote: "Project data. This tool will never delete it.",
    });
  }

  return entries;
}

export async function collectStoredDataLocations(
  context: StoredDataContext,
  factoryRoot: string,
): Promise<StoredDataLocation[]> {
  const firstRunCompleted = context.globalState.get<boolean>(FIRST_RUN_STATE_KEY) === true;

  const entries: StoredDataLocation[] = [
    makeMementoEntry(
      "global-state:first-run",
      "VS Code global state",
      "Stores the first-run completion flag for Devory onboarding.",
      firstRunCompleted,
      firstRunCompleted,
      firstRunCompleted
        ? "Clears the stored first-run flag."
        : "No Devory first-run flag is currently stored.",
    ),
    makeDirectoryEntry(
      "local:global-storage",
      "Extension global storage",
      context.globalStorageUri.fsPath,
      "Machine-local extension storage owned by VS Code for Devory.",
      "SAFE_TO_DELETE",
      true,
      "Deletes extension-owned files in global storage.",
    ),
  ];

  if (context.storageUri) {
    entries.push(
      makeDirectoryEntry(
        "local:workspace-storage",
        "Workspace extension storage",
        context.storageUri.fsPath,
        "Workspace-scoped extension storage owned by VS Code for Devory.",
        "SAFE_TO_DELETE",
        true,
        "Deletes workspace-scoped extension-owned files.",
      ),
    );
  }

  if (context.logUri) {
    entries.push(
      makeDirectoryEntry(
        "local:logs",
        "Extension log directory",
        context.logUri.fsPath,
        "Extension log files and diagnostic output owned by VS Code for Devory.",
        "SAFE_TO_DELETE",
        true,
        "Deletes extension log files.",
      ),
    );
  }

  entries.push({
    id: "unknown:factory-root-setting",
    label: "Configured factory root setting",
    location: "VS Code settings (user or workspace settings.json)",
    usage: "Tells Devory which folder to treat as the workspace root.",
    classification: "UNKNOWN",
    exists: true,
    sizeBytes: null,
    canSweep: false,
    cleanupNote: "User-owned configuration. Not cleared by this tool.",
  });

  return [...entries, ...buildProjectEntries(factoryRoot)];
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "size not measured";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function getSweepableLocations(
  locations: StoredDataLocation[],
): StoredDataLocation[] {
  return locations.filter((location) => location.classification === "SAFE_TO_DELETE");
}

export function getSweepSummaryBytes(
  locations: StoredDataLocation[],
): number {
  return locations.reduce((total, location) => total + (location.sizeBytes ?? 0), 0);
}

export async function sweepStoredData(
  context: StoredDataContext,
  locations: StoredDataLocation[],
): Promise<SweepResult> {
  const cleared: StoredDataLocation[] = [];
  const skipped: StoredDataLocation[] = [];

  for (const location of locations) {
    if (!location.canSweep || location.classification !== "SAFE_TO_DELETE") {
      skipped.push(location);
      continue;
    }

    if (location.id === "global-state:first-run") {
      await context.globalState.update(FIRST_RUN_STATE_KEY, undefined);
      cleared.push(location);
      continue;
    }

    if (location.location === "Managed by VS Code (no stable file path exposed)") {
      skipped.push(location);
      continue;
    }

    fs.rmSync(location.location, { recursive: true, force: true });
    cleared.push(location);
  }

  return { cleared, skipped };
}

export function formatClassification(
  classification: StoredDataClassification,
): string {
  switch (classification) {
    case "SAFE_TO_DELETE":
      return "SAFE TO DELETE";
    case "PROJECT_DATA":
      return "PROJECT DATA — DO NOT DELETE";
    case "UNKNOWN":
      return "UNKNOWN / NOT CLEARED BY THIS TOOL";
  }
}
