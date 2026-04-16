> **LEGACY MODEL** — This document describes the original cloud-sync (push/pull) model.
> For the new governance-repo model see [docs/governance-repo-migration.md](./governance-repo-migration.md)
> and [docs/governance-repo-quickstart.md](./governance-repo-quickstart.md).
>
> The current CLI still dispatches `devory sync`, but this file describes the
> older cloud-sync mental model rather than the newer governance-first guidance,
> so treat it as architecture/history documentation rather than primary command
> help.

# Cloud Sync Model (Local + Cloud)

Devory is intentionally **local-first** for execution and source control, with optional
cloud sync for sharing durable artifacts across devices and teams.

This doc explains how to get a smooth day-to-day workflow and what should sync.

## Why local-first

- Your code and runtime stay in your machine or CI environment.
- Existing Git workflow remains source of truth for application code.
- Cloud sync focuses on Devory metadata/artifacts needed for continuity,
  supervision, and collaboration.

## What should sync to cloud

Treat these as sync targets:

- task metadata and lifecycle state
- run summaries and checkpoints
- human-question state and review events
- doctrine snapshots and policy fingerprints
- artifact indexes and references

Treat these as **local-only by default**:

- repository source files
- raw vendor/tool credentials
- large temporary build outputs and caches

## Recommended operating model

1. Keep code collaboration in Git/GitHub.
2. Use `devory sync status` before and after meaningful work sessions.
3. Use `devory sync push` after local progress.
4. Use `devory sync pull` when switching machines or starting shared review.
5. Keep cloud sync enabled for Pro/Teams workspaces so operator surfaces reflect reality.

## What about tasks?

Yes — tasks can exist in both places, but with different purposes.

- **Local tasks (source of truth):** Markdown files under `tasks/` in your repo,
  versioned in Git, reviewed in normal PR flow.
- **Cloud task state (collaboration mirror):** lifecycle status, review decisions,
  assignment/ownership metadata, and timeline events used by shared operator surfaces.

Recommended rule:

- write/edit task content locally in the repo
- sync task state/events to cloud for team visibility and cross-device continuity
- if local task content and cloud metadata disagree, resolve from Git and re-sync

This keeps editing developer-native while still enabling a useful Pro/Teams cloud view.

## Minimum setup for reliable sync

Cloud sync depends on:

- active Devory session: `.devory/session.json`
- workspace binding in session: `workspace_id`
- Supabase env vars available to the CLI process:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

If these are missing, `devory sync` will fail fast with setup guidance.

## Team-license value checklist

A team license is most valuable when the team can trust a shared cloud state.

Use this checklist:

- every teammate signs in and binds to the same workspace
- each machine runs `sync status` as part of a daily start/end routine
- review/control decisions are captured as synced artifacts, not side-channel chat
- run cloud sync in CI or scheduled automation for long-lived branches

## Security + IP posture

If your concern is exposing your entire application, use a split approach:

- keep source code in Git provider controls (private repos, branch protection)
- sync only Devory artifacts/metadata needed for orchestration continuity
- avoid syncing secrets and raw `.env` material
- apply retention and access controls in your cloud workspace

This gives cloud continuity without making Devory cloud storage your full code host.
