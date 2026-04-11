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
import { parseFrontmatter } from "@devory/core";
import type { TaskSummary } from "../lib/task-reader.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskExtras {
  agent: string | null;
  goal: string | null;
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
    const goalMatch = body.match(/^##\s+Goal\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/m);
    return {
      agent: (meta.agent as string | undefined) ?? null,
      goal: goalMatch ? goalMatch[1].trim().slice(0, 280) : null,
    };
  } catch {
    return { agent: null, goal: null };
  }
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
