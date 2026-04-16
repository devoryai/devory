# Devory Command Reference

This document is the technical command reference for the command surfaces that
are actually wired up in this repository today.

It is meant to answer three questions for an engineer:

1. What can I invoke right now?
2. What does it read or write?
3. Which runtime should I use for a given operation?

## Scope And Source Of Truth

This reference is based on the command registrations and dispatch paths in:

- `packages/cli/src/bin.ts`
- `packages/cli/src/registry.ts`
- `packages/vscode/src/extension.ts`
- `packages/vscode/package.json`
- `apps/devory/lib/commands.ts`

If a command is mentioned in an older doc but is not reachable through those
surfaces, it is intentionally not listed here as currently available.

## Runtime Model

Use the runtime that matches the job:

- `devory run`: one orchestrator pass. Good for a single local execution cycle.
- `devory worker`: long-running loop. Required for governance command polling.
- VS Code `Start Factory Run`: packaged editor wrapper around the local runner.
  The extension now prints a dry-run estimate (context/output tiers, token range,
  estimated cost range, confidence) before run start. This estimate is advisory
  and does not block execution. The same flow profiles ready tasks, applies the
  routing policy, resolves concrete targets and adapters, records selected vs
  actual execution metadata, and appends compact routing outcome records under
  `artifacts/routing-outcomes/`.
- Web command panel: submits governance commands; it does not execute them by
  itself. `devory worker` must still be running somewhere that can reach the
  workspace.

## CLI

### Workspace bootstrap and validation

#### `devory setup`

Usage:

```sh
devory setup [--governance-repo <path>] [--workspace-id <id>] [--enable-governance] [--migrate-tasks]
```

Purpose:

- Guided governance bootstrap for a working repo.
- Initializes or reuses a governance repo.
- Binds the working repo.
- Optionally enables the governance feature flag.
- Optionally migrates existing tasks during setup.
- Runs governance doctor at the end so the operator gets a readiness result, not
  just file creation.

Primary writes:

- `.devory/governance.json`
- `.devory/feature-flags.json`
- governance repo structure and initial commit when needed

#### `devory init`

Usage:

```sh
devory init [--dir <path>] [--force]
```

Purpose:

- Scaffolds a local Devory workspace.
- Creates the expected task lanes, doctrine, template files, and root context
  files.

Use this when you want repo-local Devory structure without setting up governance
  mode yet.

#### `devory doctor`

Usage:

```sh
devory doctor [--root <dir>]
```

Purpose:

- First-line local health check.
- Verifies workspace shape, standards, tasks, license state, and config
  resolution.

Use it when the workspace does not behave as expected before debugging deeper.

#### `devory diagnostics`

Usage:

```sh
devory diagnostics [--root <dir>]
```

Purpose:

- Self-hosted runtime prerequisite check.
- Focuses on execution prerequisites such as engine/runtime availability rather
  than workspace structure alone.

### Task lifecycle

#### `devory task new`

Usage:

```sh
devory task new --id <id> --title <title> --project <project> [--dry-run]
```

Purpose:

- Creates a backlog task skeleton with structured metadata and section headers.
- `--dry-run` previews the generated task without writing it.

Primary write:

- `tasks/backlog/<id>.md`

#### `devory task move`

Usage:

```sh
devory task move --task <file> --to <stage>
```

Purpose:

- Moves a task file between lifecycle lanes.
- Enforces the stage-based workflow instead of asking operators to rename files
  manually.

Typical stages:

- `backlog`
- `ready`
- `doing`
- `review`
- `blocked`
- `archived`
- `done`

#### `devory task validate`

Usage:

```sh
devory task validate [--file <file>] [--folder <folder>] [--root <dir>] [--status <status>] [--strict]
```

Purpose:

- Validates task structure, required frontmatter, and optionally lane/status
  expectations.
- Use `--file` for one task and `--folder` for a batch check.
- Use `--strict` when you want failures for looser-but-tolerated task shapes.

### Skills

#### `devory skill new`

Usage:

```sh
devory skill new <name> [--root <dir>]
```

Purpose:

- Scaffolds `skills/<name>/SKILL.md` from the template.

#### `devory skill list`

Usage:

```sh
devory skill list [--root <dir>]
```

Purpose:

