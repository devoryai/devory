/**
 * packages/vscode/src/providers/task-assistant.ts
 *
 * Devory Task Assistant — a task-aware WebviewViewProvider for the sidebar.
 *
 * Displays the currently active task's context and exposes quick-action buttons
 * that invoke existing Devory commands. Includes a lightweight input area for
 * task-scoped questions (UI shell; response back-end is a future integration).
 *
 * Context is updated from two sources:
 *   1. onDidChangeActiveTextEditor — when a task .md file is opened
 *   2. setTask() called from extension.ts on tree selection
 */

import * as fs from "fs";
import * as vscode from "vscode";
import { estimateDryRunForTask, parseFrontmatter } from "@devory/core";
import type { TaskSummary } from "../lib/task-reader.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskExtras {
  agent: string | null;
  goal: string | null;
  acceptanceCriteria: string[];
  verification: string[];
  dependencies: string[];
  filesLikelyAffected: string[];
  metadataRows: Array<{ label: string; value: string }>;
  rawFrontmatter: string | null;
  rawTaskBody: string;
  dryRunEstimate: ReturnType<typeof estimateDryRunForTask>;
}

type WebviewMessage =
  | { type: "invokeCommand"; command: string }
  | { type: "submitQuery"; text: string };

// ── Provider ─────────────────────────────────────────────────────────────────

export class TaskAssistantProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "devoryTaskAssistant";

  private _view?: vscode.WebviewView;
  private _currentTask: TaskSummary | null = null;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._buildHtml();

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      this._handleMessage(msg);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._render();
      }
    });
  }

  /** Called from extension.ts when a task is selected or opened. */
  setTask(task: TaskSummary | null): void {
    this._currentTask = task;
    this._render();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _render(): void {
    if (this._view?.visible) {
      this._view.webview.html = this._buildHtml();
    }
  }

  private _handleMessage(msg: WebviewMessage): void {
    if (msg.type === "invokeCommand") {
      void vscode.commands.executeCommand(msg.command);
    } else if (msg.type === "submitQuery") {
      // Placeholder: task-aware responses are not wired yet.
      // The UI shell is ready for future integration.
      void this._view?.webview.postMessage({
        type: "queryResponse",
        text: "Task-aware assistant responses are not wired yet. Use the action buttons above to work with this task directly.",
      });
    }
  }

  private _buildHtml(): string {
    if (!this._currentTask) {
      return buildEmptyStateHtml();
    }
    const extras = readTaskExtras(this._currentTask.filepath);
    return buildTaskHtml(this._currentTask, extras);
  }
}

// ── Task extras (agent + goal) ────────────────────────────────────────────────

function readTaskExtras(filepath: string): TaskExtras {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const { meta, body } = parseFrontmatter(content);
    const preferredModels = asStringArray(meta.preferred_models);
    const dryRunEstimate = estimateDryRunForTask(
      { meta, body },
      {
        selected_model_id: preferredModels[0] ?? null,
      }
    );
    const goalMatch = body.match(/^##\s+Goal\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/m);
    const sections = parseH2Sections(body);
    const acceptanceCriteria = extractListItems(
      sections["acceptance criteria"] ?? ""
    );
    const verification = dedupe([
      ...extractListItems(
        sections.verification ??
          sections["verification steps"] ??
          sections["verification commands"] ??
          ""
      ),
      ...asStringArray(meta.verification),
    ]);
    const dependencies = dedupe([
      ...extractListItems(sections.dependencies ?? ""),
      ...asStringArray(meta.depends_on),
    ]);
    const filesLikelyAffected = dedupe([
      ...extractListItems(
        sections["files likely affected"] ?? sections["expected file changes"] ?? ""
      ),
      ...asStringArray(meta.files_likely_affected),
    ]);
    const metadataRows = buildMetadataRows(meta);
    return {
      agent: (meta.agent as string | undefined) ?? null,
      goal: goalMatch ? goalMatch[1].trim().slice(0, 280) : null,
      acceptanceCriteria,
      verification,
      dependencies,
      filesLikelyAffected,
      metadataRows,
      rawFrontmatter: extractFrontmatterBlock(content),
      rawTaskBody: body,
      dryRunEstimate,
    };
  } catch {
    return {
      agent: null,
      goal: null,
      acceptanceCriteria: [],
      verification: [],
      dependencies: [],
      filesLikelyAffected: [],
      metadataRows: [],
      rawFrontmatter: null,
      rawTaskBody: "",
      dryRunEstimate: estimateDryRunForTask({}),
    };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function extractListItems(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function parseH2Sections(body: string): Record<string, string> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of body.split("\n")) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      current = headingMatch[1].trim().toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }

  return Object.fromEntries(
    Object.entries(sections).map(([heading, lines]) => [heading, lines.join("\n").trim()])
  );
}

