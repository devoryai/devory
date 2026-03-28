# @devory/cli

The official CLI for [Devory](https://devory.ai) — initialize workspaces, create tasks, run the factory, manage licenses and PRs.

## Installation

```bash
npm install -g @devory/cli
```

## Commands

```
devory init           Initialize a new factory workspace

devory task new       Create a new task in the backlog
devory task move      Move a task through the lifecycle
devory task validate  Validate task frontmatter

devory run            Run the factory orchestrator
devory worker         Start the factory worker loop
devory artifacts      Build or inspect the run artifact index
devory config         Show factory configuration and tier
devory license        Activate, clear, or inspect local license state

devory pr-prep        Generate branch name, commit message, and PR description from a task
devory pr-create      Create a GitHub PR from a task (requires GITHUB_TOKEN)

devory improve        Compute a live improvement signal (drift|compliance|refactor|doctrine)
```

Run any command with `--help` for usage details.

## License Activation

```bash
devory license activate --key devory_pro_...
devory license status
devory license clear
```

Keys are issued from the [Devory dashboard](https://devory.ai/dashboard/license) when your subscription is active. Core tier works without a key — Pro and Teams features require one.

## Requirements

- Node.js 18+
- A Devory factory workspace — sign up at [devory.ai](https://devory.ai)
