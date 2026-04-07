/**
 * packages/cli/src/commands/init.ts
 *
 * `devory init` — scaffold a new Devory workspace.
 *
 * Creates the standard directory structure, FACTORY_CONTEXT.md,
 * task template, and README so developers can start immediately
 * without any tribal knowledge about workspace layout.
 *
 * Safe to run in an existing workspace — existing files are never
 * overwritten. Use --force to reinitialize (still preserves files).
 */

import * as fs from "fs";
import * as path from "path";

export const NAME = "init";
export const USAGE = "devory init [--dir <path>] [--force]";

export interface InitArgs {
  dir: string;
  force: boolean;
}

export function parseArgs(
  argv: string[]
): { args: InitArgs; error: null } {
  let dir = process.cwd();
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") {
      force = true;
    } else if (argv[i] === "--dir" && i + 1 < argv.length) {
      dir = path.resolve(argv[++i]);
    }
  }

  return { args: { dir, force }, error: null };
}

const TASK_STAGES = ["backlog", "ready", "doing", "review", "done", "blocked", "archived"];

const STANDARDS_TEMPLATE = `# devory.standards.yml
#
# Define what "good" means for your codebase.
# The Devory factory uses these standards as guardrails on every run.
#
# Run \`devory improve --type compliance\` to check your codebase against these rules.
# Custom rules require a Pro or Teams license — see https://devory.ai/pricing

version: "1"

stack:
  language: typescript        # e.g. typescript, javascript, python, go
  # framework: nextjs         # e.g. nextjs, express, fastapi, rails
  # database: postgres        # e.g. postgres, mysql, sqlite, mongodb

doctrine:
  # extends: "@devory/defaults/typescript-nextjs"  # Uncomment to inherit a Devory baseline

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
    # pattern: feature-slices

  code_style:
    no_any: true
    prefer_explicit_over_clever: true

  # custom_rules:             # Pro/Teams only
  #   - "All API routes must validate input at the boundary"
  #   - "No direct imports from workers layer in app layer"
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

Describe the business outcome in plain English. What problem does this solve and why does it matter? One to three sentences.

## Context

Relevant background, constraints, and assumptions the agent needs to know. Include links to related tasks, PRs, or decisions. If this depends on something not yet built, say so here.

## Acceptance Criteria

- Criterion 1 — specific, verifiable outcome
- Criterion 2 — another specific outcome
- Criterion 3 — add as many as needed

## Expected Artifacts

- List files that will be created or modified
- Note any migrations, config changes, or docs required

## Failure Conditions

- What would cause this task to be rejected?
- build fails
- tests fail
- acceptance criteria not fully met

## Reviewer Checklist

- [ ] All acceptance criteria satisfied
- [ ] No unintended scope changes
- [ ] Build and test output clean
- [ ] Code is readable and reviewable
`;

const FACTORY_CONTEXT = `# Factory Context

## Purpose

This file defines the context every AI worker loads before performing work in this Devory workspace.

## Doctrine

Doctrine files define the engineering rules every run must follow.
The worker loads files listed below automatically — edit this list as your project grows.

Always load these:

- doctrine/engineering-principles.md
- doctrine/testing-standard.md
- doctrine/workflow-rules.md
- doctrine/code-style.md

Load when relevant:

(add conditional doctrine files here)

## Skills

Skills are reusable procedure modules for specific kinds of work.
Activate them from task frontmatter with a \`skills:\` declaration, for example:

  skills: [test-generation]

Starter skills included with this workspace:
- skills/test-generation/SKILL.md    — write or extend tests for a module
- skills/nextjs-component/SKILL.md   — create or refactor a Next.js component

Skills live at \`skills/<name>/SKILL.md\` and are loaded after doctrine on every run that requests them.

## Standards

This workspace uses \`devory.standards.yml\` to define engineering guardrails.
Run \`devory improve --type compliance\` to check your codebase against your standards.

## Required behavior

All work must:
- follow the standards defined in devory.standards.yml
- aim for the thinnest valuable slice
- include tests where practical
- avoid unrelated scope changes
- remain safe, reviewable, and reversible

## Task lifecycle

Tasks move through: backlog → ready → doing → review → done

- \`devory task new\`      — create a task
- \`devory task move\`     — advance a task through the lifecycle
- \`devory task validate\` — check task format
- \`devory run\`           — run the factory orchestrator
`;

const README = `# Devory Workspace

This workspace is managed by [Devory](https://devory.ai).

## Structure

\`\`\`
tasks/               Task files organized by lifecycle stage
  backlog/           Not yet started
  ready/             Approved and ready to run
  doing/             Currently in progress
  review/            Awaiting review
  done/              Completed
  blocked/           Blocked on something external
runs/                Factory run logs and outputs
artifacts/           Generated artifacts from runs
templates/           Task file templates
FACTORY_CONTEXT.md   Worker context and doctrine
\`\`\`

## Getting Started

\`\`\`bash
# Create a task
devory task new --id my-001 --title "My first task" --project my-project

# Check workspace health
devory config

# Run the factory
devory run
\`\`\`

## Learn More

- [Devory documentation](https://devory.ai/docs)
- [VS Code extension](https://marketplace.visualstudio.com/items?itemName=DevoryAI.devory-vscode)
`;

export function run(args: InitArgs): number {
  const { dir, force } = args;
  const alreadyInit =
    fs.existsSync(path.join(dir, "FACTORY_CONTEXT.md")) ||
    fs.existsSync(path.join(dir, "tasks"));

  if (alreadyInit && !force) {
    console.error(
      `devory: workspace already exists at ${dir}\n` +
      `Run with --force to reinitialize (existing files will not be overwritten).`
    );
    return 1;
  }

  if (alreadyInit) {
    console.log(`Reinitializing Devory workspace at ${dir} (existing files preserved)...`);
  } else {
    console.log(`Initializing Devory workspace at ${dir}...`);
  }

  let created = 0;
  let skipped = 0;

  function ensureDir(p: string): void {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      console.log(`  created  ${path.relative(dir, p)}/`);
      created++;
    } else {
      skipped++;
    }
  }

  function writeFile(p: string, content: string): void {
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, content, "utf8");
      console.log(`  created  ${path.relative(dir, p)}`);
      created++;
    } else {
      console.log(`  skipped  ${path.relative(dir, p)} (already exists)`);
      skipped++;
    }
  }

  // Task lifecycle directories
  for (const stage of TASK_STAGES) {
    ensureDir(path.join(dir, "tasks", stage));
  }

  // Support directories
  ensureDir(path.join(dir, "runs"));
  ensureDir(path.join(dir, "artifacts"));
  ensureDir(path.join(dir, "brain"));
  ensureDir(path.join(dir, "templates"));

  // Core files
  writeFile(path.join(dir, "FACTORY_CONTEXT.md"), FACTORY_CONTEXT);
  writeFile(path.join(dir, "templates", "task-template.md"), TASK_TEMPLATE);
  writeFile(path.join(dir, "devory.standards.yml"), STANDARDS_TEMPLATE);

  // README only if one doesn't exist
  const readmePath = path.join(dir, "README.md");
  if (!fs.existsSync(readmePath)) {
    writeFile(readmePath, README);
  } else {
    console.log(`  skipped  README.md (already exists)`);
    skipped++;
  }

  console.log(
    `\n${created} item(s) created, ${skipped} skipped.\n` +
    `\nNext steps:\n` +
    `  devory config                    — verify workspace health\n` +
    `  devory task new --id <id> ...    — create your first task`
  );

  return 0;
}
