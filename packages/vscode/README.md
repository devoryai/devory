# Devory — VS Code Extension

Task and run management for [Devory](https://devory.ai) — browse tasks, manage Factory content, kick off factory runs, and inspect artifacts without leaving your editor.

## Features

### Task Explorer
A tree view in the Explorer sidebar shows all your Devory tasks organized by lifecycle stage. The tree exposes stage-aware actions for promotion, review decisions, archiving, and blocked or archived task restore flows.

### Factory Explorer
A second tree view shows active doctrine files and skills. You can create new doctrine or skills directly from the pane and archive items you no longer want active.

### Commands

| Command | Description |
|---|---|
| **Devory: List Tasks** | Quick-pick all tasks in the factory |
| **Devory: Create Task** | Create a new task via a guided prompt |
| **Devory: Move Task** | Change a task's status |
| **Devory: Promote Task** | Promote `backlog -> ready`, `ready -> doing`, or `doing -> review` |
| **Devory: Open Review Queue** | Jump into the current review lane |
| **Devory: Approve Review Task** | Approve a review task and move it to `done` |
| **Devory: Send Review Task Back** | Send a review task back to `doing` |
| **Devory: Block Review Task** | Block a review task with a required reason |
| **Devory: Requeue Blocked Task** | Move a blocked task back to `ready` |
| **Devory: Archive Task** | Move an active task to `archived` |
| **Devory: Create Doctrine File** | Create a doctrine markdown file inside `doctrine/` |
| **Devory: Create Skill** | Scaffold `skills/<name>/SKILL.md` |
| **Devory: Archive Doctrine File** | Move a doctrine file into `doctrine/archive/` |
| **Devory: Archive Skill** | Move a skill into `skills/archive/` |
| **Devory: Start Factory Run** | Kick off a new AI factory run |
| **Devory: Resume Factory Run** | Resume a failed or paused run |
| **Devory: Inspect Recent Runs** | Browse recent run logs |
| **Devory: Inspect Artifacts** | Explore generated artifacts |
| **Devory: Refresh Task Explorer** | Reload the task and factory trees |

## Requirements

- A Devory workspace with `tasks/`, `runs/`, and `artifacts/` folders
- Node.js 18+
- For packaged `.vsix` installs: no workspace-local runtime is required for task management or run start

## Configuration

| Setting | Default | Description |
|---|---|---|
| `devory.factoryRoot` | *(auto-detect)* | Absolute path to your Devory workspace root. Leave blank to auto-detect from your workspace. |

## Getting Started

1. Open your Devory workspace in VS Code or Cursor.
2. Install this extension.
3. Use **Devory: Initialize Workspace** if the workspace has not been scaffolded yet.

## Runtime Notes

- Task creation and task movement run in-process through the shared workspace APIs bundled with the extension.
- Factory runs execute through the runtime bundled inside the extension at `runtime/`.
- The package step validates that the generated `.vsix` actually contains the bundled runtime before treating it as release-ready.
