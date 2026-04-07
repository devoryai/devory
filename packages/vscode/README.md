# Devory VS Code Extension

The Devory extension turns VS Code into a practical control surface for Devory.

It helps you initialize a workspace, manage tasks, inspect doctrine and skills, run Devory, and review outputs without leaving the editor.

## Why It Matters

Devory is not just a chat window for code generation. The extension exposes the actual workflow:

- task lifecycle
- doctrine and skill files
- first-run workspace bootstrap
- run execution and artifact inspection
- review actions for supervised delivery

## First Run

Open a repository, install the extension, and let Devory check whether the workspace is already initialized.

If it is not, the extension can scaffold it for you. That bootstrap flow works even without a global `devory` install.

## Main Commands

| Command | Description |
|---|---|
| `Devory: Initialize Workspace` | Create the Devory workspace structure |
| `Devory: Create Task` | Add a new task |
| `Devory: Promote Task` | Move work forward through the lifecycle |
| `Devory: Start Factory Run` | Execute Devory from the bundled runtime |
| `Devory: Open Review Queue` | Jump into review-ready work |
| `Devory: Inspect Artifacts` | Browse saved execution outputs |

## Workspace Shape

The extension works directly against the repo:

- `tasks/` for work
- `runs/` for run records
- `artifacts/` for durable execution output
- `doctrine/` and `skills/` for engineering guidance and reuse

