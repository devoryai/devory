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
import { describeRoutingTruthState } from "../lib/routing-ux-labels.js";

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

type WebviewMessage =
  | { type: "invokeCommand"; command: string };

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
  const routingTruthState = data.routingTruth
    ? describeRoutingTruthState(data.routingTruth)
    : null;
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
    routingTruth: data.routingTruth
      ? {
          runId: data.routingTruth.runId,
          taskIds: data.routingTruth.taskIds,
          selectedRoute: data.routingTruth.selectedRoute,
          actualRoute: data.routingTruth.actualRoute,
          status: data.routingTruth.status,
          reason: data.routingTruth.reason,
          fallbackTaken: data.routingTruth.fallbackTaken,
          decompositionRecommended: data.routingTruth.decompositionRecommended,
          recordedAgo: formatRelativeTime(data.routingTruth.recordedAt),
          stateLabel: routingTruthState?.label ?? null,
          stateDetail: routingTruthState?.detail ?? null,
        }
      : null,
    providerReadiness: data.providerReadiness.map((entry) => ({
      label: entry.label,
      supportLevel: entry.supportLevel,
      configured: entry.configured,
      reachable: entry.reachable,
      routeable: entry.routeable,
      summary: entry.summary,
    })),
    lastRunSummary: data.lastRunSummary
      ? {
          taskCount: data.lastRunSummary.taskCount,
          primaryProvider: data.lastRunSummary.primaryProvider,
          result: data.lastRunSummary.result,
          fallbackOccurred: data.lastRunSummary.fallbackOccurred,
          recordedAgo: data.lastRunSummary.recordedAt
            ? formatRelativeTime(data.lastRunSummary.recordedAt)
            : null,
        }
      : null,
    failureSummary: data.failureSummary,
    recentActivity: data.recentActivity.map((item) => ({
      label: item.label,
      detail: item.detail,
      recordedAgo: item.recordedAt ? formatRelativeTime(item.recordedAt) : null,
    })),
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
      padding: 10px 14px 14px;
      margin: 0;
    }
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
      margin-bottom: 14px;
    }
    .section-label {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 7px;
    }
    .card {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 8px;
      padding: 10px 11px;
    }
    .status-hero {
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
    }
    .status-hero.idle {
      background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 82%, var(--vscode-descriptionForeground, #999) 8%);
    }
    .status-hero.running {
      background: color-mix(in srgb, var(--vscode-terminal-ansiBlue, #569cd6) 13%, transparent);
      border-color: color-mix(in srgb, var(--vscode-terminal-ansiBlue, #569cd6) 35%, transparent);
    }
    .status-hero.completed {
      background: color-mix(in srgb, var(--vscode-terminal-ansiGreen, #4ec9b0) 13%, transparent);
      border-color: color-mix(in srgb, var(--vscode-terminal-ansiGreen, #4ec9b0) 34%, transparent);
    }
    .status-hero.failed {
      background: color-mix(in srgb, var(--vscode-terminal-ansiRed, #f44747) 13%, transparent);
      border-color: color-mix(in srgb, var(--vscode-terminal-ansiRed, #f44747) 34%, transparent);
    }
    .status-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 7px;
    }
    .status-icon {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 0.95em;
      font-weight: 700;
      border: 1px solid currentColor;
    }
    .status-icon.running::before {
      content: '';
      width: 9px;
      height: 9px;
      border-radius: 999px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      animation: spin 0.85s linear infinite;
    }
    .status-icon.idle::before { content: '○'; }
    .status-icon.completed::before { content: '✓'; }
    .status-icon.failed::before { content: '!'; }
    .status-copy {
      min-width: 0;
      flex: 1;
    }
    .status-title {
      font-size: 0.95em;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 2px;
    }
    .status-line {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
    .status-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 3px 7px;
      font-size: 0.74em;
      line-height: 1.2;
      background: rgba(255,255,255,0.06);
      color: var(--vscode-descriptionForeground);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .summary-list {
      display: grid;
      gap: 6px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 0.8em;
      line-height: 1.45;
    }
    .summary-row strong {
      color: var(--vscode-editor-foreground);
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }
    .summary-row span {
      color: var(--vscode-descriptionForeground);
      min-width: 56px;
    }
    .failure-card {
      border-radius: 8px;
      padding: 10px 11px;
      margin-bottom: 12px;
      background: color-mix(in srgb, var(--vscode-terminal-ansiRed, #f44747) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiRed, #f44747) 34%, transparent);
    }
    .failure-title {
      font-size: 0.84em;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .failure-reason {
      font-size: 0.82em;
      line-height: 1.45;
      margin-bottom: 8px;
    }
    .failure-list {
      display: grid;
      gap: 6px;
      font-size: 0.78em;
      line-height: 1.45;
      color: var(--vscode-descriptionForeground);
    }
    .failure-item strong {
      color: var(--vscode-editor-foreground);
      font-weight: 600;
      margin-right: 5px;
    }
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
    .attention-strip {
      border-left: 2px solid var(--vscode-terminal-ansiYellow, #dcdcaa);
      padding-left: 8px;
    }
    .provider-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .provider-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 0;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    }
    .provider-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .provider-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8em;
      font-weight: 600;
    }
    .provider-summary {
      font-size: 0.76em;
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
    }
    .provider-state {
      font-size: 0.76em;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }
    .secondary-shell {
      padding-top: 2px;
    }
    .activity-card {
      padding: 9px 11px;
    }
    .activity-list {
      display: grid;
      gap: 8px;
    }
    .activity-item {
      display: grid;
      gap: 3px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    }
    .activity-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .activity-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 0.74em;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .activity-detail {
      font-size: 0.8em;
      line-height: 1.45;
    }
    .actions {
      display: flex;
      gap: 5px;
      margin-top: 9px;
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
      margin: 14px 0 10px;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
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
    function getStatePresentation(runState, data) {
      const taskCount = data.lastRunSummary && Number.isFinite(data.lastRunSummary.taskCount)
        ? data.lastRunSummary.taskCount
        : (data.doingTasks ? data.doingTasks.length : 0);

      if (runState === 'running' || runState === 'paused') {
        const paused = runState === 'paused';
        return {
          state: 'running',
          title: 'Running',
          line: paused
            ? 'Running — paused at a safe checkpoint'
            : 'Running — executing ' + Math.max(taskCount, 1) + ' task' + (Math.max(taskCount, 1) === 1 ? '' : 's'),
        };
      }

      if (data.routingTruth && (data.routingTruth.status === 'failed' || data.routingTruth.status === 'blocked' || data.routingTruth.status === 'cancelled')) {
        return {
          state: 'failed',
          title: 'Failed',
          line: 'Failed — execution stopped',
        };
      }

      if (data.routingTruth && data.routingTruth.status === 'completed') {
        return {
          state: 'completed',
          title: 'Completed',
          line: 'Completed — ' + taskCount + ' task' + (taskCount === 1 ? '' : 's') + ' processed',
        };
      }

      return {
        state: 'idle',
        title: 'Idle',
        line: 'Idle — no active run',
      };
    }

    function buildStatusHero(runState, data) {
      const state = getStatePresentation(runState, data);
      const meta = [];

      if (data.heartbeat && data.heartbeat.currentTaskId) {
        meta.push('<span class="meta-pill">Task ' + esc(data.heartbeat.currentTaskId) + '</span>');
      }
      if (data.heartbeat && data.heartbeat.currentAdapter) {
        meta.push('<span class="meta-pill">Using ' + esc(data.heartbeat.currentAdapter) + '</span>');
      }
      if (data.heartbeat && data.heartbeat.lastHeartbeatAgo) {
        meta.push('<span class="meta-pill">Updated ' + esc(data.heartbeat.lastHeartbeatAgo) + '</span>');
      } else if (data.lastRunSummary && data.lastRunSummary.recordedAgo) {
        meta.push('<span class="meta-pill">Last run ' + esc(data.lastRunSummary.recordedAgo) + '</span>');
      }
      if (data.heartbeat && data.heartbeat.suspicionFlags && data.heartbeat.suspicionFlags.length > 0) {
        meta.push('<span class="meta-pill">Attention ' + esc(data.heartbeat.suspicionFlags.join(', ')) + '</span>');
      }

      const detail = data.heartbeat && data.heartbeat.recentEventSummary
        ? data.heartbeat.recentEventSummary
        : data.failureSummary && data.failureSummary.reason
          ? data.failureSummary.reason
          : data.routingTruth && data.routingTruth.stateDetail
            ? data.routingTruth.stateDetail
            : '';

      return '<div class="status-hero ' + state.state + '">' +
        '<div class="status-top">' +
          '<span class="status-icon ' + state.state + '"></span>' +
          '<div class="status-copy">' +
            '<div class="status-title">' + esc(state.title) + '</div>' +
            '<div class="status-line">' + esc(state.line) + '</div>' +
          '</div>' +
        '</div>' +
        (detail ? '<div class="status-line">' + esc(detail) + '</div>' : '') +
        (meta.length > 0 ? '<div class="status-meta">' + meta.join('') + '</div>' : '') +
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
        '</div>';
    }

    function buildFailureCard(failureSummary) {
      if (!failureSummary) return '';

      return '<div class="failure-card">' +
        '<div class="failure-title">What went wrong</div>' +
        '<div class="failure-reason">' + esc(failureSummary.reason) + '</div>' +
        '<div class="failure-list">' +
          (failureSummary.attempted
            ? '<div class="failure-item"><strong>Attempted</strong>' + esc(failureSummary.attempted) + '</div>'
            : '') +
          '<div class="failure-item"><strong>Failed</strong>' + esc(failureSummary.failedAt) + '</div>' +
          '<div class="failure-item"><strong>Fallback</strong>' + esc(failureSummary.fallback) + '</div>' +
        '</div>' +
      '</div>';
    }

    function buildLastRunCard(lastRunSummary) {
      if (!lastRunSummary) return '';

      return '<div class="card">' +
        '<div class="section-label">Last Run</div>' +
        '<div class="summary-list">' +
          '<div class="summary-row"><span>Tasks</span><strong>' + esc(String(lastRunSummary.taskCount)) + '</strong></div>' +
          '<div class="summary-row"><span>Provider</span><strong>' + esc(lastRunSummary.primaryProvider) + '</strong></div>' +
          '<div class="summary-row"><span>Result</span><strong>' + esc(lastRunSummary.result) + '</strong></div>' +
          '<div class="summary-row"><span>Fallback</span><strong>' + esc(lastRunSummary.fallbackOccurred ? 'Yes' : 'No') + '</strong></div>' +
        '</div>' +
      '</div>';
    }

    function buildRouteSummaryCard(routingTruth) {
      if (!routingTruth) return '';

      const actual = routingTruth.actualRoute
        ? routingTruth.selectedRoute && routingTruth.actualRoute === routingTruth.selectedRoute
          ? 'same as selected'
          : routingTruth.actualRoute
        : 'not available';
      const taskRef = routingTruth.taskIds && routingTruth.taskIds.length > 0
        ? routingTruth.taskIds.join(', ')
        : 'latest routed work';

      return '<div class="card">' +
        '<div class="section-label">Run Path</div>' +
        '<div class="summary-list">' +
          '<div class="summary-row"><span>Tasks</span><strong>' + esc(taskRef) + '</strong></div>' +
          (routingTruth.selectedRoute
            ? '<div class="summary-row"><span>Selected</span><strong>' + esc(routingTruth.selectedRoute) + '</strong></div>'
            : '') +
          '<div class="summary-row"><span>Actual</span><strong>' + esc(actual) + '</strong></div>' +
          '<div class="summary-row"><span>Status</span><strong>' + esc(routingTruth.stateLabel || routingTruth.status || 'recorded') + '</strong></div>' +
        '</div>' +
      '</div>';
    }

    function buildProviderReadinessCard(providerReadiness) {
      if (!providerReadiness || providerReadiness.length === 0) return '';

      const highlighted = providerReadiness.filter((provider) =>
        !provider.routeable ||
        !provider.configured ||
        provider.reachable !== 'reachable'
      );
      const visible = (highlighted.length > 0 ? highlighted : providerReadiness.slice(0, 3));

      const rows = visible.map((provider) => {
        const status = !provider.configured
          ? 'not configured'
          : provider.routeable
            ? provider.reachable === 'reachable' ? 'configured' : 'check setup'
            : provider.summary.toLowerCase().includes('model')
              ? 'model issue'
              : 'degraded';
        return '<div class="provider-row">' +
          '<div class="provider-title"><span>' + esc(provider.label) + '</span><span class="provider-state">' + esc(status) + '</span></div>' +
          '<div class="provider-summary">' + esc(provider.summary) + '</div>' +
          '</div>';
      }).join('');

      return '<div class="section">' +
        '<div class="section-label">Provider Readiness</div>' +
        '<div class="card"><div class="provider-list">' + rows + '</div></div>' +
        '</div>';
    }

    function buildRecentActivityCard(recentActivity) {
      const rows = recentActivity && recentActivity.length > 0
        ? recentActivity.map((item) =>
            '<div class="activity-item">' +
              '<div class="activity-top"><span>' + esc(item.label) + '</span><span>' + esc(item.recordedAgo || 'just now') + '</span></div>' +
              '<div class="activity-detail">' + esc(item.detail) + '</div>' +
            '</div>'
          ).join('')
        : '<div class="activity-item"><div class="activity-detail">No recent execution activity yet.</div></div>';

      return '<div class="section secondary-shell">' +
        '<div class="section-label">Recent Activity</div>' +
        '<div class="card activity-card">' +
          '<div class="activity-list">' + rows + '</div>' +
          '<div class="actions">' +
            '<button class="btn-secondary" onclick="cmd(\'devory.runInspect\')">Inspect Recent Runs</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // ── Main render ─────────────────────────────────────────────────────────
    function render(runState, data) {
      const parts = [];

      parts.push(buildStatusHero(runState, data));
      parts.push(buildFailureCard(data.failureSummary));
      parts.push('<div class="grid">');
      parts.push(buildLastRunCard(data.lastRunSummary));
      parts.push(buildRouteSummaryCard(data.routingTruth));
      parts.push('</div>');
      parts.push(buildProviderReadinessCard(data.providerReadiness));

      if (data.doingTasks && data.doingTasks.length > 0) {
        parts.push('<div class="section">');
        parts.push('<div class="section-label">In Progress</div>');
        data.doingTasks.forEach(t => parts.push(buildTaskCard(t, false)));
        parts.push('</div>');
      }

      if (data.reviewTasks && data.reviewTasks.length > 0) {
        parts.push('<div class="section">');
        parts.push('<div class="section-label">Needs Attention</div>');
        data.reviewTasks.forEach(t => parts.push(buildTaskCard(t, true)));
        parts.push('</div>');
      }

      if (
        (!data.doingTasks || data.doingTasks.length === 0) &&
        (!data.reviewTasks || data.reviewTasks.length === 0)
      ) {
        const idleMsg = runState === 'running'
          ? 'Run is active — waiting for the first task to enter the doing stage.'
          : 'No tasks are currently in progress or awaiting review.';
        parts.push('<div class="empty">' + esc(idleMsg) + '</div>');
        parts.push(
          '<div class="actions" style="margin-top:0">' +
          '<button class="btn-secondary" onclick="cmd(\'devory.taskList\')">Open Tasks</button>' +
          '</div>'
        );
      }

      parts.push('<hr class="divider">');
      parts.push(buildRecentActivityCard(data.recentActivity));

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
