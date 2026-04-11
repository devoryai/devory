# Architecture Rules

## Purpose

This document defines the architectural rules that all generated code must follow when working on projects.

Agents must follow these rules unless a clear and documented exception is required.

When in doubt:

**Choose the simplest architecture that satisfies the requirement.**

---

# Core Architectural Principles

## Prefer Thin Vertical Slices

Features should be implemented as the **smallest meaningful vertical slice** that delivers real value.

A vertical slice includes:

- API endpoint or service entry point
- domain logic
- persistence if required
- tests
- documentation summary

Avoid building large frameworks or scaffolding ahead of actual need.

Prefer:

Small → working → verified → extended.

---

## SOLID Principles Are Required

All code should adhere to SOLID principles where practical.

### Single Responsibility

Each module, function, or class should have **one clear purpose**.

### Open / Closed

Code should be **open for extension but closed for modification** where possible.

### Liskov Substitution

Derived types must behave correctly when substituted for their base types.

### Interface Segregation

Prefer **small, focused interfaces** rather than large general ones.

### Dependency Inversion

Depend on **abstractions**, not concrete implementations.

---

# Service Architecture

## Route Handlers Must Be Thin

HTTP routes (or API handlers) should contain **minimal logic**.

Route handlers should:

- validate inputs
- call domain services
- format responses
- handle errors

Route handlers must **not contain business logic**.

Example pattern:
route handler
→ validation
→ service call
→ response


---

## Business Logic Lives in Domain Services

Business logic belongs in **domain service modules**.

Services should:

- contain core business rules
- remain framework-independent where possible
- be easily testable

Example structure:
services/
createEventService.ts
updateServicePlanService.ts


---

## Data Access Must Be Isolated

Database access should be isolated from business logic.

Prefer patterns like:
service
→ repository / data layer
→ database


Avoid mixing persistence logic with business rules.

---

# File and Module Structure

Modules should be organized by **feature/domain**, not by technical layer alone.

Prefer:
features/
events/
events.service.ts
events.repository.ts
events.routes.ts
events.tests.ts


Avoid:
controllers/
services/
repositories/


without domain grouping.

Domain grouping improves maintainability and discoverability.

---

# Function Design

Functions should be:

- small
- explicit
- deterministic
- composable

Avoid:

- long functions
- hidden side effects
- excessive parameter lists

Prefer small helper functions over large multi-purpose functions.

---

# State Management

Prefer **explicit state** over hidden or implicit state.

Avoid:

- global mutable state
- hidden side effects
- complex shared state objects

Prefer:

- explicit parameters
- clear return values
- predictable data flow

---

# Dependency Management

Dependencies must be chosen carefully.

Rules:

- avoid unnecessary external libraries
- prefer built-in capabilities where possible
- do not introduce heavy dependencies for trivial functionality

Every dependency increases maintenance cost.

---

# Error Handling

Errors should be:

- explicit
- predictable
- logged where appropriate

Avoid silent failures.

Error messages should include:

- context
- relevant identifiers
- actionable information

---

# Validation

All external input must be validated.

This includes:

- API input
- query parameters
- database inputs
- external service responses

Validation should occur **at system boundaries**, not deep inside services.

---

# Configuration

Configuration should be:

- explicit
- environment-driven
- centrally managed

Avoid hardcoding environment-specific values.

---

# Testing Architecture

All architecture should support **testability first**.

Code must be structured so that:

- services can be tested independently
- database layers can be mocked
- logic can run without the HTTP layer

Architecture should enable **fast automated testing**.

---

# Performance Philosophy

Do not prematurely optimize.

First priority:

- correctness
- clarity
- maintainability

Optimize only when:

- a real bottleneck exists
- measurement confirms it

---

# Documentation Expectations

Architecture decisions must be explainable.

Every significant feature implementation should generate:

- change summary
- testing notes
- risk notes

Documentation should be generated automatically where possible.

---

# Forbidden Architectural Patterns

Agents should avoid introducing:

- large monolithic modules
- hidden global state
- excessive abstraction layers
- unnecessary design patterns
- framework-specific logic inside domain services

Avoid cleverness.

Prefer boring, understandable solutions.

---

# Architectural Decision Rule

If multiple solutions exist:

Choose the solution that is:

1. easiest to understand
2. easiest to test
3. easiest to maintain
4. simplest to implement safely

Simplicity wins.

---

# Cross-Project Platform Context

All products share common principles:

- small teams
- long-term maintainability
- clarity over cleverness
- strong testing discipline
- incremental feature delivery

Architecture must support these realities.

---

# Final Rule

If a proposed architecture would make the code harder for a future engineer to understand quickly, choose a simpler approach.

**Maintainability is the highest priority.**