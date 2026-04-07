---
id: factory-184-minimal
title: Define minimal task draft contract
project: ai-dev-factory
repo: .
branch: task/factory-184-minimal-task-draft-contract
type: feature
priority: high
status: backlog
agent: backend-builder
depends_on: []
files_likely_affected: []
verification:
  - npm run test
---

## Goal

Define the minimum structured task draft that renders to valid Devory markdown.

## Context

- The render contract must remain compatible with the current validators.

## Acceptance Criteria

- A minimal task draft renders to valid markdown.

## Expected Artifacts

- Shared task draft contract

## Failure Conditions

- Rendered markdown omits required sections

## Reviewer Checklist

- [ ] Minimal draft is validator-compatible
