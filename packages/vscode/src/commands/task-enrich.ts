/**
 * packages/vscode/src/commands/task-enrich.ts
 *
 * Commands to add structured sections to existing task files on demand.
 *
 * devory.enrichTask         — scaffold all missing sections into the active task
 * devory.addAcceptanceCriteria — insert an Acceptance Criteria section
 * devory.addVerification       — insert a Verification section
 * devory.addDependencies        — insert a Depends On section
 * devory.addFilesAffected       — insert a Files Likely Affected section
 *
 * Sections are only inserted when they are absent from the current file.
 * Existing content is never modified.
 */

import * as fs from "fs";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

interface SectionDef {
  heading: string;
  placeholder: string;
}

const SECTIONS: Record<string, SectionDef> = {
  acceptanceCriteria: {
    heading: "## Acceptance Criteria",
    placeholder: "- Criterion 1 — specific, verifiable outcome\n",
  },
  verification: {
    heading: "## Verification",
    placeholder: "- `npm test`\n",
  },
  dependsOn: {
    heading: "## Depends On",
    placeholder: "- (none)\n",
  },
  filesAffected: {
    heading: "## Files Likely Affected",
    placeholder: "- (unknown)\n",
  },
  context: {
    heading: "## Context",
    placeholder:
      "Relevant background, constraints, and assumptions the agent needs to know.\n",
  },
};

// The order in which sections are appended when enriching all at once.
const ENRICH_ORDER: (keyof typeof SECTIONS)[] = [
  "acceptanceCriteria",
  "verification",
  "context",
  "filesAffected",
  "dependsOn",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasSection(content: string, heading: string): boolean {
  return content.split("\n").some((line) => line.trim() === heading);
}

function appendSection(content: string, def: SectionDef): string {
  // Ensure a single trailing newline before appending.
  const base = content.endsWith("\n") ? content : content + "\n";
  return `${base}\n${def.heading}\n\n${def.placeholder}`;
}

function resolveActiveTaskFile(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const filePath = editor.document.uri.fsPath;
  if (!filePath.endsWith(".md")) return null;
  if (!/[\\/]tasks[\\/]/.test(filePath)) return null;
  return filePath;
}

async function applySection(
  sectionKey: keyof typeof SECTIONS,
  filePath: string
): Promise<{ added: boolean; skipped: boolean }> {
  const def = SECTIONS[sectionKey];
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return { added: false, skipped: false };
  }

  if (hasSection(content, def.heading)) {
    return { added: false, skipped: true };
  }

  const updated = appendSection(content, def);
  fs.writeFileSync(filePath, updated, "utf-8");
  return { added: true, skipped: false };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function taskEnrichCommand(): Promise<void> {
  const filePath = resolveActiveTaskFile();
  if (!filePath) {
    vscode.window.showErrorMessage(
      "Devory: open a task file first to enrich it."
    );
    return;
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    vscode.window.showErrorMessage("Devory: could not read task file.");
    return;
  }

  const missing = ENRICH_ORDER.filter(
    (key) => !hasSection(content, SECTIONS[key].heading)
  );

  if (missing.length === 0) {
    vscode.window.showInformationMessage(
      "Devory: task already has all enrichment sections."
    );
    return;
  }

  let updated = content;
  for (const key of missing) {
    if (!hasSection(updated, SECTIONS[key].heading)) {
      updated = appendSection(updated, SECTIONS[key]);
    }
  }

  fs.writeFileSync(filePath, updated, "utf-8");

  const added = missing.map((k) => SECTIONS[k].heading.replace("## ", "")).join(", ");
  vscode.window.showInformationMessage(
    `Devory: added ${missing.length} section(s): ${added}.`
  );
}

export async function addSectionCommand(
  sectionKey: keyof typeof SECTIONS
): Promise<void> {
  const filePath = resolveActiveTaskFile();
  if (!filePath) {
    vscode.window.showErrorMessage(
      "Devory: open a task file first."
    );
    return;
  }

  const result = await applySection(sectionKey, filePath);
  const def = SECTIONS[sectionKey];
  const label = def.heading.replace("## ", "");

  if (result.skipped) {
    vscode.window.showInformationMessage(
      `Devory: "${label}" section already exists.`
    );
  } else if (result.added) {
    vscode.window.showInformationMessage(
      `Devory: added "${label}" section.`
    );
  } else {
    vscode.window.showErrorMessage(
      `Devory: could not add "${label}" section.`
    );
  }
}
