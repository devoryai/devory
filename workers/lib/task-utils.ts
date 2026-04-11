/**
 * workers/lib/task-utils.ts
 *
 * Shared utilities used by all factory workers.
 * Centralised here so each worker stays focused on its own stage logic.
 *
 * Contents:
 *  - TaskMeta        (re-exported from @devory/core)
 *  - ParseResult     (re-exported from @devory/core)
 *  - parseFrontmatter  (re-exported from @devory/core)
 *  - ValidationResult return type for validateTask
 *  - rewriteStatus   pure rewriter — no external deps
 *  - validateTask    field-level validation with a configurable expected status
 *  - writeRunArtifact  writes a markdown artifact to runs/
 */

import * as fs from "fs";
import * as path from "path";
// Re-export shared parser, types, and validation primitives from @devory/core.
// Existing worker callers can keep importing from this module without change.
export {
  parseFrontmatter,
  REQUIRED_FIELDS,
  validateTask,
  validateTaskBody,
  type ValidationResult,
} from "@devory/core";
export type { TaskMeta, ParseResult } from "@devory/core";
import type { TaskMeta, ValidationResult } from "@devory/core";

// ---------------------------------------------------------------------------
// Status rewriter
// Patches only the `status:` line inside the YAML frontmatter block.
// Operates on raw file content so no re-serialisation is needed.
// ---------------------------------------------------------------------------

export function rewriteStatus(content: string, newStatus: string): string {
  // Limit the replace to the opening frontmatter block (between the first
  // two `---` delimiters) so body text is never touched.
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch) return content;

  const updatedFm = fmMatch[1].replace(
    /^(status:\s*).*$/m,
    `$1${newStatus}`
  );
  return content.replace(fmMatch[1], updatedFm);
}

// ---------------------------------------------------------------------------
// Run artifact writer
// Writes a structured markdown record of what happened during this run.
// FUTURE: also emit a machine-readable JSON sidecar for dashboards.
// ---------------------------------------------------------------------------

export interface ArtifactOpts {
  runsDir: string;
  taskId: string;
  filename: string;
  timestamp: string;
  meta: Partial<TaskMeta>;
  validation: ValidationResult;
  /** Human-readable label for the from-state, e.g. "ready" */
  fromStatus: string;
  /** Human-readable label for the to-state, e.g. "doing".
   *  Omit for validation-failure artifacts where no transition occurred. */
  toStatus?: string;
  /** Summary of the execution outcome, e.g. "success (defaulted)" */
  executionOutcome?: string;
}

export function writeRunArtifact(opts: ArtifactOpts): void {
  const {
    runsDir,
    taskId,
    filename,
    timestamp,
    meta,
    validation,
    fromStatus,
    toStatus,
    executionOutcome,
  } = opts;

  fs.mkdirSync(runsDir, { recursive: true });

  const slug = taskId || filename.replace(/\.md$/, "");
  const artifactName = `${timestamp}-${slug}.md`;
  const artifactPath = path.join(runsDir, artifactName);

  const resultLabel = validation.valid ? "accepted" : "validation-failed";

  const lines: string[] = [
    "---",
    `task_id: ${taskId || "(unknown)"}`,
    `source_file: ${filename}`,
    `timestamp: ${timestamp}`,
    `from_status: ${fromStatus}`,
    `to_status: ${toStatus ?? "(unchanged)"}`,
    `result: ${resultLabel}`,
    ...(executionOutcome ? [`execution_outcome: ${executionOutcome}`] : []),
    "---",
    "",
    `# Run Artifact — ${taskId || filename}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Task ID | ${taskId || "(unknown)"} |`,
    `| Timestamp | ${timestamp} |`,
    `| From status | \`${fromStatus}\` |`,
    `| To status | \`${toStatus ?? "(unchanged)"}\` |`,
    `| Validation | ${validation.valid ? "passed" : "failed"} |`,
    ...(executionOutcome
      ? [`| Execution outcome | ${executionOutcome} |`]
      : []),
    "",
  ];

  if (!validation.valid) {
    lines.push(
      "## Validation Errors",
      "",
      "Task was **not** advanced. Fix the errors below and re-queue.",
      "",
      ...validation.errors.map((e) => `- ${e}`),
    );
  } else {
    lines.push(
      "## Task Summary",
      "",
      `- **Title:** ${meta.title}`,
      `- **Project:** ${meta.project}`,
      `- **Agent:** ${meta.agent}`,
      `- **Priority:** ${meta.priority ?? "(none)"}`,
      `- **Branch:** ${meta.branch ?? "(none)"}`,
    );

    const verification = Array.isArray(meta.verification) ? meta.verification : [];
    if (verification.length > 0) {
      lines.push("", "## Verification Commands", "");
      verification.forEach((cmd) => lines.push(`- \`${cmd}\``));
    }
  }

  fs.writeFileSync(artifactPath, lines.join("\n") + "\n", "utf-8");
  console.log(`[factory-worker] Artifact written: runs/${artifactName}`);
}