- Enumerates discovered skills one per line.

#### `devory skill validate`

Usage:

```sh
devory skill validate <name> [--root <dir>]
devory skill validate --all [--root <dir>]
```

Purpose:

- Validates one skill or the entire skill directory for required structure.

### Execution and artifacts

#### `devory run`

Usage:

```sh
devory run [--limit <n>] [--resume] [--dry-run] [--validate]
```

Purpose:

- Runs one orchestrator pass.
- Does not stay up polling governance commands.

Behavior notes:

- `--validate` performs task validation before the run.
- `--dry-run` executes the orchestration path without committing to a real
  mutation flow.
- `--resume` resumes prior run state instead of starting fresh.

#### `devory worker`

Usage:

```sh
devory worker
```

Purpose:

- Long-running worker loop.
- Required for governance command polling and application.

If commands are submitted from the web app and nothing happens, this is the
first runtime to check.

#### `devory artifacts`

Usage:

```sh
devory artifacts
```

Purpose:

- Builds or inspects the artifact index used to browse run outputs.

#### `devory improve`

Usage:

```sh
devory improve --type <drift|compliance|refactor|doctrine>
```

Purpose:

- Computes one improvement signal and persists its artifact.

Use it when you want a concrete quality signal rather than a full task run.

### Configuration, licensing, cloud linkage, and sync

#### `devory config`

Usage:

```sh
devory config
```

Purpose:

- Prints resolved factory configuration and connection status.
- Useful for confirming how the workspace root and cloud/session state were
  resolved.

#### `devory license activate`

Usage:

```sh
devory license activate --key <token> [--root <dir>]
```

Purpose:

- Stores a workspace license token in `.devory/license`.

#### `devory license clear`

Usage:

```sh
devory license clear [--root <dir>]
```

Purpose:

- Removes the local workspace license file and verification cache.

#### `devory license status`

Usage:

```sh
devory license status [--root <dir>]
```

Purpose:

- Reports the resolved tier, key source, cache usage, and Core fallback reason.

#### `devory cloud status`

Usage:

```sh
devory cloud status [--root <dir>]
```

Purpose:

- Shows local cloud session/account status and workspace linkage.

#### `devory cloud login`

Usage:

```sh
devory cloud login [--root <dir>] [--session-file <file> | --session-json <json> | --access-token <token> --refresh-token <token>] [--workspace-id <id>]
```

Purpose:

- Imports an existing cloud session into the local workspace.

This command does not create the browser login flow itself. It materializes the
session locally after credentials are obtained.

#### `devory cloud link`

Usage:

```sh
devory cloud link --workspace-id <id> [--root <dir>]
```

Purpose:

- Binds the current local repo to a cloud workspace id.

#### `devory cloud logout`

Usage:

```sh
devory cloud logout [--root <dir>]
```

Purpose:

- Removes the local cloud session without deleting offline licensing state.

`devory cloud ...` handles authentication and workspace linkage. The separate
`devory sync ...` surface handles artifact and task synchronization once that
cloud connection exists.

#### `devory sync status`

Usage:

```sh
devory sync status
```

Purpose:

- Shows the current sync manifest between local artifacts and the linked cloud
  workspace.
- Reports local-only, cloud-only, local-newer, cloud-newer, and in-sync counts.

#### `devory sync push`

Usage:

```sh
devory sync push [--dry-run] [--force]
```

Purpose:

- Pushes local artifacts and task/config updates into the linked cloud
  workspace.
- `--dry-run` previews what would be pushed.
- `--force` allows overwriting conflicting cloud state with local state.

#### `devory sync pull`

Usage:

```sh
devory sync pull [--dry-run]
```

Purpose:

- Pulls cloud artifacts into the local workspace.
- `--dry-run` previews what would be pulled before writing files locally.

### Governance

#### `devory governance init`

Usage:

```sh
devory governance init [--dir <path>] [--workspace-id <id>] [--force] [--dry-run]
```

Purpose:

- Creates a governance repo on disk.
- Writes `.devory-governance/config.json`.
- Creates task lanes and governance storage directories.
- Initializes Git and creates the initial commit when needed.

#### `devory governance bind`

Usage:

```sh
devory governance bind --governance-repo <path> [--workspace-id <id>] [--working-repo <path>]
```

