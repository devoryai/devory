/**
 * packages/vscode/src/providers/show-work.ts
 *
 * Devory Show Work — operational visibility panel.
 *
 * Answers: What is running right now? Which task is active? What stage is it
 * in? What happened most recently? What needs attention?
 *
 * Data is read entirely from the filesystem (no fabricated state).
 * The shell HTML is built once; data updates are pushed via postMessage
 * so the panel feels instant and never flashes on refresh.
 */

import * as vscode from "vscode";
import type { ManagedRunState } from "../lib/run-controller.js";
import {
  readShowWorkData,
  formatRelativeTime,
  type ShowWorkData,
} from "../lib/show-work-reader.js";

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

type WebviewMessage =
  | { type: "invokeCommand"; command: string }
  | { type: "openTask"; taskId: string };

// ── Provider ─────────────────────────────────────────────────────────────────

export class ShowWorkProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "devoryShowWork";

  private _view?: vscode.WebviewView;
  private _refreshInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly getTasksDir: () => string,
    private readonly getArtifactsDir: () => string,
    private readonly getRunState: () => ManagedRunState
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildShellHtml();

    // Push initial state right away.
    this._sendState();

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      if (msg.type === "invokeCommand") {
        void vscode.commands.executeCommand(msg.command);
      } else if (msg.type === "openTask") {
        // Open the task file in the editor if we can find it.
        void vscode.commands.executeCommand(msg.command);
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendState();
        this._startRefresh();
      } else {
        this._stopRefresh();
      }
    });

    webviewView.onDidDispose(() => {
      this._stopRefresh();
    });

    this._startRefresh();
  }

  /** Call this whenever external state changes (e.g. run started/stopped). */
  refresh(): void {
    this._sendState();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _sendState(): void {
    if (!this._view?.visible) return;
    try {
      const data = readShowWorkData(this.getTasksDir(), this.getArtifactsDir());
      const runState = this.getRunState();
      void this._view.webview.postMessage({
        type: "update",
        runState,
        data: serializeData(data),
        refreshedAt: new Date().toISOString(),
      });
    } catch {
      // Never crash the panel on a read error.
    }
  }

  private _startRefresh(): void {
    this._stopRefresh();
    this._refreshInterval = setInterval(
      () => this._sendState(),
      REFRESH_INTERVAL_MS
    );
  }

  private _stopRefresh(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = undefined;
    }
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

/** Converts filesystem timestamps to formatted strings before sending to webview. */
function serializeData(data: ShowWorkData) {
  return {
    doingTasks: data.doingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stage: t.stage,
      priority: t.priority,
      agent: t.agent,
      filesLikelyAffected: t.filesLikelyAffected,
      updatedAgo: formatRelativeTime(new Date(t.modifiedAt).toISOString()),
    })),
    reviewTasks: data.reviewTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stage: t.stage,
      priority: t.priority,
      agent: t.agent,
      filesLikelyAffected: t.filesLikelyAffected,
      updatedAgo: formatRelativeTime(new Date(t.modifiedAt).toISOString()),
    })),
    heartbeat: data.isHeartbeatFresh && data.latestHeartbeat
      ? {
          runId: data.latestHeartbeat.run_id,
          phase: data.latestHeartbeat.current_phase ?? null,
          currentTaskId: data.latestHeartbeat.current_task_id ?? null,
          currentAdapter: data.latestHeartbeat.current_adapter ?? null,
          recentEventSummary: data.latestHeartbeat.recent_event_summary ?? null,
          lastHeartbeatAgo: formatRelativeTime(data.latestHeartbeat.last_heartbeat_at),
          suspicionFlags: data.latestHeartbeat.suspicion_flags ?? [],
        }
      : null,
  };
}

// ── Shell HTML ────────────────────────────────────────────────────────────────

function buildShellHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: transparent;
      padding: 10px 14px;
      margin: 0;
    }

    /* ── Layout ── */
    .header {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .refreshed-at {
      font-size: 0.9em;
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      opacity: 0.6;
    }
    .section {
      margin-bottom: 12px;
    }
    .section-label {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    /* ── Run status banner ── */
    .run-banner {
      border-radius: 4px;
      padding: 8px 10px;
      margin-bottom: 10px;
      font-size: 0.82em;
      line-height: 1.5;
    }
    .run-banner.running {
      background: color-mix(in srgb, var(--vscode-terminal-ansiGreen, #4ec9b0) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiGreen, #4ec9b0) 35%, transparent);
    }
    .run-banner.paused {
      background: color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 35%, transparent);
    }
    .run-banner.idle {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    }
    .run-banner-title {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.running { background: var(--vscode-terminal-ansiGreen, #4ec9b0); }
    .dot.paused  { background: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .dot.idle    { background: var(--vscode-descriptionForeground); opacity: 0.4; }
    .run-detail {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    .run-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      opacity: 0.7;
    }
    .event-summary {
      margin-top: 4px;
      font-style: italic;
      opacity: 0.85;
    }
    .suspicion {
      margin-top: 4px;
      color: var(--vscode-terminal-ansiYellow, #dcdcaa);
    }

    /* ── Task cards ── */
    .task-card {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      padding: 8px 10px;
      margin-bottom: 7px;
    }
    .task-card:last-child { margin-bottom: 0; }
    .task-card-top {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 2px;
    }
    .task-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }
    .task-title {
      font-size: 0.88em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      line-height: 1.3;
      flex: 1;
    }
    .task-meta {
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      margin-top: 4px;
    }
    .meta-row { display: flex; gap: 5px; }
    .meta-label { min-width: 46px; opacity: 0.6; }
    .files-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .file-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      opacity: 0.75;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Badges ── */
    .badge {
      display: inline-block;
      font-size: 0.72em;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      vertical-align: middle;
    }
    .badge-stage-doing    { background: color-mix(in srgb, var(--vscode-terminal-ansiBlue, #569cd6) 20%, transparent); color: var(--vscode-terminal-ansiBlue, #569cd6); }
    .badge-stage-review   { background: color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 18%, transparent); color: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .badge-prio-urgent    { background: color-mix(in srgb, var(--vscode-terminal-ansiRed, #f44747) 18%, transparent); color: var(--vscode-terminal-ansiRed, #f44747); }
    .badge-prio-high      { background: color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 15%, transparent); color: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .badge-prio-medium    { background: rgba(255,255,255,0.1); color: var(--vscode-descriptionForeground); }
    .badge-prio-low       { background: rgba(255,255,255,0.06); color: var(--vscode-descriptionForeground); opacity: 0.7; }

    /* ── Review attention strip ── */
    .attention-strip {
      border-left: 2px solid var(--vscode-terminal-ansiYellow, #dcdcaa);
      padding-left: 8px;
    }

    /* ── Actions ── */
    .actions {
      display: flex;
      gap: 5px;
      margin-top: 7px;
    }
    button {
      flex: 1;
      padding: 4px 7px;
      font-size: 0.78em;
      font-family: var(--vscode-font-family);
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      line-height: 1.3;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-color: var(--vscode-widget-border, rgba(255,255,255,0.15));
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.15)); }

    /* ── Empty / loading ── */
    .empty {
      padding: 16px 4px 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
      line-height: 1.6;
    }
    .loading {
      padding: 20px 4px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    Show Work
    <span class="refreshed-at" id="refreshed-at"></span>
  </div>
  <div id="root"><div class="loading">Loading…</div></div>

  <script>
    const vscode = acquireVsCodeApi();

    function cmd(command) {
      vscode.postMessage({ type: 'invokeCommand', command });
    }

    // ── Escape helpers ──────────────────────────────────────────────────────
    function esc(s) {
      if (!s) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // ── Badge builders ──────────────────────────────────────────────────────
    function stageBadge(stage) {
      return '<span class="badge badge-stage-' + esc(stage) + '">' + esc(stage) + '</span>';
    }
    function prioBadge(priority) {
      if (!priority) return '';
      const cls = 'badge-prio-' + esc(priority.toLowerCase());
      return '<span class="badge ' + cls + '">' + esc(priority) + '</span>';
    }

    // ── Run banner ──────────────────────────────────────────────────────────
    function buildRunBanner(runState, heartbeat) {
      let stateLabel, dotClass, bannerClass;
      if (runState === 'running') {
        stateLabel = 'Run Active';
        dotClass = bannerClass = 'running';
      } else if (runState === 'paused') {
        stateLabel = 'Run Paused';
        dotClass = bannerClass = 'paused';
      } else {
        stateLabel = 'Factory Idle';
        dotClass = bannerClass = 'idle';
      }

      let detailHtml = '';
      if (heartbeat) {
        const adapter = heartbeat.currentAdapter ? ' via ' + esc(heartbeat.currentAdapter) : '';
        const phase   = heartbeat.phase ? esc(heartbeat.phase) + adapter : '';
        const taskRef = heartbeat.currentTaskId ? esc(heartbeat.currentTaskId) : '';
        const summary = heartbeat.recentEventSummary ? esc(heartbeat.recentEventSummary) : '';
        const flags   = (heartbeat.suspicionFlags || []).length > 0
          ? '<div class="suspicion">⚠ ' + heartbeat.suspicionFlags.map(esc).join(', ') + '</div>'
          : '';

        detailHtml += '<div class="run-detail">';
        if (phase)   detailHtml += '<div>' + phase + (taskRef ? ' · ' + taskRef : '') + '</div>';
        if (summary) detailHtml += '<div class="event-summary">' + summary + '</div>';
        if (heartbeat.lastHeartbeatAgo) {
          detailHtml += '<div style="opacity:0.55;font-size:0.9em">updated ' + esc(heartbeat.lastHeartbeatAgo) + '</div>';
        }
        detailHtml += flags;
        detailHtml += '</div>';
      }

      let actionHtml = '';
      if (runState === 'running') {
        actionHtml = '<div class="actions">' +
          '<button class="btn-secondary" onclick="cmd(\'devory.runPause\')">Pause</button>' +
          '<button class="btn-secondary" onclick="cmd(\'devory.runStop\')">Stop</button>' +
          '</div>';
      } else if (runState === 'paused') {
        actionHtml = '<div class="actions">' +
          '<button class="btn-primary" onclick="cmd(\'devory.runStart\')">Resume</button>' +
          '</div>';
      } else {
        actionHtml = '<div class="actions">' +
          '<button class="btn-secondary" onclick="cmd(\'devory.runStart\')">▶ Start Run</button>' +
          '</div>';
      }

      return '<div class="run-banner ' + bannerClass + '">' +
        '<div class="run-banner-title">' +
          '<span class="dot ' + dotClass + '"></span>' +
          '<strong>' + stateLabel + '</strong>' +
        '</div>' +
        detailHtml +
        actionHtml +
        '</div>';
    }

    // ── Task card ───────────────────────────────────────────────────────────
    function buildTaskCard(task, isReview) {
      const filesHtml = task.filesLikelyAffected && task.filesLikelyAffected.length > 0
        ? '<div class="meta-row"><span class="meta-label">Files</span>' +
          '<div class="files-list">' +
          task.filesLikelyAffected.map(f => '<span class="file-path" title="' + esc(f) + '">' + esc(f) + '</span>').join('') +
          '</div></div>'
        : '';

      const agentHtml = task.agent
        ? '<div class="meta-row"><span class="meta-label">Agent</span><span>' + esc(task.agent) + '</span></div>'
        : '';

      const updatedHtml = task.updatedAgo
        ? '<div class="meta-row"><span class="meta-label">Updated</span><span>' + esc(task.updatedAgo) + '</span></div>'
        : '';

      const attentionClass = isReview ? ' attention-strip' : '';
      const reviewActions = isReview
        ? '<div class="actions">' +
          '<button class="btn-primary" onclick="cmd(\'devory.taskApprove\')">Approve</button>' +
          '<button class="btn-secondary" onclick="cmd(\'devory.taskSendBack\')">Send Back</button>' +
          '</div>'
        : '';

      return '<div class="task-card' + attentionClass + '">' +
        '<div class="task-card-top">' +
          '<span class="task-id">' + esc(task.id) + '</span>' +
          stageBadge(task.stage) +
          (task.priority ? prioBadge(task.priority) : '') +
        '</div>' +
        '<div class="task-title">' + esc(task.title) + '</div>' +
        '<div class="task-meta">' +
          agentHtml +
          filesHtml +
          updatedHtml +
        '</div>' +
        reviewActions +
        '</div>';
    }

    // ── Main render ─────────────────────────────────────────────────────────
    function render(runState, data) {
      const parts = [];

      // Run status banner (always shown).
      parts.push(buildRunBanner(runState, data.heartbeat));

      // Doing tasks.
      if (data.doingTasks && data.doingTasks.length > 0) {
        parts.push('<div class="section">');
        parts.push('<div class="section-label">In Progress</div>');
        data.doingTasks.forEach(t => parts.push(buildTaskCard(t, false)));
        parts.push('</div>');
      }

      // Review tasks (needs attention).
      if (data.reviewTasks && data.reviewTasks.length > 0) {
        parts.push('<div class="section">');
        parts.push('<div class="section-label">Needs Attention · Review</div>');
        data.reviewTasks.forEach(t => parts.push(buildTaskCard(t, true)));
        parts.push('</div>');
      }

      // Empty state: nothing in doing or review.
      if (
        (!data.doingTasks || data.doingTasks.length === 0) &&
        (!data.reviewTasks || data.reviewTasks.length === 0)
      ) {
        const idleMsg = runState === 'running'
          ? 'Run is active — waiting for the first task to enter the doing stage.'
          : 'No tasks are currently in progress or awaiting review.';
        parts.push('<div class="empty">' + esc(idleMsg) + '</div>');
        if (runState === 'idle') {
          parts.push(
            '<div class="actions" style="margin-top:0">' +
            '<button class="btn-secondary" onclick="cmd(\'devory.taskList\')">View Tasks</button>' +
            '</div>'
          );
        }
      }

      document.getElementById('root').innerHTML = parts.join('');
    }

    // ── Message listener ────────────────────────────────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'update') {
        render(msg.runState, msg.data);
        // Update "refreshed" timestamp in header.
        const ts = new Date(msg.refreshedAt);
        const hh = String(ts.getHours()).padStart(2, '0');
        const mm = String(ts.getMinutes()).padStart(2, '0');
        const ss = String(ts.getSeconds()).padStart(2, '0');
        const el = document.getElementById('refreshed-at');
        if (el) el.textContent = hh + ':' + mm + ':' + ss;
      }
    });
  </script>
</body>
</html>`;
}
