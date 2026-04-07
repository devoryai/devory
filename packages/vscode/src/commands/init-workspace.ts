import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { findDevoryCli } from "../lib/find-devory-cli.js";
import { seedStarterFiles } from "../lib/seed-starter.js";

// ---------------------------------------------------------------------------
// Built-in init — mirrors `devory init` without requiring the CLI binary.
// Used as a fallback when the CLI is not installed.
// ---------------------------------------------------------------------------

const TASK_STAGES = ["backlog", "ready", "doing", "review", "done", "blocked", "archived"];

const STANDARDS_TEMPLATE = `# devory.standards.yml
#
# Define what "good" means for your codebase.
# The Devory factory uses these standards as guardrails on every run.

version: "1"

stack:
  language: typescript        # e.g. typescript, javascript, python, go

doctrine:
  testing:
    require_unit: true
    require_integration: true
    coverage_threshold: 80
    avoid_mocking:
      - database
      - filesystem

  architecture:
    max_file_lines: 300
    no_circular_deps: true

  code_style:
    no_any: true
    prefer_explicit_over_clever: true
`;

const TASK_TEMPLATE = `---
id: TASK-ID
title: Short descriptive title
project: your-project-name
repo: .
branch: task/TASK-ID-short-slug
type: feature
priority: medium
status: backlog
agent: fullstack-builder
depends_on: []
files_likely_affected: []
verification:
  - npm run build
  - npm run test
---

## Goal

Describe the business outcome in plain English.

## Context

Relevant background, constraints, and assumptions.

## Acceptance Criteria

- Criterion 1 — specific, verifiable outcome

## Failure Conditions

- build fails
- tests fail
- acceptance criteria not fully met
`;

const FACTORY_CONTEXT = `# Factory Context

## Purpose

This file defines the context every AI worker loads before performing work in this Devory workspace.

## Required behavior

All work must:
- follow the standards defined in devory.standards.yml
- aim for the thinnest valuable slice
- include tests where practical
- avoid unrelated scope changes
- remain safe, reviewable, and reversible

## Task lifecycle

Tasks move through: backlog → ready → doing → review → done
Support stages: blocked, archived
`;

/**
 * Runs workspace initialization directly, without requiring the devory CLI binary.
 * Creates the standard directory structure and writes template files.
 * Safe to call on an already-initialized workspace — existing files are not overwritten.
 *
 * Exported for unit testing.
 */
export function runBuiltinInit(
  dir: string,
  output: vscode.OutputChannel
): void {
  function ensureDir(p: string): void {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      output.appendLine(`  created  ${path.relative(dir, p)}/`);
    } else {
      output.appendLine(`  exists   ${path.relative(dir, p)}/`);
    }
  }

  function writeFile(p: string, content: string): void {
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, content, "utf8");
      output.appendLine(`  created  ${path.relative(dir, p)}`);
    } else {
      output.appendLine(`  skipped  ${path.relative(dir, p)} (already exists)`);
    }
  }

  for (const stage of TASK_STAGES) {
    ensureDir(path.join(dir, "tasks", stage));
  }
  ensureDir(path.join(dir, "runs"));
  ensureDir(path.join(dir, "artifacts"));
  ensureDir(path.join(dir, "doctrine"));
  ensureDir(path.join(dir, "templates"));

  writeFile(path.join(dir, "FACTORY_CONTEXT.md"), FACTORY_CONTEXT);
  writeFile(path.join(dir, "templates", "task-template.md"), TASK_TEMPLATE);
  writeFile(path.join(dir, "devory.standards.yml"), STANDARDS_TEMPLATE);

  const readmePath = path.join(dir, "README.md");
  if (!fs.existsSync(readmePath)) {
    writeFile(readmePath, "# Devory Workspace\n\nManaged by [Devory](https://devory.ai).\n");
  } else {
    output.appendLine(`  skipped  README.md (already exists)`);
  }
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function initWorkspaceCommand(
  outputChannel: vscode.OutputChannel,
  refreshTaskTree: () => void,
  refreshRunTree: () => void,
  runtimeRoot?: string
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "Devory: No workspace folder is open. Please open a folder first."
    );
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;

  outputChannel.show(true);
  outputChannel.appendLine("─".repeat(60));
  outputChannel.appendLine("Devory: Initializing workspace…");
  outputChannel.appendLine(`  cwd : ${cwd}`);

  // Try to find the devory CLI — local node_modules, monorepo walk-up, then PATH.
  let cliBin: string | null = null;
  try {
    cliBin = await findDevoryCli(cwd);
    outputChannel.appendLine(`  bin : ${cliBin} (CLI found)`);
  } catch {
    outputChannel.appendLine(
      "  bin : not found — local node_modules/.bin/devory not present, " +
        "no global devory on PATH; using built-in init"
    );
  }

  outputChannel.appendLine("─".repeat(60));

  if (cliBin) {
    // Use the CLI binary (existing behavior).
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cliBin!, ["init"], {
        cwd,
        shell: false,
        env: { ...process.env },
      });

      child.stdout.on("data", (chunk: Buffer) => {
        outputChannel.append(chunk.toString());
      });

      child.stderr.on("data", (chunk: Buffer) => {
        outputChannel.append(chunk.toString());
      });

      child.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          vscode.window.showErrorMessage(
            `Devory: CLI binary not executable at ${cliBin}. ` +
              "Try reinstalling with `npm install -g @devory/cli`."
          );
        } else {
          vscode.window.showErrorMessage(`Devory: init failed — ${err.message}`);
        }
        reject(err);
      });

      child.on("close", (code) => {
        if (code === 0) {
          outputChannel.appendLine("─".repeat(60));
          outputChannel.appendLine("Devory: Workspace initialized successfully.");
          resolve();
        } else {
          outputChannel.appendLine("─".repeat(60));
          outputChannel.appendLine(`Devory: init exited with code ${code}.`);
          vscode.window.showErrorMessage(
            `Devory: init exited with code ${code}. Check the Devory output channel for details.`
          );
          reject(new Error(`devory init exited with code ${code}`));
        }
      });
    })
      .then(() => finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree))
      .catch(() => {
        // Errors already surfaced via showErrorMessage above.
      });
  } else {
    // Built-in init: no CLI required.
    try {
      runBuiltinInit(cwd, outputChannel);
      outputChannel.appendLine("─".repeat(60));
      outputChannel.appendLine("Devory: Workspace initialized successfully (built-in).");
      finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`ERROR: ${msg}`);
      outputChannel.appendLine("─".repeat(60));
      vscode.window.showErrorMessage(`Devory: init failed — ${msg}`);
    }
  }
}

function finalize(
  cwd: string,
  runtimeRoot: string | undefined,
  outputChannel: vscode.OutputChannel,
  refreshTaskTree: () => void,
  refreshRunTree: () => void
): void {
  let seededSummary:
    | {
        doctrine: string[];
        skills: string[];
      }
    | null = null;
  if (runtimeRoot) {
    seededSummary = seedStarterFiles(cwd, runtimeRoot, outputChannel);
  }
  refreshTaskTree();
  refreshRunTree();
  const seededSuffix =
    seededSummary && (seededSummary.doctrine.length > 0 || seededSummary.skills.length > 0)
      ? ` Starter doctrine: ${seededSummary.doctrine.slice(0, 2).join(", ")}. Starter skills: ${seededSummary.skills.slice(0, 2).join(", ")}. Open Devory: Factory to inspect them.`
      : "";
  vscode.window.showInformationMessage(
    `Devory: Workspace initialized. Tasks and run folders are ready.${seededSuffix}`
  );
}
