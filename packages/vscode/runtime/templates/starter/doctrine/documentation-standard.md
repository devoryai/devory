# Documentation Standard

## Purpose

This document defines how documentation should be generated and maintained for  projects.

Documentation exists to ensure that future engineers can quickly understand:

- what changed
- why it changed
- how it was verified
- what risks exist
- how to safely modify the system later

Documentation should be **generated automatically whenever possible**.

Human developers should not be required to manually write extensive documentation for routine changes.

---

# Core Documentation Philosophy

Documentation should be:

- clear
- concise
- factual
- easy to scan
- generated alongside development work

Documentation should describe **behavior and intent**, not simply repeat the code.

The goal is to reduce friction for future engineers.

---

# Documentation as a Byproduct of Work

Documentation should be generated as part of the development process.

Whenever code is changed, the system should produce artifacts that describe:

- the change
- the reasoning behind the change
- how the change was validated

This allows documentation to remain accurate without requiring extra effort.

---

# Required Documentation Artifacts

Every completed task should produce documentation containing the following sections.

## Change Summary

A short explanation of:

- what changed
- which feature or bug fix the change addresses
- the intended outcome

Example topics:

- new capability
- improvement
- bug fix
- refactor

---

## Implementation Notes

A description of:

- how the solution was implemented
- which modules or services were modified
- any design decisions made

This section helps future engineers understand the reasoning behind the implementation.

---

## Files Modified

Documentation should list the major files that were changed.

Example:
features/events/events.service.ts
features/events/events.repository.ts
features/events/events.routes.ts
tests/events.service.test.ts


This helps reviewers and maintainers quickly identify affected areas.

---

## Verification Notes

Documentation should explain how the change was validated.

Examples:

- unit tests added or updated
- integration tests executed
- manual testing steps
- verification commands run

Example commands:
npm run test
npm run build
npm run lint


Verification notes should make it easy for another engineer to reproduce the validation.

---

## Risks and Limitations

Every change should include a brief note describing:

- potential risks
- assumptions made
- known limitations
- future improvements

Even simple changes can benefit from documenting assumptions.

---

## Rollback Guidance

If possible, documentation should include a simple description of how to reverse the change.

Examples:

- revert the commit
- remove a configuration change
- restore a previous database migration

This improves operational safety.

---

# PR Documentation Expectations

Pull requests should include a short summary that contains:

- change summary
- verification notes
- important design considerations

PR summaries should be readable by engineers and reviewers without needing to inspect every line of code.

---

# Architecture Documentation

Major architectural changes should include a brief description of:

- the problem being solved
- the chosen approach
- alternatives considered (if relevant)

Architecture notes should focus on explaining decisions rather than repeating implementation details.

---

# Avoid Redundant Documentation

Documentation should not simply restate the code.

Avoid describing trivial implementation details that are obvious from the code itself.

Focus on:

- reasoning
- context
- decisions

---

# Keep Documentation Concise

Documentation should be easy to scan.

Prefer:

- bullet lists
- short paragraphs
- clearly labeled sections

Avoid long narrative explanations unless necessary.

---

# Update Documentation When Behavior Changes

If behavior changes, documentation must reflect the new behavior.

Outdated documentation can be more harmful than missing documentation.

Agents should ensure documentation remains consistent with the code.

---

# Generated Documentation Artifacts

The system may generate documentation files such as:

- implementation summaries
- execution logs
- verification summaries
- review summaries
- change summaries

These artifacts should be stored with the task execution results.

---

# Documentation Audience

Documentation should be understandable to:

- engineers unfamiliar with the codebase
- reviewers evaluating changes
- maintainers troubleshooting issues later

Clarity is more important than completeness.

---

# Final Rule

Documentation should make it possible for a future engineer to answer three questions quickly:

1. What changed?
2. Why was it changed?
3. How do I verify it works?

If documentation answers those questions clearly, it has succeeded.