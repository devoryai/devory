# Devory Public Packages

This repository contains the public tooling layer for Devory: the CLI, VS Code
extension, shared core utilities, and GitHub helpers.

Devory is an AI-assisted engineering system, not just a code generator. These packages help you run that workflow locally, inside your repository, with tasks, doctrine, artifacts, and review controls.

## Included Packages

| Package | Purpose |
|---|---|
| [`packages/core`](packages/core) | Shared task, doctrine, licensing, and workspace utilities |
| [`packages/cli`](packages/cli) | `devory` command line interface |
| [`packages/github`](packages/github) | Branch naming, PR metadata, and guarded GitHub helpers |
| [`packages/vscode`](packages/vscode) | VS Code extension for task, run, doctrine, and artifact workflows |

## Day-One Setup

You do not need a global CLI install to get started.

Choose one:

1. Install the VS Code extension and let it initialize the workspace on first run.
2. Run `npx @devory/cli init` in a repository.

From there:

1. Create a task.
2. Move it to `ready`.
3. Run Devory.
4. Review the result and artifacts.

## Current Workflow Features

- Generate Tasks from Idea (VS Code): deterministic task decomposition from a
  short intent, preview-before-save, explicit commit to backlog.
- Task refinement:
  - deterministic enrichment commands (acceptance criteria, verification,
    dependencies, files likely affected)
  - AI-assisted refinement in the Task Assistant panel
- Post-commit handoff (VS Code generation flow): run first task, reveal in
  explorer, or open Show Work.
- Show Work (VS Code): run-state and heartbeat visibility for active work.
- Governance mode: CLI and web governance surfaces for command submission and
  worker-applied outcomes.
- Dry Run / Cost Estimate (VS Code run start): advisory estimate shown before
  execution; estimate does not block run start.

## Current Public Command Surfaces

The public repository currently exposes:

- CLI workspace commands: `setup`, `init`, `task`, `skill`, `run`, `worker`,
  `artifacts`, `config`, `license`, `cloud`, `doctor`, `diagnostics`
- CLI governance commands: `governance init`, `governance bind`,
  `governance status`, `governance doctor`, `governance enqueue-local`,
  `migrate`
- CLI GitHub handoff commands: `pr-prep`, `pr-create`
- VS Code commands for task lifecycle, task enrichment, review actions, run
  start/pause/stop/resume, task generation from idea, show-work visibility,
  artifact inspection, governance status, cloud connection, and local data
  transparency

## Platform Truths

- CLI:
  - source of truth for shell-invokable automation (`run`, `worker`,
    governance commands, PR prep/create)
- VS Code:
  - strongest local operator surface for generation, refinement, run control,
    post-commit handoff, and Show Work visibility
- Web:
  - governance command and coordination surface; does not replace local runtime
  - queued governance commands are applied by `devory worker`

## Plans

Devory uses `Core`, `Pro`, and `Teams` as product plan language.

- `Core`: local repo-first workflow and BYOK model usage
- `Pro`: paid individual capabilities and advanced doctrine support
- `Teams`: seats, roles, and shared governance
