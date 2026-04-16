/**
 * packages/vscode/src/commands/task-builder-webview.ts
 *
 * On-demand Task Builder webview panel.
 *
 * Opens a WebviewPanel (not a sidebar view) when the user invokes
 * devory.generateTasksFromIdea. The panel lets the user describe work in plain
 * English, preview generated task drafts as Devory-standard markdown, and save
 * them to backlog — all without leaving VS Code.
 *
 * Generation and commit logic are delegated to the same pure functions used by
 * the QuickPick-based flow:
 *   - buildDrafts()        from commands/task-generate-from-idea.ts
 *   - commitTaskDrafts()   from workers/lib/task-draft-commit.ts
 *   - renderTaskDraftTarget() from @devory/core (preview rendering)
 *
 * State (current drafts) lives in the extension host, not the webview, so the
 * webview only needs to send a "save" signal — no draft data round-trips.
 */

import * as nodePath from "node:path";
import * as vscode from "vscode";
import { renderTaskDraftTarget } from "@devory/core";
import type { TaskPlanningDraft } from "@devory/core";
import { buildDrafts } from "./task-generate-from-idea.js";
import { commitTaskDrafts } from "../../../../workers/lib/task-draft-commit.js";

// ── Singleton panel reference ─────────────────────────────────────────────────

let currentPanel: vscode.WebviewPanel | undefined;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Opens the Task Builder panel, or reveals it if already open.
 *
 * @param factoryRoot  Absolute path to the Devory factory root (task files live here).
 * @param onTasksSaved Called after tasks are successfully committed, so callers
 *                     can refresh tree views or run post-commit flows.
 */
export function openTaskBuilderPanel(
  factoryRoot: string,
  onTasksSaved: (committed: Array<{ draft_id: string; task_id: string; target_path: string; target_stage: string }>) => void
): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    "devory.taskBuilder",
    "Devory: Task Builder",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Draft state lives here in the extension host.
  let currentDrafts: TaskPlanningDraft[] = [];

  currentPanel.webview.html = buildHtml();

  currentPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    switch (msg.type) {
      case "ready": {
        const projectDefault = nodePath.basename(factoryRoot.trim()) || "project";
        void currentPanel!.webview.postMessage({
          type: "projectDefault",
          project: projectDefault,
        } satisfies ExtensionMessage);
        break;
      }

      case "generate": {
        try {
          let drafts = buildDrafts(
            msg.description.trim(),
            msg.project.trim(),
            msg.splitIntoSmaller
          );

          // Post-process: strip optional sections if user deselected them.
          if (!msg.includeAcceptanceCriteria) {
            drafts = drafts.map((d) => ({ ...d, acceptance_criteria: [] }));
          }
          if (!msg.includeVerification) {
            drafts = drafts.map((d) => ({ ...d, verification: [] }));
          }

          currentDrafts = drafts;

          const previews = drafts.map((draft) => ({
            title: draft.title,
            markdown: renderPreviewMarkdown(draft),
          }));

          void currentPanel!.webview.postMessage({
            type: "generated",
            previews,
          } satisfies ExtensionMessage);
        } catch (err) {
          void currentPanel!.webview.postMessage({
            type: "error",
            message: `Generation failed — ${err instanceof Error ? err.message : String(err)}`,
          } satisfies ExtensionMessage);
        }
        break;
      }

      case "save": {
        if (currentDrafts.length === 0) {
          void currentPanel!.webview.postMessage({
            type: "error",
            message: "Nothing to save — generate tasks first.",
          } satisfies ExtensionMessage);
          break;
        }

        const result = commitTaskDrafts(currentDrafts, { factoryRoot });

        if (!result.ok) {
          const detail =
            result.issues.length > 0
              ? `: ${result.issues.map((i) => i.errors[0]).join("; ")}`
              : "";
          void currentPanel!.webview.postMessage({
            type: "error",
            message: `Save failed — ${result.error}${detail}`,
          } satisfies ExtensionMessage);
          break;
        }

        const savedDrafts = [...currentDrafts];
        currentDrafts = [];

        const taskIds = result.committed.map((c) => c.task_id);
        void currentPanel!.webview.postMessage({
          type: "saved",
          taskIds,
        } satisfies ExtensionMessage);

        onTasksSaved(result.committed);
        void vscode.window.showInformationMessage(
          `Devory: ${result.committed.length} task${result.committed.length !== 1 ? "s" : ""} added to backlog — ${taskIds.join(", ")}`
        );

        // Suppress unused variable warning — savedDrafts used for future extension.
        void savedDrafts;
        break;
      }
    }
  });

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    currentDrafts = [];
  });
}

// ── Message types ─────────────────────────────────────────────────────────────

type WebviewMessage =
  | { type: "ready" }
  | {
      type: "generate";
      description: string;
      project: string;
      splitIntoSmaller: boolean;
      includeAcceptanceCriteria: boolean;
      includeVerification: boolean;
    }
  | { type: "save" };

