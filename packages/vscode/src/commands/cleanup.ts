/**
 * packages/vscode/src/commands/cleanup.ts
 *
 * User-facing storage transparency and cleanup commands.
 * This command set is intentionally conservative:
 * it only deletes extension-owned local data and never touches project files.
 */

import * as vscode from "vscode";
import {
  collectStoredDataLocations,
  formatBytes,
  formatClassification,
  getSweepableLocations,
  getSweepSummaryBytes,
  sweepStoredData,
  type StoredDataContext,
  type StoredDataLocation,
} from "../lib/stored-data.js";

interface SweepActionPick extends vscode.QuickPickItem {
  actionId: "sweep" | "view" | "cancel";
}

interface SweepTargetPick extends vscode.QuickPickItem {
  location: StoredDataLocation;
}

function describeSweepableLocation(location: StoredDataLocation): string {
  const parts = [location.usage];
  if (location.sizeBytes !== null) {
    parts.push(`About ${formatBytes(location.sizeBytes)}`);
  }
  if (!location.exists) {
    parts.push("Nothing stored right now");
  }
  return parts.join("  ");
}

function renderStoredDataReport(locations: StoredDataLocation[], factoryRoot: string): string {
  const lines: string[] = [
    "Devory Stored Data Locations",
    "═══════════════════════════════════════════════════════════════",
    "",
    "Devory stores most working files as project data in your factory/workspace.",
    "This command only clears local extension data owned by the VS Code extension.",
    "Project folders such as tasks, artifacts, doctrine, skills, templates,",
    ".devory, and .devory-governance are never deleted by this tool.",
    "",
    "SAFE TO DELETE      = owned by the Devory extension. No project files.",
    "PROJECT DATA        = lives in your workspace. This tool will not touch it.",
    "UNKNOWN             = not cleared by this tool.",
    "",
    "═══════════════════════════════════════════════════════════════",
    "",
  ];

  if (factoryRoot) {
    lines.push(`Factory root: ${factoryRoot}`);
    lines.push("");
  }

  for (const location of locations) {
    lines.push(`[${formatClassification(location.classification)}]  ${location.label}`);
    lines.push(`  Path    : ${location.location}`);
    lines.push(`  Use     : ${location.usage}`);
    if (location.sizeBytes !== null) {
      lines.push(`  Size    : ${formatBytes(location.sizeBytes)}`);
    }
    lines.push(`  Exists  : ${location.exists ? "yes" : "no"}`);
    lines.push(`  Cleanup : ${location.cleanupNote}`);
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push("What Devory WILL delete (via Sweep the Workshop):");
  lines.push("  • VS Code global state flag (devory.firstRunCompleted)");
  lines.push("  • Extension global storage folder");
  lines.push("  • Workspace extension storage folder (if present)");
  lines.push("  • Extension log directory (if present)");
  lines.push("");
  lines.push("What Devory will NEVER delete:");
  lines.push("  • tasks/, runs/, artifacts/, doctrine/, skills/, templates/");
  lines.push("  • .devory/, .devory-governance/");
  lines.push("  • FACTORY_CONTEXT.md, devory.standards.yml");
  lines.push("  • Any file that could reasonably be committed to git");
  lines.push("  • Anything in your workspace or git repository");
  lines.push("");
  lines.push("To remove project data: delete it manually from your repo.");

  return lines.join("\n");
}

async function promptForSweepTargets(
  safeLocations: StoredDataLocation[],
): Promise<StoredDataLocation[] | undefined> {
  const picks = safeLocations.map<SweepTargetPick>((location) => ({
    label: location.label,
    description: describeSweepableLocation(location),
    detail: location.location,
    picked: location.exists || location.id === "global-state:first-run",
    location,
  }));

  const selected = await vscode.window.showQuickPick(picks, {
    title: "Devory: Sweep the Workshop — Select Items to Clear",
    placeHolder: "Only Local Extension Data is listed here. Project data is not shown and will not be touched.",
    canPickMany: true,
  });

  return selected?.map((pick) => pick.location);
}

export async function showStoredDataLocationsCommand(
  context: StoredDataContext,
  factoryRoot: string,
  output: vscode.OutputChannel,
): Promise<void> {
  const locations = await collectStoredDataLocations(context, factoryRoot);
  output.clear();
  output.appendLine(renderStoredDataReport(locations, factoryRoot));
  output.show(true);
}

export async function sweepWorkshopCommand(
  context: StoredDataContext,
  factoryRoot: string,
  output: vscode.OutputChannel,
): Promise<void> {
  const locations = await collectStoredDataLocations(context, factoryRoot);
  const safeLocations = getSweepableLocations(locations);
  const reclaimableBytes = getSweepSummaryBytes(safeLocations);

  const action = await vscode.window.showQuickPick<SweepActionPick>(
    [
      {
        label: "Devory stores most working files as project data in your factory/workspace.",
        kind: vscode.QuickPickItemKind.Separator,
        actionId: "cancel",
      },
      {
        label: "This command only clears local extension data owned by the VS Code extension.",
        kind: vscode.QuickPickItemKind.Separator,
        actionId: "cancel",
      },
      {
        label: "Project folders (tasks, artifacts, doctrine, skills, templates, .devory, .devory-governance) are never deleted by this tool.",
        kind: vscode.QuickPickItemKind.Separator,
        actionId: "cancel",
      },
      {
        label: "Sweep Local Extension Data",
        description:
          reclaimableBytes > 0
            ? `Clear about ${formatBytes(reclaimableBytes)} of extension-owned data`
            : "Clear extension-owned data and reset Devory local state",
        detail:
          "Clears VS Code extension storage, global state flags, and log files. " +
          "Your workspace, tasks, doctrine, skills, and all project files will not be touched.",
        actionId: "sweep",
      },
      {
        label: "View Stored Data Locations",
        description: "Show all paths, purpose, and safety labels",
        detail:
          "Lists every location Devory uses, labeled as Local Extension Data, " +
          "Project Data, or Unknown. Nothing is deleted.",
        actionId: "view",
      },
      {
        label: "Cancel",
        actionId: "cancel",
      },
    ],
    {
      title: "Devory: Sweep the Workshop",
      placeHolder: "Choose an action",
    },
  );

  if (!action || action.actionId === "cancel") return;

  if (action.actionId === "view") {
    await showStoredDataLocationsCommand(context, factoryRoot, output);
    return;
  }

  const selectedLocations = await promptForSweepTargets(safeLocations);
  if (!selectedLocations || selectedLocations.length === 0) return;

  const summary = selectedLocations
    .map((location) => `• ${location.label}`)
    .join("\n");

  const confirmed = await vscode.window.showWarningMessage(
    [
      "This clears only Local Extension Data.",
      "",
      summary,
      "",
      "Devory stores most working files as project data in your factory/workspace.",
      "This command only clears local extension data owned by the VS Code extension.",
      "Project folders such as tasks, artifacts, doctrine, skills, templates,",
      ".devory, and .devory-governance are never deleted by this tool.",
    ].join("\n"),
    { modal: true },
    "Sweep",
  );

  if (confirmed !== "Sweep") return;

  const result = await sweepStoredData(context, selectedLocations);
  const clearedSummary = result.cleared.length
    ? result.cleared.map((location) => location.label).join(", ")
    : "Nothing was cleared";

  await showStoredDataLocationsCommand(context, factoryRoot, output);
  void vscode.window.showInformationMessage(`Sweep complete. Cleared: ${clearedSummary}.`);
}

export async function cleanupLocalDataCommand(
  context: StoredDataContext,
  factoryRoot = "",
  output?: vscode.OutputChannel,
): Promise<void> {
  const cleanupOutput =
    output ?? vscode.window.createOutputChannel("Devory: Storage");
  await sweepWorkshopCommand(context, factoryRoot, cleanupOutput);
}
