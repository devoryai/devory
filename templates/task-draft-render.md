---
id: TASK-ID
title: Short descriptive title
project: project-name
repo: .
branch: task/TASK-ID-short-slug
type: feature
priority: medium
status: backlog
agent: fullstack-builder
lane: optional-lane
repo_area: optional-area
bundle_id: optional-epic-id
bundle_title: Optional epic title
bundle_phase: optional-phase
depends_on:
  - prior-task-id
files_likely_affected:
  - /absolute/path/to/file.ts
verification:
  - npm run test
---

## Goal

Describe the business outcome in plain English.

## Context

- Relevant background
- Constraints and assumptions

## Acceptance Criteria

- Concrete verifiable outcome

## Expected Artifacts

- Files changed

## Failure Conditions

- What would cause rejection

## Reviewer Checklist

- [ ] Reviewer can verify the result quickly
