import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { validateSkillFile } from "./skill-validator.js";

const VALID_SKILL = `---
name: Example Skill
version: 1
tags: [example]
---

# Example Skill

## When to Use

- Use this when running a focused workflow.

## What This Skill Covers

- Checklist and sequence for this task type.

## What This Skill Does Not Cover

- Unrelated product decisions.

## Inputs

- Task file
- Related docs

## Procedure

1. Read the task and constraints.
2. Implement the smallest safe change.
3. Verify outputs and tests.

## Outputs / Verification

- Updated files
- Passing verification commands

## Common Mistakes

- Skipping required prerequisites
- Making broad unrelated edits
- Forgetting to run verification
`;

describe("validateSkillFile", () => {
  test("valid skill passes", () => {
    const result = validateSkillFile("example-skill", VALID_SKILL);

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test("missing required section fails", () => {
    const invalid = VALID_SKILL.replace("## Inputs", "## Not Inputs");
    const result = validateSkillFile("example-skill", invalid);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('Missing required section: "## Inputs"')));
  });

  test("short procedure fails", () => {
    const invalid = VALID_SKILL.replace(
      "1. Read the task and constraints.\n2. Implement the smallest safe change.\n3. Verify outputs and tests.",
      "1. Read the task and constraints.\n2. Implement the smallest safe change."
    );
    const result = validateSkillFile("example-skill", invalid);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes('"## Procedure" must contain at least 3 numbered list items')
    );
  });

  test("short common mistakes fails", () => {
    const invalid = VALID_SKILL.replace(
      "- Skipping required prerequisites\n- Making broad unrelated edits\n- Forgetting to run verification",
      "- Skipping required prerequisites\n- Making broad unrelated edits"
    );
    const result = validateSkillFile("example-skill", invalid);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes('"## Common Mistakes" must contain at least 3 list items')
    );
  });
});
