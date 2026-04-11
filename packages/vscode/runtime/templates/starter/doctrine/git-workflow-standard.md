# Git Workflow Standard

## Purpose

This document defines the default Git workflow conventions used across projects.

These rules exist to keep repository hygiene consistent across projects even
when the implementation details of local tooling differ.

If a repository needs stricter rules, it may extend this standard. It should
not silently contradict it.

---

# Core Principles

Git workflow should be:

- consistent across repositories
- easy to adopt on a new machine
- fast in local development
- strict in CI
- explicit enough for humans and tools to parse

Local hooks should help engineers catch mistakes early. They should not become
the only line of defense.

CI remains the final source of truth.

---

# Commit Message Standard

All repositories should use **Conventional Commits** for commit subjects.

Reference:
https://www.conventionalcommits.org/en/v1.0.0/

Default subject format:

```text
<type>[optional scope][!]: <description>
```

Examples:

```text
feat(cli): add governance status command
fix(worker): prevent duplicate run dispatch
docs(doctrine): update workflow guidance
chore(tasks): move factory-123 ready -> doing
```

Default allowed types:

- `feat`
- `fix`
- `docs`
- `chore`
- `refactor`
- `test`
- `build`
- `ci`
- `perf`
- `revert`
- `style`

Guidance:

- use `feat` for new behavior visible to users or downstream consumers
- use `fix` for bug fixes
- use `docs` for documentation-only changes
- use `chore` for maintenance, automation, metadata, and operational records
- use an optional scope when it meaningfully narrows the affected area
- use `!` or a `BREAKING CHANGE:` footer when the change is breaking

Commit descriptions should be short, specific, and written in the imperative.

---

# Hook Expectations

Repositories should standardize which hooks exist and what each hook is allowed
to enforce.

Recommended default hooks:

- `pre-commit`
- `commit-msg`
- `pre-push`

Optional hooks may be added when a repository has a clear need, but the team
should avoid hook sprawl.

---

# Pre-commit

`pre-commit` should run fast checks on staged or directly affected files.

Good uses for `pre-commit`:

- formatting
- lightweight linting
- secret detection
- generated-file validation
- obvious schema or config validation

`pre-commit` should usually complete quickly. Avoid running long test suites or
full production builds here.

If a check is slow, flaky, or requires network access, it usually belongs in CI
or `pre-push`, not `pre-commit`.

---

# Commit-msg

`commit-msg` should enforce commit message structure.

At minimum, it should validate:

- Conventional Commits subject format
- required ticket references when a repository uses ticket-coupled workflow
- any repository-specific scope or type restrictions

When commit message validation is required, teams should prefer automated
enforcement in `commit-msg` over relying on reviewer memory.

---

# Pre-push

`pre-push` may run slower checks that are still useful before code leaves the
developer machine.

Good uses for `pre-push`:

- targeted tests
- type checking
- broader lint suites
- packaging checks

`pre-push` should still be deterministic and reasonably fast. If it becomes a
drag on normal work, move the heavier checks to CI.

---

# CI Responsibilities

Hooks improve feedback speed. CI protects the repository.

CI should enforce the checks required for merge safety, including:

- test execution
- build verification
- linting or static analysis
- any policy checks that must run consistently for every contributor

A repository must not depend on local hooks alone for safety-critical checks.

---

# Installation And Portability

Hook behavior should be repository-managed rather than left to each engineer's
global Git config.

Recommended approaches:

- a tracked `.githooks/` directory with `git config core.hooksPath .githooks`
- a repository-managed tool such as Husky or Lefthook

Every repository that expects hooks should document:

- how hooks are installed
- whether installation is automatic or manual
- how to re-run the same checks without using Git hooks directly

---

# Repo-Specific Extensions

Repositories may extend this standard with additional rules such as:

- branch naming conventions
- ticket identifiers in branch names or commit messages
- restricted commit scopes
- language-specific verification steps

Those extensions should live in repository doctrine or standards files and
should clearly say they are an extension of this base standard.

---

# Governance Commit Guidance

Governance repositories should also follow Conventional Commits.

Preferred scopes include:

- `tasks`
- `doctrine`
- `standards`
- `profiles`
- `runs`
- `commands`
- `audit`
- `migration`

For governance content:

- use `docs(doctrine)` for doctrine document edits
- use `chore(...)` for task movement, runtime records, metadata, and operational changes

This keeps doctrine changes distinct from operational repository events.
