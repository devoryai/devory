---
name: Test Generation
version: 1
tags: [testing, vitest, jest, coverage, unit-tests, integration-tests, typescript]
---

# Test Generation

## When to Use

This skill applies when the task involves any of the following:

- Adding test coverage to a new implementation that currently has no tests
- Repairing or extending existing tests that are incomplete, broken, or outdated after a code change
- Writing tests as the primary deliverable of a task (dedicated coverage task)
- Reviewing a completed implementation and determining what tests it still needs

This skill does NOT apply when tests are incidental to a feature implementation task — in that case, follow the feature task's acceptance criteria and apply `doctrine/testing-standard.md` directly. Use this skill when the task is primarily or exclusively about producing tests.

## What This Skill Covers

- How to read an implementation and identify what is worth testing
- How to choose between unit and integration tests for a given case
- File placement and naming conventions for test files in this repository
- How to write test descriptions that communicate behavior, not implementation
- How to structure setup (Arrange/Act/Assert) without over-complicating it
- How to handle async functions, Promises, and side effects in tests
- How to verify that coverage is actually sufficient before marking the task done

## What This Skill Does Not Cover

- Testing requirements, coverage targets, TDD philosophy, and what to avoid mocking: see `doctrine/testing-standard.md` — that file is already loaded in every packet; this skill does not restate it
- Testing React components in the browser or with a DOM environment: those require additional setup beyond what this skill covers
- Performance testing, load testing, or end-to-end browser automation
- Writing the implementation itself; this skill assumes the code already exists or is stable

## Inputs

Before following this skill, confirm you have:

- The implementation files being tested (or a clear description of the public API surface)
- Knowledge of the test runner in use (Vitest for packages in this repo; Jest elsewhere — check `package.json`)
- Any existing test files for the same module, to avoid duplication and understand established patterns
- A stable, complete implementation — do not write tests against in-progress code that is still changing shape

## Procedure

1. Open the implementation file(s) and read them fully before writing any test code. Understand the public API surface: which functions and methods are exported, what they accept, and what they return.

2. List what needs tests. For each exported function or class, identify:
   - The primary success case (valid input → expected output)
   - At least one failure or error case (invalid input, missing dependency, unexpected state)
   - Edge cases relevant to the logic (empty array, zero, null, boundary values)
   - Any side effects that must occur or must not occur

3. Choose unit vs integration for each item:
   - **Unit test**: the function's logic can be verified without hitting a real database, filesystem, HTTP endpoint, or time-sensitive operation. Mock or stub any external dependencies.
   - **Integration test**: correct behavior depends on a real interaction between two or more components — for example, a service that reads from a real database, or an API route that calls real downstream logic. Use real dependencies; do not mock what you are testing.
   - Default to unit tests. Use integration tests only where mocking would hide the behavior you need to verify.

4. Create the test file in the same directory as the implementation, using the convention `<filename>.test.ts` (or `.test.tsx` for React components). If test files for the module already exist, add to them rather than creating a new parallel file.

5. Write `describe` blocks grouping related tests. Name each `describe` block after the function or behavior being tested:
   ```ts
   describe('parseFactoryContext', () => { ... })
   describe('resolveProductTarget', () => { ... })
   ```

6. Write individual test cases using `it` or `test`. Name each test as a behavioral statement — what the function does under a specific condition, not how it does it:
   - Prefer: `it('returns null when no product keywords are detected')`
   - Avoid: `it('calls resolveProductTarget with the correct arguments')`
   - Avoid: `it('works correctly')`

7. Structure each test with Arrange / Act / Assert:
   - **Arrange**: prepare inputs, mocks, and any required state
   - **Act**: call the function under test — one call per test
   - **Assert**: verify the return value, thrown error, or side effect

8. For async functions: use `async/await` in the test body. Do not use raw `.then()/.catch()` chains unless you are specifically testing Promise chain behavior.

9. For functions with side effects (writing files, calling external services, emitting events): use a spy or mock to assert the side effect occurred with the correct arguments. Do not assert on internal state or implementation details — assert on observable outputs.

10. For error cases: use `expect(() => fn()).toThrow(...)` for synchronous throws, and `await expect(fn()).rejects.toThrow(...)` for async throws. Do not rely on a test passing silently when an error should have been thrown.

11. Run the test suite:
    ```
    npm run test
    ```
    All new tests must pass. If any new test fails, fix the test or the implementation before proceeding.

12. Check coverage for the files you tested. For Vitest:
    ```
    npm run test -- --coverage
    ```
    Confirm coverage for the targeted files meets the threshold specified in `doctrine/testing-standard.md`. If it does not, identify which branches or paths are uncovered and add tests for them.

13. Review the test file once more. For each test, ask: "If I deleted the core logic of this function, would this test fail?" If no, the test is likely testing the wrong thing or is vacuous. Revise.

## Outputs / Verification

Expected outputs:
- One or more test files at `<source-file>.test.ts` co-located with the implementation
- Tests covering the primary success case, at least one failure/error case, and meaningful edge cases for each public function

Verification:
- `npm run test` passes with no failures
- `npm run test -- --coverage` shows coverage at or above the project threshold for the targeted files
- Each test description reads as a behavioral statement (not an internal detail)
- Every test would fail if the function's core logic were inverted or removed
- No test uses `key={index}` reasoning — each test case has a clear, distinct reason to exist

## Common Mistakes

1. **Writing only happy-path tests.** A function that returns a valid result for valid input is only half the story. For every success path there is typically an error path — missing input, invalid format, dependency failure. Tests that only cover the happy path give false confidence.

2. **Testing implementation details instead of behavior.** Tests that assert "function X was called with argument Y" or "internal counter is now 3" break when the implementation is refactored without changing behavior. Test what the function returns, throws, or visibly does — not how it internally achieves it.

3. **Over-mocking so the test proves nothing.** When every dependency is mocked and every call is intercepted, the test only verifies that the function calls its mocks. If you mock the database, the HTTP client, the file system, and the logger, you are testing the wiring, not the logic. Reserve mocks for I/O and external services; use real logic for pure functions.

4. **Writing tests against an unstable implementation.** Tests written while the implementation is still being shaped become incorrect as the implementation evolves. Finish the implementation first, then write tests against the final public API. Constant test rewriting is a sign the tests were started too early.

5. **Using vague test descriptions.** A failing test named `it('works correctly')` or `it('handles the case')` tells a reviewer nothing about what broke or what was expected. Write descriptions specific enough that a developer can understand the expected behavior from the test name alone, without reading the test body.

6. **Not verifying that tests would actually catch a regression.** A test suite that always passes — even after you remove the function's core logic — is worthless. After writing tests, mentally (or literally) delete the core logic and confirm the tests fail. If they don't, the assertions are not testing what matters.

7. **Duplicating setup code across every test instead of using `beforeEach`.** If every test in a `describe` block sets up the same objects or state, extract that setup into a `beforeEach` block. Duplicated setup is hard to maintain and causes tests to diverge when the setup needs to change.
