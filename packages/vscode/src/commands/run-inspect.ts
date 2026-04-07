/**
 * packages/vscode/src/commands/run-inspect.ts
 *
 * devory.runInspect — show recent runs in a QuickPick, then open a structured
 * webview panel for the selected run.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { listRuns } from "../lib/run-reader.js";
import { readAgentContextSummary, type AgentContextSummary } from "../lib/agent-context-reader.js";
import type { RunRecord } from "@devory/core";

export async function runInspectCommand(runsDir: string, artifactsDir?: string): Promise<void> {
  if (!runsDir) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const runs = listRuns(runsDir).slice(0, 20);

  if (runs.length === 0) {
    vscode.window.showInformationMessage("Devory: no run records found.");
    return;
  }

  const items: vscode.QuickPickItem[] = runs.map((run) => ({
    label: run.run_id,
    description: `[${run.status}]  ${run.tasks_executed?.length ?? 0} task(s)`,
    detail: `started: ${run.start_time ?? "unknown"}  ended: ${run.end_time ?? "in progress"}`,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "Devory: Recent Factory Runs",
    placeHolder: "Select a run to inspect",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked) return;

  const run = runs.find((r) => r.run_id === picked.label);
  if (!run) return;

  const contexts: (AgentContextSummary | null)[] = (run.tasks_executed ?? []).map((t) =>
    artifactsDir ? readAgentContextSummary(artifactsDir, t.task_id) : null
  );

  const panel = vscode.window.createWebviewPanel(
    "devoryRunInspect",
    `Run: ${run.run_id}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = buildRunWebviewHtml(run, contexts, runsDir, artifactsDir);

  panel.webview.onDidReceiveMessage((msg: { type: string; path?: string }) => {
    if (msg.type === "openFolder" && msg.path) {
      vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(msg.path));
    }
    if (msg.type === "openFile" && msg.path) {
      vscode.workspace.openTextDocument(msg.path).then((doc) =>
        vscode.window.showTextDocument(doc)
      );
    }
  });
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(status: string): string {
  const color =
    status === "completed"
      ? "var(--vscode-testing-iconPassed, #4ec9b0)"
      : status === "failed"
        ? "var(--vscode-testing-iconFailed, #f48771)"
        : status === "paused_for_review"
          ? "var(--vscode-testing-iconQueued, #cca700)"
          : "var(--vscode-descriptionForeground)";
  return `<span style="color:${color};font-weight:600">${esc(status)}</span>`;
}

function buildRunWebviewHtml(
  run: RunRecord,
  contexts: (AgentContextSummary | null)[],
  runsDir: string,
  artifactsDir?: string
): string {
  // --- aggregate model ---
  const models = [...new Set(contexts.flatMap((c) => (c?.model ? [c.model] : [])))];
  const modelDisplay = models.length === 0 ? "—" : models.join(", ");

  // --- aggregate doctrine ---
  const doctrineFiles = new Set<string>();
  for (const ctx of contexts) {
    if (!ctx) continue;
    for (const f of ctx.doctrineAlwaysLoaded) doctrineFiles.add(path.basename(f));
    for (const c of ctx.doctrineConditionallyLoaded) {
      if (c.included) doctrineFiles.add(path.basename(c.file));
    }
    if (ctx.productDoctrine) doctrineFiles.add(path.basename(ctx.productDoctrine));
  }

  // --- aggregate skills ---
  const skills = new Set<string>();
  for (const ctx of contexts) {
    if (!ctx) continue;
    for (const s of ctx.skillsLoaded) skills.add(s);
  }

  // --- run log path ---
  const runLogPath = path.join(runsDir, `${run.run_id}.json`);
  const runLogExists = fs.existsSync(runLogPath);

  // --- artifact execution dir ---
  const executionDir = artifactsDir ? path.join(artifactsDir, "execution") : null;
  const executionDirExists = executionDir ? fs.existsSync(executionDir) : false;

  // --- tasks table rows ---
  const taskRows = (run.tasks_executed ?? [])
    .map((t) => {
      const ctx = contexts.find((c) => c?.taskId === t.task_id) ?? null;
      const modelCell = ctx?.model ? esc(ctx.model) : esc(t.model_id ?? "—");
      const taskArtifactDir = artifactsDir
        ? path.join(artifactsDir, "execution", t.task_id)
        : null;
      const hasArtifacts = taskArtifactDir ? fs.existsSync(taskArtifactDir) : false;
      const artifactLink = hasArtifacts
        ? `<a href="#" class="link" onclick="openFolder('${esc(taskArtifactDir!)}');return false">artifacts</a>`
        : "";
      return `<tr>
        <td><code>${esc(t.task_id)}</code></td>
        <td>${statusBadge(t.outcome)}</td>
        <td>${esc(t.engine ?? "—")}</td>
        <td>${modelCell}</td>
        <td>${artifactLink}</td>
      </tr>`;
    })
    .join("\n");

  // --- doctrine list items ---
  const doctrineItems =
    doctrineFiles.size > 0
      ? [...doctrineFiles].map((f) => `<li>${esc(f)}</li>`).join("\n")
      : `<li class="muted">No doctrine files recorded</li>`;

  // --- skills list items ---
  const skillItems =
    skills.size > 0
      ? [...skills].map((s) => `<li>${esc(s)}</li>`).join("\n")
      : `<li class="muted">No skills recorded</li>`;

  // --- links section ---
  const linksHtml = [
    executionDirExists
      ? `<a href="#" class="link-button" onclick="openFolder('${esc(executionDir!)}');return false">Open Artifact Folder</a>`
      : `<span class="link-button disabled">Open Artifact Folder</span>`,
    runLogExists
      ? `<a href="#" class="link-button" onclick="openFile('${esc(runLogPath)}');return false">Open Run Log</a>`
      : `<span class="link-button disabled">Open Run Log</span>`,
  ].join("\n");

  // --- failure block ---
  const failureHtml = run.failure
    ? `<section>
        <h2>Failure</h2>
        <table>
          <tr><td>Task</td><td><code>${esc(run.failure.task_id)}</code></td></tr>
          <tr><td>Reason</td><td>${esc(run.failure.reason)}</td></tr>
          <tr><td>At</td><td>${esc(run.failure.timestamp ?? "")}</td></tr>
        </table>
      </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 32px;
      max-width: 900px;
    }
    h1 {
      font-size: 1.3em;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--vscode-editor-foreground);
    }
    h2 {
      font-size: 1em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin: 28px 0 8px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      padding-bottom: 4px;
    }
    section { margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; }
    td {
      padding: 4px 10px 4px 0;
      vertical-align: top;
      color: var(--vscode-editor-foreground);
    }
    td:first-child {
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      width: 140px;
    }
    th {
      text-align: left;
      padding: 4px 10px 4px 0;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.06));
      padding: 1px 5px;
      border-radius: 3px;
    }
    ul {
      margin: 4px 0;
      padding-left: 20px;
    }
    li { padding: 2px 0; }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
    .link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .link:hover { text-decoration: underline; }
    .link-button {
      display: inline-block;
      margin-right: 10px;
      padding: 5px 12px;
      border-radius: 3px;
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      text-decoration: none;
      cursor: pointer;
      font-size: 0.9em;
      border: 1px solid var(--vscode-widget-border, #555);
    }
    .link-button:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.18)); }
    .link-button.disabled {
      opacity: 0.4;
      cursor: default;
    }
    .tasks-table td:first-child { width: auto; }
  </style>
</head>
<body>
  <h1>Run: <code>${esc(run.run_id)}</code></h1>

  <section>
    <h2>Run Summary</h2>
    <table>
      <tr><td>Run ID</td><td><code>${esc(run.run_id)}</code></td></tr>
      <tr><td>Status</td><td>${statusBadge(run.status)}</td></tr>
      <tr><td>Model</td><td>${esc(modelDisplay)}</td></tr>
      <tr><td>Start</td><td>${esc(run.start_time ?? "(unknown)")}</td></tr>
      <tr><td>End</td><td>${esc(run.end_time ?? "(in progress)")}</td></tr>
    </table>
  </section>

  <section>
    <h2>Doctrine Applied</h2>
    <ul>${doctrineItems}</ul>
  </section>

  <section>
    <h2>Skills Used</h2>
    <ul>${skillItems}</ul>
  </section>

  <section>
    <h2>Execution Info</h2>
    <p style="margin:4px 0 10px;color:var(--vscode-descriptionForeground)">
      ${run.tasks_executed?.length ?? 0} task(s) executed
      of ${run.task_queue?.length ?? 0} queued
    </p>
    ${
      (run.tasks_executed?.length ?? 0) > 0
        ? `<table class="tasks-table">
        <thead>
          <tr>
            <th>Task</th><th>Outcome</th><th>Engine</th><th>Model</th><th>Artifacts</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>`
        : `<p class="muted">No tasks executed.</p>`
    }
  </section>

  ${failureHtml}

  <section>
    <h2>Links</h2>
    <div style="margin-top:8px">${linksHtml}</div>
  </section>

  <script>
    const vscode = acquireVsCodeApi();
    function openFolder(p) { vscode.postMessage({ type: 'openFolder', path: p }); }
    function openFile(p)   { vscode.postMessage({ type: 'openFile',   path: p }); }
  </script>
</body>
</html>`;
}