Purpose:

- Links a working repo to an existing governance repo.

Primary write:

- `.devory/governance.json`

#### `devory governance status`

Usage:

```sh
devory governance status
```

Purpose:

- Reports current binding state for the working repo.

#### `devory governance doctor`

Usage:

```sh
devory governance doctor [--working-repo <path>]
```

Purpose:

- Diagnoses governance mode readiness.
- Verifies feature flags, repo binding, governance repo structure, and command
  transport readiness.
- Reports whether cloud commands are `READY`, `LOCAL FALLBACK`, or `NOT READY`.

#### `devory governance enqueue-local`

Usage:

```sh
devory governance enqueue-local --type <command-type> [--payload <json> | --payload-file <path>] [--target-task-id <id>] [--target-run-id <id>] [--issued-by <user>] [--expires-in-minutes <n>] [--working-repo <path>]
```

Purpose:

- Writes a governance command into the local file-based queue fallback.
- Intended for local runtime testing when Supabase-backed command transport is
  unavailable.

Primary writes:

- `.devory/commands/pending/*.json`

### Migration and GitHub handoff

#### `devory migrate`

Usage:

```sh
devory migrate --to-governance-repo [--dry-run] [--confirm]
```

Purpose:

- Copies supported working-repo Devory assets into the bound governance repo.
- `--dry-run` previews planned copies.
- `--confirm` performs the copy and commit.

#### `devory pr-prep`

Usage:

```sh
devory pr-prep [<task-file>] [--dry-run]
```

Purpose:

- Derives branch name, commit message, and PR description from a review-ready
  task.
- Writes artifacts under `artifacts/execution/<task-id>/pr-prep/` unless
  `--dry-run` is used.

#### `devory pr-create`

Usage:

```sh
devory pr-create --task <file> --branch <name> [--base <branch>] [--confirm]
```

Purpose:

- Previews or creates a GitHub PR from a task file.

Safety gates:

- Requires `--confirm`.
- Requires `GITHUB_TOKEN`.
- Without both guards it prints a preview and exits cleanly.

## VS Code Commands

These are the currently registered editor commands exposed by the extension
package.

### Task workflow

- `Devory: List Tasks`
  Opens a stage-grouped task picker.
- `Devory: Create Task`
  Prompts for metadata and writes a backlog task.
- `Devory: Generate Tasks from Idea`
  Deterministically expands a short intent into one or more task drafts, shows a
  preview-before-save picker, and commits accepted drafts to `tasks/backlog/`.
  After commit, the extension offers post-commit handoff actions:
  `Run first task`, `Reveal in Task Explorer`, or `Open Show Work`.
- `Devory: Move Task`
  Explicit lifecycle move picker.
- `Devory: Promote Task`
  Stage-aware shortcut for the normal promotion path.
- `Devory: Open Review Queue`
  Focuses review-stage work quickly.
- `Devory: Approve Review Task`
  Applies the reviewed `approve` action.
- `Devory: Send Review Task Back`
  Applies the reviewed `send-back` action.
- `Devory: Block Review Task`
  Applies the reviewed `block` action.
- `Devory: Requeue Blocked Task`
  Moves a blocked task back to `ready`.
- `Devory: Archive Task`
  Moves a task into the archive lane.

### Task authoring helpers

- `Devory: Enrich Task`
  Appends any missing structured task sections to the active task file.
- `Devory: Add Acceptance Criteria`
  Inserts that section only if absent.
- `Devory: Add Verification Steps`
  Inserts that section only if absent.
- `Devory: Add Dependencies`
  Inserts `Depends On` only if absent.
- `Devory: Add Files Likely Affected`
  Inserts that section only if absent.
- `Devory: Open Task Assistant`
  Opens the task-side assistant webview for AI-assisted refinement and context
  checks while keeping edits explicit and operator-controlled.

These commands modify the open task file directly. They do not regenerate or
rewrite existing sections.

### Run control and inspection

- `Devory: Start Factory Run`
  Available in the VS Code Command Palette and task explorer title controls.
  It profiles ready tasks, computes routing decisions, applies the workspace
  routing policy, offers a manual execution preference override, binds to an
  actual target and adapter, and then starts the packaged local runner.
  Before spawn it prints a dry-run estimate and a compact routing summary.
  During this flow Devory records a compact routing outcome snapshot that
  preserves selected vs actual provider, target, and adapter data. If binding
  blocks execution because of readiness or policy, the outcome is still
  recorded truthfully as blocked rather than fabricated as a started run.