function extractFrontmatterBlock(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  return match ? match[1].trim() : null;
}

function buildMetadataRows(meta: Record<string, unknown>): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: unknown }> = [
    { label: "id", value: meta.id },
    { label: "title", value: meta.title },
    { label: "project", value: meta.project },
    { label: "status", value: meta.status },
    { label: "priority", value: meta.priority },
    { label: "agent", value: meta.agent },
    { label: "repo", value: meta.repo },
    { label: "branch", value: meta.branch },
    { label: "type", value: meta.type },
    { label: "depends_on", value: meta.depends_on },
    { label: "files_likely_affected", value: meta.files_likely_affected },
    { label: "verification", value: meta.verification },
  ];

  return fields
    .filter((field) => field.value !== undefined && field.value !== null && field.value !== "")
    .map((field) => ({
      label: field.label,
      value: Array.isArray(field.value) ? field.value.join(", ") : String(field.value),
    }));
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BASE_STYLES = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: transparent;
      padding: 12px 14px;
      margin: 0;
    }
    .header {
      font-size: 0.75em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .task-card {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .task-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .task-title {
      font-size: 1em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .task-meta {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
    }
    .meta-row { display: flex; gap: 6px; }
    .meta-label { min-width: 52px; opacity: 0.7; }
    .status-badge {
      display: inline-block;
      font-size: 0.75em;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background, rgba(255,255,255,0.12));
      color: var(--vscode-badge-foreground, var(--vscode-editor-foreground));
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .goal-excerpt {
      margin-top: 8px;
      font-size: 0.82em;
      color: var(--vscode-editor-foreground);
      opacity: 0.8;
      line-height: 1.5;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      padding-top: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .section-label {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 7px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 14px;
    }
    .action-row {
      display: flex;
      gap: 5px;
    }
    button {
      flex: 1;
      padding: 5px 8px;
      font-size: 0.82em;
      font-family: var(--vscode-font-family);
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      text-align: center;
      line-height: 1.3;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-color: var(--vscode-widget-border, rgba(255,255,255,0.15));
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.18));
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      margin: 12px 0;
    }
    .input-area { margin-bottom: 10px; }
    textarea {
      width: 100%;
      min-height: 64px;
      resize: vertical;
      padding: 7px 9px;
      font-size: 0.82em;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.15));
      border-radius: 3px;
      outline: none;
      line-height: 1.4;
    }
    textarea:focus {
      border-color: var(--vscode-focusBorder, var(--vscode-button-background));
    }
    .response-area {
      margin-top: 8px;
      padding: 8px 10px;
      font-size: 0.82em;
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.04));
      border-left: 3px solid var(--vscode-widget-border, rgba(255,255,255,0.2));
      border-radius: 0 3px 3px 0;
      min-height: 36px;
      display: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      padding: 20px 4px;
      text-align: center;
    }
    .empty-title {
      font-size: 0.95em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      margin-bottom: 10px;
    }
    .empty-body {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .empty-actions {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    .gov-root {
      margin-bottom: 14px;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      padding: 8px 10px;
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.02));
    }
    .gov-root summary {
      cursor: pointer;
      font-weight: 600;
      font-size: 0.83em;
    }
    .gov-inner {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .gov-section {
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 3px;
      padding: 6px 8px;
      background: var(--vscode-input-background, rgba(255,255,255,0.02));
    }
    .gov-section summary {
      cursor: pointer;
      font-size: 0.81em;
      font-weight: 600;
    }
    .gov-list {
      margin: 7px 0 0;
      padding-left: 16px;
      font-size: 0.81em;
      line-height: 1.6;
    }
    .gov-empty {
      margin-top: 7px;
      font-size: 0.81em;
      color: var(--vscode-descriptionForeground);
    }
    .gov-meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 7px;
      font-size: 0.8em;
    }
    .gov-meta-table td {
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      padding: 4px 0;
      vertical-align: top;
    }
    .gov-meta-table td:first-child {
      color: var(--vscode-descriptionForeground);
      width: 38%;
      padding-right: 8px;
    }
    .gov-raw {
      margin-top: 6px;
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }
    .gov-raw pre {
      margin: 6px 0 0;
      padding: 8px;
      border-radius: 3px;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      background: var(--vscode-input-background, rgba(255,255,255,0.02));
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
    }
  </style>