type ExtensionMessage =
  | { type: "projectDefault"; project: string }
  | { type: "generated"; previews: Array<{ title: string; markdown: string }> }
  | { type: "saved"; taskIds: string[] }
  | { type: "error"; message: string };

// ── Preview rendering ─────────────────────────────────────────────────────────

function renderPreviewMarkdown(draft: TaskPlanningDraft): string {
  // Strip inferred_fields before rendering (same pattern as task-draft-commit.ts).
  const { inferred_fields: _inf, ...persistable } = draft as TaskPlanningDraft & {
    inferred_fields?: unknown;
  };
  const taskId = persistable.draft_id;
  const result = renderTaskDraftTarget({
    ...persistable,
    status: "backlog",
    commit: {
      ...persistable.commit,
      state: "ready_to_commit",
      target_stage: "backlog",
      target_path: null,
      committed_task_id: taskId,
    },
  });
  return result.markdown;
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 24px 28px;
      max-width: 860px;
    }

    h1 {
      font-size: 1.1em;
      font-weight: 700;
      margin: 0 0 4px;
      color: var(--vscode-editor-foreground);
    }
    .subtitle {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 22px;
      line-height: 1.5;
    }

    .form-group {
      margin-bottom: 16px;
    }
    label.field-label {
      display: block;
      font-size: 0.82em;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    textarea, input[type="text"] {
      width: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.18));
      border-radius: 3px;
      padding: 8px 10px;
      outline: none;
      line-height: 1.5;
    }
    textarea {
      resize: vertical;
      min-height: 100px;
    }
    textarea:focus, input[type="text"]:focus {
      border-color: var(--vscode-focusBorder, var(--vscode-button-background));
    }

    .options {
      margin-bottom: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .options label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.88em;
      cursor: pointer;
    }
    input[type="checkbox"] {
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    .btn-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    button {
      padding: 6px 14px;
      font-family: var(--vscode-font-family);
      font-size: 0.88em;
      border-radius: 3px;
      cursor: pointer;
      border: 1px solid transparent;
      line-height: 1.4;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-border, transparent);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-color: var(--vscode-widget-border, rgba(255,255,255,0.15));
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.18));
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      margin: 22px 0;
    }

    .preview-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 12px;
    }
    .section-label {
      font-size: 0.82em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .task-count {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
    }

    .preview-block {
      margin-bottom: 16px;
    }
    .preview-title {
      font-size: 0.82em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    pre.markdown-preview {
      margin: 0;
      padding: 12px 14px;
      background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.82em;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 320px;
      overflow-y: auto;
      color: var(--vscode-editor-foreground);
    }

    .status-bar {
      margin-top: 14px;
      font-size: 0.82em;
      line-height: 1.5;
      min-height: 1.5em;
    }
    .status-success {
      color: var(--vscode-testing-iconPassed, #4caf50);
    }
    .status-error {
      color: var(--vscode-errorForeground, #f44747);
    }
    .status-info {
      color: var(--vscode-descriptionForeground);
    }

    #preview-section { display: none; }
  </style>
</head>
<body>
  <h1>Task Builder</h1>
  <div class="subtitle">Describe work in plain English. Generate Devory-standard task drafts, preview them, and save to backlog.</div>

  <div class="form-group">
    <label class="field-label" for="description">Describe the work</label>
    <textarea
      id="description"
      rows="5"
      placeholder="e.g. Add JWT authentication to the API endpoints, including middleware, token validation, and refresh logic."
    ></textarea>
  </div>

  <div class="form-group">
    <label class="field-label" for="project">Project</label>
    <input type="text" id="project" placeholder="my-project">
  </div>

  <div class="options">
    <label>
      <input type="checkbox" id="split">
      Split into smaller tasks
    </label>
    <label>
      <input type="checkbox" id="acceptance-criteria" checked>
      Include acceptance criteria
    </label>
    <label>
      <input type="checkbox" id="verification" checked>
      Include verification
    </label>
  </div>

  <div class="btn-row">
    <button class="btn-primary" id="generate-btn">Generate</button>
  </div>

  <div id="status-generate" class="status-bar"></div>

  <div id="preview-section">
    <hr class="divider">

    <div class="preview-header">
      <span class="section-label">Preview</span>
      <span class="task-count" id="task-count"></span>
    </div>

    <div id="preview-blocks"></div>

    <div class="btn-row" style="margin-top: 16px;">
      <button class="btn-primary" id="save-btn">Save to Backlog</button>
      <button class="btn-secondary" id="copy-btn">Copy Markdown</button>
      <button class="btn-secondary" id="clear-btn">Clear</button>
    </div>

    <div id="status-save" class="status-bar"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentPreviews = [];

    // ── Helpers ──────────────────────────────────────────────────────────────

    function setStatus(id, text, kind) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'status-bar' + (kind ? ' status-' + kind : '');
    }

    function escHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderPreviews(previews) {
      const container = document.getElementById('preview-blocks');
      container.innerHTML = '';
      for (let i = 0; i < previews.length; i++) {
        const p = previews[i];
        const block = document.createElement('div');
        block.className = 'preview-block';
        if (previews.length > 1) {
          const title = document.createElement('div');
          title.className = 'preview-title';
          title.textContent = (i + 1) + '. ' + p.title;
          block.appendChild(title);
        }
        const pre = document.createElement('pre');
        pre.className = 'markdown-preview';
        pre.textContent = p.markdown;
        block.appendChild(pre);
        container.appendChild(block);
      }
      const count = document.getElementById('task-count');
      count.textContent = previews.length === 1
        ? '1 task'
        : previews.length + ' tasks';
    }

    function showPreviewSection() {
      document.getElementById('preview-section').style.display = 'block';
    }

    function hidePreviewSection() {
      document.getElementById('preview-section').style.display = 'none';
    }

    function setSaveButtonsEnabled(enabled) {
      document.getElementById('save-btn').disabled = !enabled;
      document.getElementById('copy-btn').disabled = !enabled;
    }

    // ── Generate ─────────────────────────────────────────────────────────────

    function generate() {
      const description = document.getElementById('description').value.trim();
      const project = document.getElementById('project').value.trim();

      if (description.length < 5) {
        setStatus('status-generate', 'Please describe the work in more detail.', 'error');
        return;
      }
      if (!project) {
        setStatus('status-generate', 'Project name is required.', 'error');
        return;
      }

      setStatus('status-generate', 'Generating…', 'info');
      document.getElementById('generate-btn').disabled = true;

      vscode.postMessage({
        type: 'generate',
        description,
        project,
        splitIntoSmaller: document.getElementById('split').checked,
        includeAcceptanceCriteria: document.getElementById('acceptance-criteria').checked,
        includeVerification: document.getElementById('verification').checked,
      });
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    function save() {
      setStatus('status-save', 'Saving…', 'info');
      document.getElementById('save-btn').disabled = true;
      vscode.postMessage({ type: 'save' });
    }

    // ── Copy ─────────────────────────────────────────────────────────────────

    function copyMarkdown() {
      if (currentPreviews.length === 0) return;
      const text = currentPreviews
        .map((p) => p.markdown)
        .join('\\n\\n---\\n\\n');
      navigator.clipboard.writeText(text).then(() => {
        setStatus('status-save', 'Markdown copied to clipboard.', 'success');
      }).catch(() => {
        setStatus('status-save', 'Clipboard write failed — select and copy manually from the preview.', 'error');
      });
    }

    // ── Clear ─────────────────────────────────────────────────────────────────

    function clearForm() {
      currentPreviews = [];
      hidePreviewSection();
      document.getElementById('preview-blocks').innerHTML = '';
      setStatus('status-generate', '', '');
      setStatus('status-save', '', '');
      document.getElementById('generate-btn').disabled = false;
      setSaveButtonsEnabled(true);
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    document.getElementById('generate-btn').addEventListener('click', generate);
    document.getElementById('save-btn').addEventListener('click', save);
    document.getElementById('copy-btn').addEventListener('click', copyMarkdown);
    document.getElementById('clear-btn').addEventListener('click', clearForm);

    document.getElementById('description').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        generate();
      }
    });

    // ── Messages from extension host ──────────────────────────────────────────

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'projectDefault': {
          const input = document.getElementById('project');
          if (!input.value) {
            input.value = msg.project;
          }
          break;
        }

        case 'generated': {
          currentPreviews = msg.previews;
          renderPreviews(msg.previews);
          showPreviewSection();
          setSaveButtonsEnabled(true);
          setStatus('status-generate', '', '');
          setStatus('status-save', '', '');
          document.getElementById('generate-btn').disabled = false;
          break;
        }

        case 'saved': {
          const ids = msg.taskIds.join(', ');
          const count = msg.taskIds.length;
          setStatus(
            'status-save',
            count === 1
              ? 'Saved 1 task to backlog: ' + ids
              : 'Saved ' + count + ' tasks to backlog: ' + ids,
            'success'
          );
          setSaveButtonsEnabled(false);
          break;
        }

        case 'error': {
          // Error could relate to either generate or save phase.
          // Show in generate status if no preview is visible, save status otherwise.
          const previewVisible = document.getElementById('preview-section').style.display !== 'none';
          setStatus(previewVisible ? 'status-save' : 'status-generate', msg.message, 'error');
          document.getElementById('generate-btn').disabled = false;
          document.getElementById('save-btn').disabled = false;
          break;
        }
      }
    });

    // Signal ready so the extension host can send the project default.
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
