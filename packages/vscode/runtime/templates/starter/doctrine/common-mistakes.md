# Common Mistakes to Avoid

## Purpose

This document lists common engineering mistakes that must be avoided when generating or modifying code for platform projects.

These rules act as guardrails to prevent fragile architecture, poor maintainability, and unintended system complexity.

Agents should actively check their work against this list before considering a task complete.

---

# Architectural Mistakes

## Putting Business Logic in Route Handlers

Route handlers should remain thin.

Avoid placing business logic directly inside API routes or controllers.

Route handlers should only:

- validate inputs
- call domain services
- format responses
- handle errors

Business logic belongs in **domain service modules**.

---

## Creating Large Monolithic Files

Avoid creating large files that handle multiple responsibilities.

Large files are difficult to understand and maintain.

Prefer:

- smaller modules
- clearly separated responsibilities
- focused services

Files should generally remain small and easy to navigate.

---

## Overengineering

Avoid introducing unnecessary abstractions, patterns, or frameworks.

Examples of overengineering:

- adding layers that are not required
- creating complex inheritance structures
- introducing patterns without clear benefit

Prefer simple, direct solutions.

---

## Premature Optimization

Do not optimize performance before a real bottleneck exists.

Avoid:

- micro-optimizations
- complicated caching logic
- premature concurrency

Correctness and clarity are more important than theoretical performance improvements.

---

# Code Quality Mistakes

## Hidden Side Effects

Functions should behave predictably.

Avoid functions that:

- modify global state
- mutate inputs unexpectedly
- perform unrelated operations

Functions should be explicit about their behavior.

---

## Long Functions

Avoid functions that perform multiple unrelated tasks.

If a function becomes difficult to understand at a glance, it should be broken into smaller pieces.

Prefer small, composable functions.

---

## Excessive Parameters

Functions with large numbers of parameters can become confusing.

If a function requires many parameters, consider:

- grouping related values into objects
- simplifying the design

---

## Inconsistent Naming

Names should be consistent and descriptive.

Avoid:

- abbreviations that are not widely understood
- inconsistent naming patterns
- unclear variable names

Names should clearly communicate intent.

---

# Testing Mistakes

## Skipping Tests

New logic must not be introduced without corresponding tests.

Avoid marking tasks complete if meaningful behavior lacks test coverage.

Tests are required to ensure long-term system stability.

---

## Fragile Tests

Tests should not depend on:

- external systems
- unpredictable timing
- shared mutable state

Tests should be deterministic and reliable.

---

## Testing Implementation Details

Tests should verify behavior rather than internal implementation.

Avoid tests that break whenever the internal structure changes.

Focus on observable outcomes.

---

# Documentation Mistakes

## Missing Change Summaries

Every meaningful change should include a short summary describing:

- what changed
- why the change was made

Without this information, future engineers may struggle to understand the system.

---

## Outdated Documentation

Documentation must remain accurate.

If system behavior changes, related documentation should be updated automatically or regenerated.

Outdated documentation can cause confusion and errors.

---

# Workflow Mistakes

## Expanding Task Scope

Tasks should remain focused on their defined objective.

Avoid adding unrelated improvements or refactors during implementation.

If additional improvements are identified, they should become new tasks.

---

## Ignoring Dependencies

Tasks should not be executed before their dependencies are satisfied.

Ignoring dependencies can cause inconsistent system behavior.

Always verify dependency status before execution.

---

## Incomplete Verification

A task is not complete unless:

- acceptance criteria are satisfied
- tests pass
- verification commands succeed

Skipping verification can introduce hidden failures.

---

# Risky Behavior

## Modifying Unrelated Systems

Agents should avoid making changes outside the intended scope of the task.

Unrelated modifications increase risk and make reviews difficult.

---

## Destructive Changes Without Safeguards

Avoid changes that could:

- delete data
- break existing workflows
- disrupt system stability

Destructive operations should require explicit justification.

---

# Code Duplication

Avoid duplicating logic across the codebase.

When duplication is discovered:

- extract reusable functions
- centralize shared logic

Duplication increases maintenance cost.

---

# Ignoring Existing Patterns

Before introducing new patterns or structures, review how similar problems are solved in the existing codebase.

Maintaining consistency improves readability and maintainability.

---

# Clever Code

Avoid writing code that is difficult to understand.

Clever solutions may be impressive but often reduce maintainability.

Prefer clear and obvious implementations.

---

# Final Check

Before completing a task, confirm that the implementation:

- follows architectural rules
- includes appropriate tests
- produces documentation artifacts
- avoids the mistakes listed in this document

If any rule has been violated, the issue should be corrected before marking the task complete.