`;

function buildEmptyStateHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  ${BASE_STYLES}
</head>
<body>
  <div class="header">Devory Assistant</div>
  <div class="empty-state">
    <div class="empty-title">No task selected</div>
    <div class="empty-body">
      Open or create a task to use Devory Assistant.<br><br>
      This panel works from the current task, agent, and doctrine context — not as a general-purpose chat.
    </div>
    <div class="empty-actions">
      <button class="btn-primary" onclick="cmd('devory.taskCreate')">Create Task</button>
      <button class="btn-secondary" onclick="cmd('devory.taskList')">Open Task List</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(command) {
      vscode.postMessage({ type: 'invokeCommand', command });
    }
  </script>
</body>
</html>`;
}

function renderGovernanceSection(title: string, items: string[], emptyText: string): string {
  const listHtml =
    items.length === 0
      ? `<div class="gov-empty">${esc(emptyText)}</div>`
      : `<ul class="gov-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;

  return `
    <details class="gov-section">
      <summary>${esc(title)}</summary>
      ${listHtml}
    </details>
  `;
}

function renderMetadataSection(extras: TaskExtras): string {
  const rows =
    extras.metadataRows.length === 0
      ? `<div class="gov-empty">No structured task metadata is available.</div>`
      : `
        <table class="gov-meta-table">
          <tbody>
            ${extras.metadataRows
              .map((row) => `<tr><td>${esc(row.label)}</td><td>${esc(row.value)}</td></tr>`)
              .join("")}
          </tbody>
        </table>
      `;

  const rawFrontmatter = extras.rawFrontmatter
    ? `
      <details class="gov-raw">
        <summary>View raw frontmatter</summary>
        <pre>${esc(extras.rawFrontmatter)}</pre>
      </details>
    `
    : "";

  const rawTaskBody = extras.rawTaskBody.trim()
    ? `
      <details class="gov-raw">
        <summary>View raw task body</summary>
        <pre>${esc(extras.rawTaskBody.trim())}</pre>
      </details>
    `
    : "";

  return `
    <details class="gov-section">
      <summary>Task Metadata</summary>
      ${rows}
      ${rawFrontmatter}
      ${rawTaskBody}
    </details>
  `;
}

function renderGovernanceDetails(extras: TaskExtras): string {
  return `
    <details class="gov-root">
      <summary>Show Governance Details</summary>
      <div class="gov-inner">
        ${renderGovernanceSection(
          "Acceptance Criteria",
          extras.acceptanceCriteria,
          "No acceptance criteria were parsed from this task."
        )}
        ${renderGovernanceSection(
          "Verification",
          extras.verification,
          "No verification steps were found."
        )}
        ${renderGovernanceSection(
          "Dependencies",
          extras.dependencies,
          "No dependencies are declared."
        )}
        ${renderGovernanceSection(
          "Files Likely Affected",
          extras.filesLikelyAffected,
          "No files likely affected are listed."
        )}
        ${renderMetadataSection(extras)}
        <details class="gov-section">
          <summary>Execution Artifacts</summary>
          <div class="gov-empty">
            Linked execution artifacts are not available in this panel yet.
            Start a run, then use Inspect Artifacts or Inspect Recent Runs.
          </div>
        </details>
      </div>
    </details>
  `;
}

function formatUsdRange(min: number, max: number): string {
  const fmt = (value: number) => `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
  if (min === max) return fmt(min);
  return `${fmt(min)} - ${fmt(max)}`;
}

