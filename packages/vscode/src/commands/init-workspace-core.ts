/**
 * packages/vscode/src/commands/init-workspace-core.ts
 *
 * Pure filesystem workspace initializer.
 * No vscode dependency — safe to import in Node unit tests.
 */

import * as fs from "fs";
import * as path from "path";

// ── Local interface ───────────────────────────────────────────────────────────

/** Minimal subset of vscode.OutputChannel required by runBuiltinInit. */
export interface OutputChannel {
  appendLine(value: string): void;
}

// ── Templates ─────────────────────────────────────────────────────────────────

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

This file defines the context every AI worker loads before performing work in this workspace.

## Doctrine

Doctrine files define the engineering rules every run must follow.
Load all top-level doctrine files by default except \`doctrine/product-philosophy.md\`.

Always load these:

- doctrine/engineering-principles.md
- doctrine/architecture-rules.md
- doctrine/testing-standard.md
- doctrine/workflow-rules.md
- doctrine/common-mistakes.md
- doctrine/code-style.md
- doctrine/task-writing-standard.md
- doctrine/prompt-guidelines.md
- doctrine/documentation-standard.md
- doctrine/database-standard.md
- doctrine/security-philosophy.md
- doctrine/data-analytics-formatting.md
- doctrine/git-workflow-standard.md

Load when relevant:

- doctrine/product-philosophy.md

## Skills

Skills are reusable procedure modules for specific kinds of work.
Activate them from task frontmatter with a \`skills:\` declaration, for example:

  skills: [test-generation]

Starter skills included with this workspace:
- skills/test-generation/SKILL.md    — write or extend tests for a module
- skills/nextjs-component/SKILL.md   — create or refactor a Next.js component

Skills live at \`skills/<name>/SKILL.md\` and are loaded after doctrine on every run that requests them.

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs workspace initialization directly, without requiring the devory CLI binary.
 * Creates the standard directory structure and writes template files.
 * Safe to call on an already-initialized workspace — existing files are not overwritten.
 *
 * Exported for unit testing.
 */
export function runBuiltinInit(
  dir: string,
  output: OutputChannel
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
