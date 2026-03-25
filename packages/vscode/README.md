# Devory — VS Code Extension

Task and run management for [Devory](https://devory.ai) — browse tasks, kick off factory runs, and inspect artifacts without leaving your editor.

## Features

### Task Explorer
A tree view in the Explorer sidebar shows all your Devory tasks organized by status (backlog, in-progress, done). Click any task to open it.

### Commands

| Command | Description |
|---|---|
| **Devory: List Tasks** | Quick-pick all tasks in the factory |
| **Devory: Create Task** | Create a new task via a guided prompt |
| **Devory: Move Task** | Change a task's status (backlog → in-progress → done) |
| **Devory: Start Factory Run** | Kick off a new AI factory run |
| **Devory: Inspect Recent Runs** | Browse recent run logs |
| **Devory: Inspect Artifacts** | Explore generated artifacts |
| **Devory: Refresh Task Explorer** | Reload the task tree |

Access all commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type `Devory`.

## Requirements

- A Devory workspace — sign up at [devory.ai](https://devory.ai)
- Node.js 18+

## Configuration

| Setting | Default | Description |
|---|---|---|
| `devory.factoryRoot` | *(auto-detect)* | Absolute path to your Devory workspace root. Leave blank to auto-detect from your workspace. |

## Getting Started

1. Open your Devory workspace in VS Code.
2. Install this extension.
3. The **Devory Tasks** panel will appear in the Explorer sidebar automatically.

If the panel shows no tasks, set `devory.factoryRoot` in your VS Code settings to the absolute path of your workspace root.
