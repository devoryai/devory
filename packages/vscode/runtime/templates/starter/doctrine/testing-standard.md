# Testing Standard

## Purpose

This document defines the testing expectations for all code generated or modified within the Saltware platform.

Testing is not optional.

All meaningful changes must be verifiable through automated or documented manual tests.

Agents must treat testing as a **core part of implementation**, not an afterthought.

---

# Core Testing Philosophy

Testing exists to ensure that:

- new functionality works
- existing functionality does not break
- behavior remains predictable over time
- future engineers can safely modify the system

Testing should favor:

- clarity
- repeatability
- speed
- confidence

---

# Test-Driven Development

Agents should prefer **Test-Driven Development (TDD)** when practical.

The preferred development flow is:

1. Write a failing test that describes the desired behavior.
2. Implement the smallest amount of code required to pass the test.
3. Refactor if necessary while keeping tests passing.

If strict TDD is not practical for a specific task, tests must still be written as part of the implementation.

---

# Coverage Expectations

The goal is **near 100% coverage for new or modified logic** whenever practical.

Coverage must include:

- success path
- failure path
- edge cases
- input validation
- error conditions

Agents should not claim task completion if significant new logic lacks test coverage.

Exceptions must be explicitly documented.

---

# What Must Be Tested

Tests should cover:

- domain services
- business logic
- data validation
- critical workflows
- error handling

Tests should avoid focusing solely on:

- framework wiring
- trivial getters/setters
- simple data containers

Focus testing effort on **behavior and logic**.

---

# Unit Tests

Unit tests verify individual functions or services in isolation.

Unit tests should:

- avoid external dependencies
- use mocks where appropriate
- run quickly
- be deterministic

A good unit test:

- tests one concept
- is easy to understand
- fails clearly when behavior changes

---

# Integration Tests

Integration tests verify that components work together correctly.

These may include:

- service + database interaction
- API endpoint behavior
- multi-step workflows

Integration tests should be used sparingly but strategically.

---

# Test Structure

Tests should follow a consistent structure.

Preferred structure:
# Testing Standard

## Purpose

This document defines the testing expectations for all code generated or modified within the Saltware platform.

Testing is not optional.

All meaningful changes must be verifiable through automated or documented manual tests.

Agents must treat testing as a **core part of implementation**, not an afterthought.

---

# Core Testing Philosophy

Testing exists to ensure that:

- new functionality works
- existing functionality does not break
- behavior remains predictable over time
- future engineers can safely modify the system

Testing should favor:

- clarity
- repeatability
- speed
- confidence

---

# Test-Driven Development

Agents should prefer **Test-Driven Development (TDD)** when practical.

The preferred development flow is:

1. Write a failing test that describes the desired behavior.
2. Implement the smallest amount of code required to pass the test.
3. Refactor if necessary while keeping tests passing.

If strict TDD is not practical for a specific task, tests must still be written as part of the implementation.

---

# Coverage Expectations

The goal is **near 100% coverage for new or modified logic** whenever practical.

Coverage must include:

- success path
- failure path
- edge cases
- input validation
- error conditions

Agents should not claim task completion if significant new logic lacks test coverage.

Exceptions must be explicitly documented.

---

# What Must Be Tested

Tests should cover:

- domain services
- business logic
- data validation
- critical workflows
- error handling

Tests should avoid focusing solely on:

- framework wiring
- trivial getters/setters
- simple data containers

Focus testing effort on **behavior and logic**.

---

# Unit Tests

Unit tests verify individual functions or services in isolation.

Unit tests should:

- avoid external dependencies
- use mocks where appropriate
- run quickly
- be deterministic

A good unit test:

- tests one concept
- is easy to understand
- fails clearly when behavior changes

---

# Integration Tests

Integration tests verify that components work together correctly.

These may include:

- service + database interaction
- API endpoint behavior
- multi-step workflows

Integration tests should be used sparingly but strategically.

---

# Test Structure

Tests should follow a consistent structure.

Preferred structure:
Arrange
Act
Assert

Example:
Arrange: prepare test inputs
Act: execute function or service
Assert: verify results


Tests should be readable and self-explanatory.

---

# Test Naming

Test names should clearly describe the expected behavior.

Preferred pattern:
should_<expected_behavior>when<condition>


Example:
should_create_event_when_valid_input_is_provided
should_reject_event_when_date_is_missing


Clear test names improve maintainability.

---

# Deterministic Tests

Tests must produce the same result every time they run.

Avoid:

- reliance on current time without control
- external services
- random values without seeding
- environment-dependent behavior

Use mocks or controlled inputs when necessary.

---

# Test Isolation

Tests should not depend on other tests.

Each test must:

- prepare its own data
- clean up after execution if necessary

Tests must be able to run in any order.

---

# Test Speed

Tests should run quickly enough to be used frequently during development.

Prefer:

- fast unit tests
- minimal setup overhead

Avoid slow or complex test environments unless absolutely required.

---

# Verification Commands

Tasks should include **verification commands** when possible.

Examples:
npm run test
npm run build
npm run lint


Agents should verify that these commands succeed before declaring task completion.

---

# Handling Test Failures

If tests fail:

- do not ignore the failure
- do not bypass tests
- do not mark the task complete

Failures must be investigated and resolved.

---

# Documentation for Tests

Generated documentation for a feature should include:

- what tests were added
- what behavior they validate
- any limitations or assumptions

This information should be included in PR summaries or change documentation.

---

# Edge Case Testing

Agents should consider edge cases such as:

- missing inputs
- invalid formats
- boundary values
- unexpected states

Edge case testing improves system resilience.

---

# Regression Prevention

When fixing bugs:

- add a test that reproduces the bug
- verify the test fails before the fix
- ensure the test passes after the fix

This prevents the same bug from returning later.

---

# Avoid Over-Testing

Tests should verify meaningful behavior.

Avoid excessive tests for trivial implementation details.

Focus on **behavior that matters to users or system stability**.

---

# Maintainable Tests

Tests should be easy to maintain.

Avoid:

- overly complex test setups
- brittle assumptions
- unnecessary duplication

Reusable test utilities are encouraged.

---

# Final Rule

A task is not complete until:

- the implementation works
- the behavior is verified by tests
- verification commands succeed

**Working code without tests is incomplete work.**