# @devory/cli

The Devory CLI is the repo-first command surface for Devory.

Use it to initialize a workspace, create and move tasks, run Devory, inspect configuration, and manage licenses.

## Install Or Run

Global install is supported:

```bash
npm install -g @devory/cli
```

But for most day-one workflows, running with `npx` is enough:

```bash
npx @devory/cli init
```

## What The CLI Is For

- initialize a Devory workspace
- create and validate tasks
- move tasks through the lifecycle
- execute runs
- inspect configuration and licensing
- prepare or create PRs from review-ready work

## Core Commands

| Command | Description |
|---|---|
| `devory init` | Create the Devory workspace structure in the current repo |
| `devory task new` | Create a backlog task |
| `devory task move` | Move a task between lifecycle stages |
| `devory task validate` | Validate task structure and required sections |
| `devory run` | Execute Devory against ready work |
| `devory config` | Show resolved workspace and tier information |
| `devory license` | Activate or inspect a paid license |

## Plans

User-facing plan names are `Core`, `Pro`, and `Teams`.
