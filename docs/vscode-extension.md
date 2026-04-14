# Devory VS Code Extension (`devory-vscode`)

A VS Code extension for interacting with Devory from your editor.
Provides task management, run control, and artifact inspection through stable
shared interfaces (`@devory/core`, `@devory/cli`).

> Package name: `devory-vscode` (no `@` scope — required by vsce).

---

## Setup

### Prerequisites

- VS Code 1.85 or later
- Node.js 18+ for development, packaging, and local smoke tests
- A Devory workspace for the extension to point at

### Install — sideload via .vsix (recommended)

1. **Build and package** the extension from the factory root:
   ```sh
   npm run package --workspace packages/vscode
   ```
   This now builds the bundled runtime, copies it into the extension payload,
   packages the `.vsix`, and validates that the shipped artifact includes the
   runtime files needed for `Devory: Start Factory Run`.

2. **Install the .vsix in VS Code**:
   - Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run **"Extensions: Install from VSIX..."**
   - Select `packages/vscode/devory-vscode-0.4.6.vsix`

   Or from the terminal:
   ```sh
   code --install-extension packages/vscode/devory-vscode-0.4.6.vsix
   ```

3. **Reload VS Code** when prompted.

4. (Optional) **Set the factory root** in VS Code settings if auto-detection
   does not find the right path:
   ```json
   "devory.factoryRoot": "/absolute/path/to/your-repo"
   ```

### Install — development mode (no packaging)

To run the extension without building a `.vsix`:

1. Open `packages/vscode/` as a workspace root in VS Code.
2. Press `F5` (Run Extension) to launch an Extension Development Host.

---

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `devory.factoryRoot` | string | `""` | Absolute path to your Devory workspace root. Leave blank to auto-detect from the first workspace folder. |

---

## Capability Levels

The extension classifies the current workspace into one of four capability levels:

| Level | Detection | Supported flows |
|---|---|---|
| `none` | No recognizable Devory workspace structure | Commands fail with setup guidance |
| `read-only` | At least one readable Devory data folder exists | Browse what is present, inspect runs, inspect artifacts |
| `local-mutations` | A `tasks/` workspace is available | Browse, create, move, inspect runs, inspect artifacts |
| `full-run` | `tasks/` is available and the installed extension includes its bundled runtime | All extension flows, including `Devory: Start Factory Run` |

Run execution remains the only flow that depends on packaged runtime support, but
that runtime is now expected to ship with the extension itself rather than live
inside the workspace. The extension checks its installed `runtime/` payload
before offering `Devory: Start Factory Run`.

The recommended replacement for that temporary runtime path is documented in
[ADR 0003](./adr/0003-extension-run-execution-model.md): move run execution to a
packaged local runner that ships with Devory instead of invoking workspace-local
`tsx` scripts.

The build pipeline still stages that runner from the repository into a runtime
bundle, but shipped installs resolve the final entrypoint from the extension's
own `runtime/packages/runner/src/factory-run.js`.

