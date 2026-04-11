# @devory/cli

The Devory CLI is the repo-first command surface for Devory.

Use it to initialize a workspace, manage tasks and skills, run Devory, inspect
configuration, operate governance mode, and prepare GitHub handoff artifacts.

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
| `devory skill new` | Scaffold a new skill directory and `SKILL.md` |
| `devory skill list` | List discovered skills |
| `devory skill validate` | Validate one skill or all skills |
| `devory run` | Execute Devory against ready work |
| `devory worker` | Run the long-lived worker loop for governance command polling |
| `devory artifacts` | Build or inspect the artifact index |
| `devory config` | Show resolved workspace and tier information |
| `devory license activate` | Write a workspace license token |
| `devory license clear` | Remove the local workspace license file and cache |
| `devory license status` | Show resolved tier, key source, and fallback reason |
| `devory pr-prep` | Generate branch, commit, and PR description material from a task |
| `devory pr-create` | Create a GitHub PR with explicit confirmation and token requirements |
| `devory improve` | Persist a live improvement signal artifact |
| `devory diagnostics` | Check self-hosted prerequisites such as workspace, license, and engine availability |
| `devory doctor` | Run the first-line local health check |
| `devory governance init` | Initialize a governance repository |
| `devory governance bind` | Bind a working repo to a governance repo |
| `devory governance status` | Show current governance binding status |
| `devory governance doctor` | Diagnose governance readiness and command transport state |
| `devory governance enqueue-local` | Queue a governance command into the local file fallback |
| `devory migrate` | Copy supported local Devory assets into the bound governance repo |

## Notes

- `devory run` is a one-shot orchestrator pass.
- `devory worker` is the runtime that polls and applies governance commands.
- The public CLI package does not currently expose the private cloud/session
  command family.

## Plans

User-facing plan names are `Core`, `Pro`, and `Teams`.
