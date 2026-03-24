# Devory

Open-source CLI, VS Code extension, and GitHub integration for the [Devory AI Dev Factory](https://devory.ai).

Devory is an AI-driven development factory — it manages tasks, orchestrates AI runs, tracks artifacts, and keeps your codebase healthy. This repo contains the open interface layer: the tools you use to interact with the factory.

## Packages

| Package | Description |
|---|---|
| [`packages/core`](packages/core) | Shared types, task frontmatter parsing, and path utilities |
| [`packages/cli`](packages/cli) | `devory` CLI — create tasks, run the factory, manage PRs |
| [`packages/github`](packages/github) | Branch naming, PR metadata helpers, GitHub Actions support |
| [`packages/vscode`](packages/vscode) | VS Code extension — task explorer, run management |

## VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=DevoryAI.devory-vscode).

Browse tasks, kick off factory runs, and inspect artifacts without leaving your editor. A **Devory Tasks** panel appears in the Explorer sidebar automatically when you open a factory workspace.

## CLI

```bash
npm install -g @devory/cli
```

| Command | Description |
|---|---|
| `devory task new` | Create a new task in the backlog |
| `devory task move` | Move a task through the lifecycle |
| `devory task validate` | Validate task frontmatter |
| `devory run` | Run the factory orchestrator |
| `devory worker` | Start the factory worker loop |
| `devory artifacts` | Build or inspect the run artifact index |
| `devory config` | Show factory configuration and health |
| `devory pr-prep` | Generate branch name, commit message, and PR description from a task |
| `devory pr-create` | Create a GitHub PR from a task (requires `GITHUB_TOKEN`) |
| `devory improve` | Compute a live improvement signal (drift, compliance, refactor, doctrine) |

## Getting Started

1. Sign up at [devory.ai](https://devory.ai) to get access to the factory.
2. Clone your factory workspace.
3. Install the VS Code extension or the CLI.
4. Open your workspace — the **Devory Tasks** panel will appear automatically.

## Requirements

- Node.js 18+
- VS Code 1.85+ (for the extension)

## Repository Structure

```
packages/
  core/       # Shared types and parsing — no external dependencies
  cli/        # devory CLI commands
  github/     # GitHub integration helpers
  vscode/     # VS Code extension
```

The factory engine (orchestrator, model routing, doctrine, planners) runs as a hosted service at [devory.ai](https://devory.ai). This repo is the open interface layer that talks to it.

## Contributing

Issues and PRs welcome. The packages in this repo are the public interface — if you hit a bug in the CLI, extension, or task parsing, this is the right place.