---

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command | Description |
|---|---|
| **Devory: List Tasks** | Show all tasks grouped by lifecycle stage. Click to open the task file. |
| **Devory: Create Task** | Interactive prompt to create a new task skeleton in `tasks/backlog/`. |
| **Devory: Generate Tasks from Idea** | Deterministically generate one or more task drafts from a short idea, preview before save, then commit accepted drafts to backlog. |
| **Devory: Move Task** | Pick a task and a target stage; moves it through the shared workspace API exported by `@devory/cli`. |
| **Devory: Promote Task** | Promote `backlog -> ready`, `ready -> doing`, or `doing -> review` through the shared lifecycle helper. |
| **Devory: Open Review Queue** | Open a review task quickly from the editor. |
| **Devory: Approve Review Task** | Apply the audited `approve` review action to a review task. |
| **Devory: Send Review Task Back** | Apply the audited `send-back` review action and return the task to `doing`. |
| **Devory: Block Review Task** | Apply the audited `block` review action and move the task to `blocked`. |
| **Devory: Requeue Blocked Task** | Move a blocked task back to `ready` through the shared lifecycle helper. |
| **Devory: Archive Task** | Move a task into the archive lane through the shared lifecycle helper. |
| **Devory: Enrich Task** | Append all missing structured task sections to the active task file without rewriting existing content. |
| **Devory: Add Acceptance Criteria** | Insert the `Acceptance Criteria` section only if it is missing. |
| **Devory: Add Verification Steps** | Insert the `Verification` section only if it is missing. |
| **Devory: Add Dependencies** | Insert the `Depends On` section only if it is missing. |
| **Devory: Add Files Likely Affected** | Insert the `Files Likely Affected` section only if it is missing. |
| **Devory: Start Factory Run** | Run the factory orchestrator through the runtime bundled inside the installed extension. |
| **Devory: Resume Factory Run** | Resume a failed or paused run through the bundled runtime using `--resume <run-id>`. |
| **Devory: Pause or Resume Factory Run** | Toggle the active run controller without leaving the editor. |
| **Devory: Stop Factory Run** | Stop the active packaged runner from the editor. |
| **Devory: Show Work** | Open the live operational panel for run state, heartbeat, and doing/review attention. |
| **Devory: Inspect Recent Runs** | Browse the last 20 run records; select one to open a formatted markdown report. |
| **Devory: Show Routing Outcome Summary** | Summarize recent routing outcome ledger records from `artifacts/routing-outcomes/execution-outcomes.jsonl` in the Devory output channel. |
| **Devory: Inspect Artifacts** | Browse all run artifacts in `artifacts/`; select one to open it. |
| **Devory: Initialize Workspace** | Bootstrap a Devory workspace from inside VS Code. |
| **Devory: Factory Doctor** | Run `devory doctor` and `devory governance doctor`, streaming output to the extension output channel. |
| **Devory: Connect Cloud Account** | Show `devory cloud status` output and open the browser sign-in entrypoint when requested. |
| **Devory: Show Governance Status** | Print governance readiness, worker expectations, and command transport status. |
| **Devory: Create Doctrine File** | Create a new file inside `doctrine/`. |
| **Devory: Archive Doctrine File** | Archive an existing doctrine file from the factory explorer. |
| **Devory: Create Skill** | Scaffold a new skill directory and `SKILL.md`. |
| **Devory: Archive Skill** | Archive a skill from the factory explorer. |
| **Devory: Create Agent** | Scaffold a new agent definition in `agents/`. |
| **Devory: Show Stored Data Locations** | Explain which files are extension-owned local data versus project data. |
| **Devory: Sweep the Workshop** | Remove only extension-owned local data; project files and Devory workspace files are preserved. |
| **Devory: Refresh Task Explorer** | Refresh the Task Explorer sidebar view. |

For the full technical command surface, including side effects and runtime
distinctions, see [docs/command-reference.md](./command-reference.md).

---

## Task Explorer Sidebar

The **Devory Tasks** view appears in the Explorer sidebar. It shows all tasks
grouped by lifecycle stage:

```
▼ BACKLOG  (3)
     factory-001  My first task
     factory-002  Another task
▼ READY  (1)
     factory-010  Task ready to run
  DOING  (0)
  REVIEW  (0)
  BLOCKED  (0)
  DONE  (0)
```

Click any task to open the corresponding `.md` file. Click the refresh icon
(↺) to reload after external changes.

### Practical control surfaces

The extension now exposes high-value control actions in the places where they
make sense:

| Surface | Available actions |
|---|---|
| Command Palette | All Devory commands |
| Explorer view title | Refresh, create task, open review queue, resume run |
| Task tree context menu | Promote task, approve/send back/block review task, requeue blocked task |
| Editor title for task files | Promote, approve/send back/block, requeue, open review queue |

Task-tree and editor-title actions are stage-aware:

- `backlog`, `ready`, and `doing` tasks expose **Promote Task**
- `review` tasks expose **Approve Review Task**, **Send Review Task Back**, **Block Review Task**, and **Open Review Queue**
- `blocked` tasks expose **Requeue Blocked Task**

The same commands remain available from the Command Palette even when these
placements are not visible.

### How control actions map to the workflow

The extension does not mutate task files directly. The commands call the same
shared workflow helpers as the CLI and web app:

| Editor action | Shared mechanism | Result |
|---|---|---|
| Promote Task | `moveTask()` via `@devory/cli` | Standard lifecycle move with validation and transition audit |
| Approve / Send Back / Block | `applyReviewAction()` via `@devory/cli` | Audited review action, stage transition, review artifact |
| Requeue Blocked Task | `moveTask()` via `@devory/cli` | `blocked -> ready` with the normal transition rules |
| Resume Factory Run | Bundled runner with `--resume <run-id>` | Resumes a failed or paused run using the same orchestrator path as the web app |

Because these flows reuse shared helpers, unsupported transitions degrade with
clear error messages instead of silent file edits.

### Reduced-capability behavior