function renderDryRunEstimate(extras: TaskExtras): string {
  const estimate = extras.dryRunEstimate;
  const suggestion = estimate.lower_cost_suggestion;
  const isLowConfidence = estimate.confidence === "low";
  const usesFallbackModel = estimate.model_id === null;
  const whyRows = estimate.reasons
    .slice(0, 3)
    .map((reason) => `<li>${esc(reason)}</li>`)
    .join("");

  const suggestionHtml = suggestion
    ? `<div class=\"gov-empty\" style=\"margin-top:6px;\"><strong>Lower cost option:</strong> ${esc(suggestion.display_name)} (${esc(suggestion.runner)}) · ${esc(
        formatUsdRange(suggestion.estimated_cost_usd.min, suggestion.estimated_cost_usd.max)
      )}</div>`
    : "";

  return `
    <div class=\"gov-root\">
      <div class=\"section-label\" style=\"margin-bottom:8px;\">Dry Run Estimate</div>
      <div class=\"gov-empty\">
        <strong>Estimate only</strong> — planning visibility, not billing precision.
      </div>
      <table class=\"gov-meta-table\">
        <tbody>
          <tr><td>runner/model</td><td>${esc(estimate.runner)} / ${esc(estimate.model_display_name)}</td></tr>
          <tr><td>context tier</td><td>${esc(estimate.context_tier)}</td></tr>
          <tr><td>output tier</td><td>${esc(estimate.output_tier)}</td></tr>
          <tr><td>cost estimate</td><td>${esc(formatUsdRange(estimate.estimated_cost_usd.min, estimate.estimated_cost_usd.max))}</td></tr>
          <tr><td>confidence</td><td>${esc(estimate.confidence)}</td></tr>
        </tbody>
      </table>
      ${
        isLowConfidence
          ? `<div class=\"gov-empty\" style=\"margin-top:6px;\"><strong>Low confidence:</strong> model or task metadata is incomplete.</div>`
          : ""
      }
      ${
        usesFallbackModel
          ? `<div class=\"gov-empty\" style=\"margin-top:6px;\"><strong>Fallback model pricing:</strong> exact workspace default model was not available.</div>`
          : ""
      }
      <details class=\"gov-section\" style=\"margin-top:8px;\">
        <summary>Why this estimate?</summary>
        <ul class=\"gov-list\">${whyRows}</ul>
        <div class=\"gov-empty\">
          Tokens: prompt ${estimate.estimated_input_tokens.min}-${estimate.estimated_input_tokens.max},
          output ${estimate.estimated_output_tokens.min}-${estimate.estimated_output_tokens.max}.
        </div>
      </details>
      ${suggestionHtml}
    </div>
  `;
}

function buildTaskHtml(task: TaskSummary, extras: TaskExtras): string {
  const canEnrich = task.stage !== "done" && task.stage !== "archived";
  const canPromote =
    task.stage === "backlog" ||
    task.stage === "ready" ||
    task.stage === "doing";
  const canRun = task.stage === "ready";
  const isReview = task.stage === "review";

  const agentRow = extras.agent
    ? `<div class="meta-row"><span class="meta-label">Agent</span><span>${esc(extras.agent)}</span></div>`
    : "";

  const goalHtml = extras.goal
    ? `<div class="goal-excerpt">${esc(extras.goal)}</div>`
    : "";
  const governanceDetailsHtml = renderGovernanceDetails(extras);
  const dryRunEstimateHtml = renderDryRunEstimate(extras);

  const priorityBadge = task.priority
    ? ` &nbsp;<span class="status-badge">${esc(task.priority)}</span>`
    : "";

  const enrichButtons = canEnrich
    ? `
      <div class="action-row">
        <button class="btn-primary" onclick="cmd('devory.enrichTask')">Enrich Task</button>
        ${canPromote ? `<button class="btn-secondary" onclick="cmd('devory.taskPromote')">Promote Task</button>` : ""}
        ${isReview ? `<button class="btn-primary" onclick="cmd('devory.taskApprove')">Approve</button>` : ""}
      </div>
      <div class="action-row">
        <button class="btn-secondary" onclick="cmd('devory.addAcceptanceCriteria')">+ Acceptance Criteria</button>
        <button class="btn-secondary" onclick="cmd('devory.addVerification')">+ Verification</button>
      </div>
      <div class="action-row">
        <button class="btn-secondary" onclick="cmd('devory.addFilesAffected')">+ Files Affected</button>
        ${canRun ? `<button class="btn-primary" onclick="cmd('devory.runStart')">▶ Run Task</button>` : ""}
      </div>`
    : `<div class="action-row">
        ${isReview ? `<button class="btn-primary" onclick="cmd('devory.taskApprove')">Approve</button><button class="btn-secondary" onclick="cmd('devory.taskSendBack')">Send Back</button>` : ""}
        ${task.stage === "blocked" || task.stage === "archived" ? `<button class="btn-secondary" onclick="cmd('devory.taskRequeue')">Requeue Task</button>` : ""}
        ${task.stage === "done" ? `<div style="font-size:0.82em;color:var(--vscode-descriptionForeground);padding:4px 0">Task is done.</div>` : ""}
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  ${BASE_STYLES}
</head>
<body>
  <div class="header">Devory Assistant</div>

  <div class="task-card">
    <div class="task-id">${esc(task.id)} &nbsp;<span class="status-badge">${esc(task.stage)}</span>${priorityBadge}</div>
    <div class="task-title">${esc(task.title)}</div>
    <div class="task-meta">
      <div class="meta-row"><span class="meta-label">Project</span><span>${esc(task.project || "—")}</span></div>
      ${agentRow}
    </div>
    ${goalHtml}
  </div>

  ${governanceDetailsHtml}
  ${dryRunEstimateHtml}

  <div class="section-label">Task Actions</div>
  <div class="actions">
    ${enrichButtons}
  </div>

  <hr class="divider">

  <div class="section-label">Ask About This Task</div>
  <div class="input-area">
    <textarea id="query-input"
      placeholder="e.g. What approach should I take? Which files are affected? What acceptance criteria make sense?"
    ></textarea>
  </div>
  <div class="action-row">
    <button class="btn-primary" id="ask-btn" onclick="submitQuery()">Ask</button>
  </div>
  <div class="response-area" id="response-area"></div>

  <script>
    const vscode = acquireVsCodeApi();

    function cmd(command) {
      vscode.postMessage({ type: 'invokeCommand', command });
    }

    function submitQuery() {
      const input = document.getElementById('query-input');
      const text = input.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'submitQuery', text });
      document.getElementById('ask-btn').disabled = true;
      document.getElementById('ask-btn').textContent = 'Asking…';
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'queryResponse') {
        const area = document.getElementById('response-area');
        area.style.display = 'block';
        area.textContent = msg.text;
        document.getElementById('ask-btn').disabled = false;
        document.getElementById('ask-btn').textContent = 'Ask';
      }
    });

    // Submit on Ctrl+Enter / Cmd+Enter
    document.getElementById('query-input').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        submitQuery();
      }
    });
  </script>
</body>
</html>`;
}