- `Devory: Resume Factory Run`
  Available in the VS Code Command Palette.
  It lists resumable runs from `runs/`, lets the operator choose one, and then
  invokes the bundled runner with `--resume <run-id>`.
- `Devory: Pause or Resume Factory Run`
  Available in the VS Code Command Palette and task explorer title controls
  while a run is active.
  It writes the local run-control request used by the packaged runner instead
  of inventing a parallel pause system inside the extension.
- `Devory: Stop Factory Run`
  Available in the VS Code Command Palette and task explorer title controls
  while a run is active.
  It requests a graceful stop through the run-control file and finalizes the
  routing outcome as cancelled when the runtime exits from that stop path.
- `Devory: Inspect Recent Runs`
  Opens recent run records and markdown renderings derived from `runs/`.
- `Devory: Show Routing Outcome Summary`
  Available in the VS Code Command Palette.
  It reads `artifacts/routing-outcomes/execution-outcomes.jsonl`, asks how many
  recent records to summarize, and prints a compact report to the Devory output
  channel. The report includes selected provider counts, actual provider
  counts, concrete target counts, fallback totals, blocked totals, result
  status breakdowns, and top fallback/block reasons. It does not build charts,
  mutate policy, or derive unsupported metrics.
- `Devory: Inspect Artifacts`
  Opens artifact files under `artifacts/`.
- `Devory: Show Work`
  Opens the operational visibility panel with live run state, heartbeat-derived
  status, active `doing` tasks, and review attention signals.

### Workspace and governance utilities

- `Devory: Initialize Workspace`
  First-run workspace bootstrap from inside the editor.
- `Devory: Governance Doctor`
  Runs both `devory doctor` and `devory governance doctor`, streaming output to
  an output channel.
- `Devory: Connect Cloud Account`
  Runs `devory cloud status`, then points the user to the browser sign-in flow.
- `Devory: Show Governance Status`
  Reads governance readiness and command transport status into an output view.
- `Devory: Refresh Task Explorer`
  Refreshes the task and governance explorer views.

### Factory content management

- `Devory: Create Doctrine File`
  Creates a new file in `doctrine/`.
- `Devory: Archive Doctrine File`
  Archives an existing doctrine file.
- `Devory: Create Skill`
  Scaffolds a new skill directory and `SKILL.md`.
- `Devory: Archive Skill`
  Archives a skill.
- `Devory: Create Agent`
  Scaffolds a new agent definition in `agents/`.

### Local storage transparency

- `Devory: Show Stored Data Locations`
  Lists extension-owned storage locations and explicitly distinguishes them from
  project data.
- `Devory: Sweep the Workshop`
  Deletes only extension-owned local data. It does not delete `tasks/`,
  `artifacts/`, `.devory/`, `.devory-governance/`, or any project files.

## Web Governance Commands

The web app does not expose shell commands directly. It issues governance
command envelopes that `devory worker` later consumes.

Important platform distinction:

- Web surfaces submit governance commands and expose review/control state.
- VS Code surfaces can generate/refine task content and start local runs.
- CLI remains the source of truth for shell-invokable commands and explicit
  automation flows.

Current governance command types:

- `pause-run`
- `resume-run`
- `requeue-task`
- `approve-task`
- `send-back-task`
- `block-task`
- `assign-reviewer`
- `override-model`
- `override-profile`

Validation is implemented in `apps/devory/lib/commands.ts`. Submission only
queues the command. Application happens later through the worker runtime and
results in receipts plus governance outcome artifacts.

## Legacy And Historical Docs

The following documentation remains useful for architecture context, but should
not be read as the authoritative current command surface:

- `docs/cloud-sync.md`
- older migration notes that mention `devory governance create --hosted`
- any doc that treats `devory sync` as the primary recommended workflow instead
  of a Pro/Teams cloud synchronization surface layered on top of `devory cloud`
  authentication and linkage

For current usage, prefer this reference plus the per-surface docs that now link
back to it.