- In `read-only` workspaces, mutation commands are blocked with setup guidance.
- In `local-mutations` workspaces, task control works but run start/resume is unavailable until the packaged runtime is present.
- Review actions only succeed for tasks that are already in `tasks/review/`.
- Requeue only succeeds for tasks that are currently in `tasks/blocked/`.
- Resume is only offered for failed or paused runs with persisted run records.
- Run start surfaces a dry-run estimate/cost summary before launch; this is an
  estimate, not an execution gate.
- Cloud confirmation is now part of the shipped routing-policy baseline. In the
  default `auto` path, Devory remains local-first, but a cloud-bound route is
  expected to require explicit confirmation rather than escalating casually.

### Run routing and outcome recording

`Devory: Start Factory Run`

- Available in: Command Palette and task explorer title controls
- Reads: `tasks/ready/`, `config/routing-policy.json` when present, readiness
  signals, and the bundled runtime payload
- Writes: run-control state, `runs/` output from the packaged runner, and
  `artifacts/routing-outcomes/execution-outcomes.jsonl`

Current execution flow:

1. Profile ready tasks.
2. Build a local-first routing decision for each task.
3. Apply the effective routing policy and current readiness signals.
4. Offer an optional manual execution preference such as `prefer_local`,
   `force_local`, or `force_cloud`.
5. Resolve concrete target and adapter bindings.
6. Start the packaged runner if binding is runnable.
7. Record routing outcomes with selected versus actual metadata preserved.

Important caveats:

- Selected provider/target/adapter and actual provider/target/adapter are kept
  separate on purpose.
- Blocked or prevented launches are recorded honestly when execution does not
  start.
- Outcome capture is compact. It is not a telemetry platform and it does not
  infer details the runtime does not surface.

`Devory: Show Routing Outcome Summary`

- Available in: Command Palette
- Reads: `artifacts/routing-outcomes/execution-outcomes.jsonl`
- Writes: nothing
- Output: Devory output channel

The command summarizes recent routing outcomes for manual policy and target
tuning. It currently reports provider counts, target counts, fallback totals,
blocked totals, result status counts, and top reasons from ledger-backed fields
only.

---

## Architecture

The extension follows the shared-package architecture established in factory-062
through factory-065:

```
packages/vscode/
  src/
    extension.ts          — VS Code entry point; registers commands and tree view
    config.ts             — reads devory.factoryRoot workspace setting
    commands/             — command palette handlers (use VS Code API)
    providers/
      task-tree.ts        — TreeDataProvider for sidebar task explorer
    lib/                  — pure functions, no VS Code API dependency
      task-reader.ts      — reads tasks from filesystem (@devory/core)
      run-reader.ts       — reads run records from filesystem
      run-adapter.ts      — packaged runtime invocation and status handling for run start
    test/                 — unit tests for lib/ (tsx --test compatible)
```

- **`lib/`** files are fully unit-testable with `tsx --test`; they accept
  `tasksDir` / `runsDir` / `factoryRoot` parameters instead of reading from
  VS Code settings.
- **Commands** delegate all data work to `lib/` and use VS Code API only for
  UI (QuickPick, progress, notifications).
- **Task mutations** (create task, move task) call the shared workspace APIs
  exported by `@devory/cli`, so the extension and CLI share the same
  validation, path resolution, and file-write behavior.
- **Run execution** now goes through the packaged local runtime adapter rather
  than the old CLI/`tsx` bridge path, with the runtime resolved from the
  installed extension payload.
- **Capability detection** decides which flows are available in the current
  workspace and turns unsupported commands into deliberate setup guidance.
- **Release validation** now smoke-checks the generated `.vsix` to confirm the
  runtime payload is actually present in the packaged artifact.

---

## Development

```sh
# Run unit tests (pure lib/ functions only)
npm test  # from ai-dev-factory root (includes vscode tests)

# Or run vscode tests directly:
cd packages/vscode
npx tsx --test src/test/task-reader.test.ts src/test/run-reader.test.ts src/test/cli-bridge.test.ts

# Build the extension bundle only (esbuild → out/extension.js)
cd packages/vscode && npm run build

# Build and package as .vsix (esbuild + vsce package)
npm run package --workspace packages/vscode
# Output: packages/vscode/devory-vscode-<version>.vsix

# The package script also validates that the .vsix contains:
# - extension/runtime/runtime-manifest.json
# - extension/runtime/packages/runner/src/factory-run.js
# - extension/runtime/scripts/run-orchestrator.js

# Update the version before re-packaging
# Edit "version" in packages/vscode/package.json, then re-run npm run package
```
