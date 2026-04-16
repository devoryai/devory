# Devory VS Code Extension

The Devory extension turns VS Code into a practical control surface for Devory.

It helps you initialize a workspace, manage tasks, inspect doctrine and skills,
run Devory, and review outputs without leaving the editor.

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
| `Devory: List Tasks` | Open a task picker grouped by lifecycle stage |
| `Devory: Create Task` | Add a new task |
| `Devory: Generate Tasks from Idea` | Open the Task Builder webview, turn one idea into previewable task drafts, then commit selected drafts to backlog |
| `Devory: Move Task` | Move a task directly to another stage |
| `Devory: Promote Task` | Move work forward through the lifecycle |
| `Devory: Open Review Queue` | Jump into review-ready work |
| `Devory: Approve Review Task` | Approve a review task |
| `Devory: Send Review Task Back` | Return review work for rework |
| `Devory: Block Review Task` | Move a review task to blocked |
| `Devory: Requeue Blocked Task` | Move a blocked task back into the queue |
| `Devory: Archive Task` | Archive a task outside the normal active lanes |
| `Devory: Enrich Task` | Add missing structured sections to the active task file |
| `Devory: Add Acceptance Criteria` | Insert that section only if absent |
| `Devory: Add Verification Steps` | Insert that section only if absent |
| `Devory: Add Dependencies` | Insert that section only if absent |
| `Devory: Add Files Likely Affected` | Insert that section only if absent |
| `Devory: Start Factory Run` | Execute Devory from the bundled runtime |
| `Devory: Resume Factory Run` | Resume a failed or paused run |
| `Devory: Pause or Resume Factory Run` | Request a pause, or resume from the same control point |
| `Devory: Stop Factory Run` | Request an orderly stop for the active run |
| `Devory: Show Work` | Open live execution visibility (run state, heartbeat, doing/review focus) |
| `Devory: Inspect Recent Runs` | Open recent run records from the editor |
| `Devory: Show Routing Outcome Summary` | Summarize recent routing outcome ledger records in the Devory output channel |
| `Devory: Inspect Artifacts` | Browse saved execution outputs |
| `Devory: Governance Doctor` | Check workspace and CLI/runtime readiness |
| `Devory: Connect Cloud Account` | Start the local cloud-account connection flow |
| `Devory: Create Doctrine File` | Create a new doctrine file |
| `Devory: Create Skill` | Scaffold a reusable skill |
| `Devory: Create Agent` | Scaffold a new agent definition |
| `Devory: Archive Doctrine File` | Move doctrine into archive storage |
| `Devory: Archive Skill` | Move an old skill into archive storage |
| `Devory: Show Governance Status` | Report governance readiness and transport status |
| `Devory: Show Stored Data Locations` | Explain extension-owned local data versus project data |
| `Devory: Sweep the Workshop` | Delete only extension-owned local data |
| `Devory: Refresh Task Explorer` | Refresh task and governance views |

## Runtime Notes

- `Devory: Start Factory Run` uses the packaged local runtime and shows an
  advisory dry-run/cost estimate summary before launch.
- Run start now profiles ready tasks, applies routing policy, resolves concrete
  targets and adapters, and preserves selected versus actual execution metadata
  in the routing outcome ledger.
- `Devory: Resume Factory Run` resumes an existing failed or paused run record.
- `Devory: Pause or Resume Factory Run` and `Devory: Stop Factory Run` write local run-control signals that the active runtime checks between steps.
- The extension exposes review and lifecycle commands directly, but those
  commands still operate against the repository state on disk.
- `Devory: Generate Tasks from Idea` uses deterministic generation first,
  previews all generated drafts before any save, then offers post-commit
  handoff actions.
- The Task Assistant can also run AI-assisted refinement against the active task,
  including local Ollama-backed refinement when that target is configured.
- `Devory: Show Work` is a visibility/control surface; it does not replace
  governance command execution by `devory worker`.

## Workspace Shape

The extension works directly against the repo:

- `tasks/` for work
- `runs/` for run records
- `artifacts/` for durable execution output
- `doctrine/` and `skills/` for engineering guidance and reuse

## Routing Outcome Review

- Ledger path: `artifacts/routing-outcomes/execution-outcomes.jsonl`
- Command: `Devory: Show Routing Outcome Summary`
- Truth model: selected provider/target/adapter and actual provider/target/adapter stay separate
- Cloud behavior: local-first by default; cloud-bound runs can require confirmation depending on routing policy
