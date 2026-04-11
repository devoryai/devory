# Engineering Principles

## Purpose

This document defines the core engineering philosophy used across projects that adopt this doctrine.

These principles guide how software should be designed, implemented, tested, and maintained.

All agents should follow these principles when performing engineering work.

If a decision must be made between multiple approaches, these principles should guide the choice.

---

# Core Philosophy

Software should be:

- understandable
- maintainable
- testable
- safe to modify
- incremental in development

Engineering decisions should prioritize long-term maintainability over short-term convenience.

Simple, well-structured solutions are preferred over complex or clever implementations.

---

# Build the Thinnest Valuable Slice

Work should aim for the **smallest vertical slice that provides real value**.

A thin slice includes:

- the smallest useful capability
- minimal implementation
- tests
- verification

Avoid building large frameworks or speculative systems before they are needed.

Prefer:

small → working → verified → improved

---

# Prefer Simplicity

When multiple solutions exist, choose the simplest one that satisfies the requirements.

Complexity increases maintenance cost and the risk of bugs.

Avoid:

- unnecessary abstractions
- premature optimization
- overly clever solutions

Code should be easy for another engineer to understand quickly.

---

# Optimize for Maintainability

The codebase should be easy to maintain over time.

Maintainable code is:

- clearly structured
- consistently organized
- well-tested
- easy to reason about

Future engineers should be able to safely modify the system without fear of breaking unrelated functionality.

---

# Favor Readability Over Cleverness

Readable code is more valuable than clever code.

Avoid:

- obscure language tricks
- unnecessarily compact code
- surprising behavior

Code should communicate intent clearly.

If a reader must stop and decipher the logic, the code should be simplified.

---

# Small Units of Work

Engineering work should be performed in small, well-defined units.

Each unit of work should:

- have a clear goal
- have acceptance criteria
- be independently verifiable
- produce visible progress

Small units of work improve reliability and reduce risk.

---

# Testability Is Required

Code should be written in a way that makes testing straightforward.

Testable code typically has:

- clear boundaries
- small functions
- minimal hidden dependencies

Engineering work should include tests whenever new logic is introduced.

Testing protects the system from regressions and unintended side effects.

---

# Explicit Is Better Than Implicit

Software behavior should be clear and predictable.

Prefer:

- explicit parameters
- clear function outputs
- visible dependencies

Avoid hidden state or implicit behavior that makes the system harder to understand.

---

# Design for Change

Software systems evolve.

Code should be written in a way that allows safe modification over time.

Good designs:

- isolate responsibilities
- avoid tight coupling
- allow components to evolve independently

Systems that resist change become difficult to maintain.

---

# Avoid Premature Optimization

Performance optimizations should only be implemented when a real bottleneck exists.

Before optimizing:

- measure the system
- confirm the problem
- choose the simplest solution that improves performance

Maintainability is usually more valuable than marginal performance gains.

---

# Documentation Should Be Generated Automatically

Engineers should not spend excessive time manually writing documentation for routine work.

Instead:

- documentation should be generated automatically from task execution
- change summaries should accompany implementation
- verification notes should be recorded

Documentation should make it easy to understand what changed and why.

---

# Communication Is Part of Engineering

Engineering work should produce artifacts that help others understand the system.

These may include:

- implementation summaries
- verification reports
- execution logs
- change descriptions

Clear communication reduces friction for reviewers and maintainers.

---

# Consistency Matters

Consistency across the codebase improves readability and maintainability.

Agents should follow:

- established architectural patterns
- consistent naming conventions
- consistent file organization

Consistency reduces cognitive overhead for engineers working in the codebase.

---

# Solve Real Problems

Engineering effort should focus on delivering real value.

Avoid spending time on:

- speculative abstractions
- unnecessary features
- overengineering

Prioritize work that improves the system in meaningful ways.

---

# Continuous Improvement

The system should gradually improve over time.

Refactoring is encouraged when it:

- improves clarity
- reduces duplication
- simplifies architecture

However, refactoring should not introduce risk or destabilize the system.

---

# Respect System Boundaries

Changes should remain within the intended scope of the task.

Agents should avoid:

- modifying unrelated subsystems
- expanding scope unnecessarily
- introducing unrelated improvements

Focused changes reduce risk.

---

# Engineering Integrity

Engineering work should be completed responsibly.

Tasks should not be marked complete if:

- tests fail
- verification fails
- acceptance criteria are not satisfied

Integrity ensures that progress represents real improvement.

---

# Final Principle

The goal of engineering is to build systems that are:

- reliable
- understandable
- maintainable
- adaptable

Every change should move the system closer to those goals.
