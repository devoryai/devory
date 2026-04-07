# Workflow Rules

## Purpose

This document defines the workflow rules used by the AI development factory and Saltware engineering process.

These rules ensure that work is:

- prioritized
- structured
- traceable
- verifiable
- safe to execute

All agents must follow this workflow when creating, modifying, or completing tasks.

---

# Core Workflow Philosophy

Work should always be:

- small
- clearly defined
- independently verifiable
- easy to review
- easy to revert if necessary

Large, ambiguous tasks should be decomposed before execution.

The system should prioritize **steady progress through small completed units of work** rather than large unfinished efforts.

---

# Task Lifecycle

All tasks move through the following lifecycle stages.
backlog → ready → doing → review → done


Blocked tasks may move to:
blocked


Each stage represents a different level of readiness and completion.

---

# Backlog

The backlog contains tasks that have been identified but are not yet scheduled for work.

Backlog tasks should include:

- a clear description
- acceptance criteria
- estimated scope
- dependencies (if known)

Backlog tasks may represent:

- feature ideas
- improvements
- refactors
- bug fixes

Large tasks in the backlog should eventually be decomposed into smaller tasks.

---

# Ready

Tasks in the **ready** state are eligible for execution.

A task can only move to ready if it includes:

- clear acceptance criteria
- defined scope
- no unresolved dependencies
- identifiable files or areas likely affected

Ready tasks must be small enough to complete within a single focused implementation effort.

---

# Doing

Tasks move to **doing** when implementation begins.

While a task is in doing:

- work should remain focused on the defined scope
- additional unrelated work should not be added
- progress should move toward completion quickly

Tasks should not remain in doing for extended periods.

If a task grows beyond its intended scope, it should be decomposed into smaller tasks.

---

# Review

Completed tasks move to **review**.

Review verifies that:

- acceptance criteria are satisfied
- tests pass
- verification commands succeed
- documentation artifacts exist
- architecture rules were followed

If issues are discovered during review, the task may return to doing.

---

# Done

Tasks move to **done** once review confirms that:

- implementation is correct
- tests pass
- documentation artifacts are complete
- the system remains stable

Done tasks represent verified and completed work.

---

# Blocked

Tasks should move to **blocked** if progress cannot continue.

Common reasons include:

- missing dependency
- unclear requirements
- infrastructure limitations
- unexpected architectural conflicts

Blocked tasks should include a note describing the blocking issue.

---

# Task Size

Tasks should represent **small vertical slices of value**.

Ideal tasks should:

- affect a limited number of files
- have clear acceptance criteria
- be verifiable through tests or commands
- be understandable without extensive context

If a task appears too large, it should be decomposed into subtasks.

---

# Task Decomposition

Large tasks should be broken into smaller subtasks.

Subtasks should:

- represent a single responsibility
- be independently verifiable
- avoid overlapping changes

Dependencies between subtasks should be declared explicitly.

---

# Dependency Handling

Tasks may depend on other tasks.

A task should not move to ready if its dependencies are not complete.

Dependency relationships must be clearly declared.

This prevents work from being attempted in an invalid order.

---

# Execution Order

When selecting tasks for execution:

1. tasks with satisfied dependencies are eligible
2. tasks are processed in priority order
3. tasks affecting the same subsystem should not run simultaneously if conflicts are likely

Execution order should favor **steady forward progress**.

---

# Verification Requirements

Before a task can be considered complete:

- all tests must pass
- verification commands must succeed
- implementation must satisfy acceptance criteria

Verification commands may include:
npm run test
npm run build
npm run lint


Tasks should not be marked complete if verification fails.

---

# Communication Artifacts

Each completed task should produce:

- implementation summary
- verification summary
- execution log
- file change list

These artifacts enable review without requiring deep investigation of the code.

---

# Safety Rules

The workflow must prioritize safety.

Agents should avoid:

- modifying unrelated systems
- introducing risky changes without verification
- performing destructive operations without clear justification

Changes should be reversible whenever possible.

---

# Continuous Improvement

Workflow rules may evolve over time.

When improvements to the workflow are identified, they should be documented and incorporated into this file.

The goal is to continuously improve development discipline and efficiency.

---

# Final Rule

The purpose of the workflow is to enable consistent, safe, and reliable progress.

If a decision must be made between speed and clarity, **clarity wins**.