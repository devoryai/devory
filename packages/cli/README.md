# @devory/cli

The official CLI for [Devory](https://devory.ai) — create tasks, run the factory, manage PRs.

## Installation

```bash
npm install -g @devory/cli
```

## Commands

```
devory task new       Create a new task in the backlog
devory task move      Move a task through the lifecycle
devory task validate  Validate task frontmatter

devory run            Run the factory orchestrator
devory worker         Start the factory worker loop
devory artifacts      Build or inspect the run artifact index
devory config         Show factory configuration and health

devory pr-prep        Generate branch name, commit message, and PR description from a task
devory pr-create      Create a GitHub PR from a task (requires GITHUB_TOKEN)

devory improve        Compute a live improvement signal (drift|compliance|refactor|doctrine)
```

Run any command with `--help` for usage details.

## Requirements

- Node.js 18+
- A Devory factory workspace — sign up at [devory.ai](https://devory.ai)
