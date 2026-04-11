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

## Current Public Command Surfaces

The public repository currently exposes:

- CLI workspace commands: `init`, `task`, `skill`, `run`, `worker`,
  `artifacts`, `config`, `license`, `doctor`, `diagnostics`
- CLI governance commands: `governance init`, `governance bind`,
  `governance status`, `governance doctor`, `governance enqueue-local`,
  `migrate`
- CLI GitHub handoff commands: `pr-prep`, `pr-create`
- VS Code commands for task lifecycle, task enrichment, review actions, run
  start/resume, artifact inspection, governance status, and local data
  transparency

This public repo does not currently expose the private cloud/session command
family.

## Plans

Devory uses `Core`, `Pro`, and `Teams` as product plan language.

- `Core`: local repo-first workflow and BYOK model usage
- `Pro`: paid individual capabilities and advanced doctrine support
- `Teams`: seats, roles, and shared governance
