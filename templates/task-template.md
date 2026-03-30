---
id: TASK-ID
title: Short descriptive title
project: project-name
repo: https://github.com/yourname/repo-name
branch: task/TASK-ID-short-slug
type: feature
priority: medium
status: backlog
agent: fullstack-builder
depends_on: []
files_likely_affected: []
verification:
  - npm run lint
  - npm run build
  - npm run test
---

## Goal
Describe the business outcome in plain English.

## Context
Relevant background, links, constraints, and assumptions.

## Acceptance Criteria
- Criterion 1
- Criterion 2
- Criterion 3

## Expected Artifacts
- files changed
- migration created if needed
- summary written

## Failure Conditions
- build fails
- tests fail
- task depends on missing env/config
- architecture conflict discovered

## Reviewer Checklist
- [ ] Acceptance criteria satisfied
- [ ] No obvious hacks
- [ ] Build/test output included
- [ ] Summary is readable