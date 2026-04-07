---
id: factory-184-rich
title: Define rich task draft contract with optional metadata
project: ai-dev-factory
repo: .
branch: task/factory-184-rich-task-draft-contract
type: feature
priority: high
status: backlog
agent: backend-builder
lane: planning
repo_area: authoring
bundle_id: epic-planning-authoring
bundle_title: Planning & Task Authoring
bundle_phase: contract
depends_on:
  - factory-181
files_likely_affected:
  - packages/core/src/
  - templates/
verification:
  - npm run validate:task -- tasks/backlog/factory-184.md
  - npm run test
---

## Goal

Define the rich structured task draft contract including optional metadata and render ordering.

## Context

- Task drafts must support workflow metadata such as dependencies and bundle linkage.
- Rendered markdown must remain compatible with existing readers and validators.

## Acceptance Criteria

- Optional metadata renders deterministically.
- Required sections preserve the existing heading order.

## Expected Artifacts

- Task draft contract module
- Task render contract fixture
- Task draft tests

## Failure Conditions

- Optional metadata ordering drifts across renderers
- Rendered markdown breaks current task readers

## Reviewer Checklist

- [ ] Rich draft covers optional metadata
- [ ] Markdown ordering is explicit and deterministic
