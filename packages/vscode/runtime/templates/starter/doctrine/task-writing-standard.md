# Task Writing Standard

## Purpose

This document defines how tasks must be written for projects using this workflow.

Well-written tasks are essential for reliable automated development.

A task must represent the **smallest possible testable piece of work** that produces a meaningful improvement to the system.

Tasks that are too large, vague, or ambiguous should be decomposed before execution.

---

# Core Principle

Every task must represent a **small, boxed, verifiable unit of work**.

Tasks may be authored manually or generated from intent in the task-draft flow.
The default intake path is intent-first: describe work, generate drafts, review/refine, then commit.
Generated drafts are a starting point, not an exception to task quality requirements.

A task should:

- solve one problem
- produce one meaningful improvement
- modify a limited set of files
- be verifiable through tests or commands

If a task attempts to solve multiple problems, it must be decomposed.

---

# Task Size Expectations

A well-sized task should typically:

- affect a small number of files
- introduce or modify a single behavior
- be implementable within one focused work cycle
- be easy to review

If a task requires significant architectural work, it should be split into subtasks.

---

# Tasks Must Be Vertically Useful

Tasks should represent **vertical slices of functionality**, not horizontal infrastructure work.

Prefer tasks such as:

- add event creation endpoint
- implement event validation service
- add tests for event validation

Avoid tasks such as:

- build event framework
- implement generic architecture layer
- design future event subsystem

Work should deliver incremental value.

---

# Required Task Fields

Each task must include the following fields.

When tasks are generated from intent, these fields must still be complete by the time the task is committed.
If generated content is incomplete, refine it in the task draft editor before commit.

## id

Unique identifier for the task.

Example:
harbor-042


---

## title

A short, descriptive summary of the task.

Example:
Add validation for event creation inputs


---

## type

Defines the type of work being performed.

Common types include:

- feature
- bugfix
- refactor
- test
- documentation

---

## status

The current lifecycle stage of the task.

Possible values:

- backlog
- ready
- doing
- review
- blocked
- done

---

## description

A brief explanation of the task's purpose.

This should describe the problem being solved.

Example:
Event creation currently accepts incomplete input.
This task adds validation rules to ensure required fields are present.


---

## acceptance_criteria

Defines the conditions required for the task to be considered complete.

Acceptance criteria must be testable.

Example:
event title must be required

event date must be required

invalid input should return a validation error


---

## files_likely_affected

List of files or areas expected to change.

Example:
features/events/events.service.ts
features/events/event-validation.ts
tests/events.validation.test.ts


This helps guide the implementation agent.

---

## verification

Commands or steps used to verify that the task was completed successfully.

Examples:
npm run test
npm run build
npm run lint


Verification must be reproducible.

---

# Optional Fields

Optional metadata may include:

- parent_task
- dependencies
- lane
- repo_area
- priority
- skills (array of skill directory names under `skills/`, for example `skills: [database-migration]`)

Use `skills` when a task needs repeatable procedural guidance from the skills layer. See `docs/skills-architecture.md` for the model and naming conventions.

These fields help the scheduler and planner organize work.

## Generated Draft Review Requirements

When using intent-first drafting, review each generated task before commit.

- confirm title and goal are specific and actionable
- confirm acceptance criteria are concrete and testable
- confirm verification commands are runnable
- confirm dependencies and affected files are realistic

Governance is unchanged: lifecycle gates, validation checks, and required task sections still apply to committed tasks.

---

# Good Task Example
id: harbor-042
type: feature
status: backlog

title: Add validation for event creation inputs

description:
Ensure event creation requires a title and date.

acceptance_criteria:

event title must be required

event date must be required

invalid input returns validation error

files_likely_affected:

features/events/event-validation.ts

features/events/events.service.ts

tests/event-validation.test.ts

verification:

npm run test


---

# Signs a Task Is Too Large

A task should be decomposed if:

- it modifies many subsystems
- it requires many new files
- acceptance criteria contain multiple features
- verification is unclear

Large tasks should be broken into multiple smaller tasks.

---

# Avoid Ambiguous Tasks

Avoid tasks that include vague language such as:

- improve system
- refactor codebase
- optimize performance
- clean up architecture

Tasks must describe **specific outcomes**.

---

# Decomposition Guidelines

When decomposing a feature, tasks should typically follow a structure like:

1. schema changes
2. service implementation
3. API endpoint
4. validation logic
5. tests
6. documentation

Each step should remain independently verifiable.

---

# Dependency Discipline

Tasks may depend on other tasks.

Dependencies should be explicitly declared.

A task should not be executed if its dependencies are incomplete.

This prevents inconsistent system states.

---

# Verification Discipline

A task is not complete unless:

- acceptance criteria are satisfied
- verification commands succeed
- tests pass

Verification must always be possible.

---

# Final Rule

If a task cannot be clearly described, clearly verified, and clearly bounded, it is not ready for execution.

Tasks should always represent **small, precise, testable work units**.
