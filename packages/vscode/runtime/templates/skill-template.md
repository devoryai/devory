<!--
  Devory SKILL.md Template
  ========================
  Copy this file to skills/<skill-name>/SKILL.md and fill in every section.
  Delete this comment block when you are done.

  Before writing, read:
  - docs/skill-authoring-guide.md  — the full authoring standard
  - skills/EXAMPLE-SKILL.md        — a complete annotated example

  Naming your skill directory:
  - Use lowercase-kebab-case: database-migration, nextjs-component, test-generation
  - Name the repeatable work class, not an agent role or routing tag
  - See docs/skill-directory-spec.md for naming rules
-->

---
name: Skill Name Here
version: 1
tags: []
---

# Skill Name Here

<!--
  Replace "Skill Name Here" with a friendly title-case name for this skill.
  Example: "Database Migration" or "Next.js App Router Component"
  Do not include the word "skill" in the title — it is implied.
-->

## When to Use

<!--
  Write 1–5 bullet points that define when this skill activates.
  Each bullet must be a concrete, testable condition.
  A task either clearly matches or clearly does not.

  Format: "This skill applies when the task involves..."

  Bad example (too vague):
    - Tasks involving frontend work

  Good example (crisp):
    - Implementing a new page or layout component in a Next.js App Router project
    - Modifying a component that may need Server/Client boundary changes
-->

This skill applies when the task involves any of the following:

- [Condition 1 — be specific]
- [Condition 2 — be specific]

## What This Skill Covers

<!--
  Write a short scope statement (2–5 sentences or a short list).
  Name the specific patterns, decisions, or procedures inside this skill.
  Do not list things better handled in doctrine.
-->

This skill covers:

- [Specific pattern or decision covered]
- [Specific procedure or guidance covered]

## What This Skill Does Not Cover

<!--
  REQUIRED. Explicitly name at least one exclusion.
  Point to the doctrine file or other skill that handles excluded topics.
  This section prevents doctrine duplication and scope creep.

  Example:
    - General testing requirements: see doctrine/testing-standard.md
    - Database schema design principles: see doctrine/database-standard.md
-->

- [Excluded topic]: see [doctrine file or other skill]
- [Excluded topic]: see [doctrine file or other skill]

## Inputs

<!--
  List what the agent needs before following the procedure.
  Name concrete inputs: task description, relevant files, environment state, etc.
  Helps the agent know when it does not yet have what it needs.
-->

Before following this skill, confirm you have:

- [Required input 1]
- [Required input 2]

## Procedure

<!--
  REQUIRED. Numbered list of imperative steps.
  Each step must be a concrete action an agent can execute.
  Order: gather → execute → verify.
  Aim for 5–20 steps. Fewer may mean the skill lacks substance.
  Do not say "follow doctrine" — doctrine is loaded separately.
-->

1. [First step — imperative verb, concrete action]
2. [Second step]
3. [Third step]
4. [Add steps as needed]
5. [Final verification step]

## Outputs / Verification

<!--
  Describe what a correct, complete output looks like for this work class.
  Include:
  - What artifacts were produced (files, changes, etc.)
  - At least one concrete check or command to confirm correctness
-->

Expected outputs:
- [Artifact 1]
- [Artifact 2]

Verification:
- [Command or check that confirms correct execution]
- [Additional check if needed]

## Common Mistakes

<!--
  REQUIRED. List at least 3 specific, named mistakes for this class of work.
  Each item should name the mistake precisely, not generically.
  Optionally explain why it happens or how to detect it.

  Bad example (too vague):
    - Not following best practices

  Good example (specific):
    - **Renaming a column directly** instead of using the add/copy/drop pattern.
      Direct renames cause data loss in Prisma migrations.
-->

1. **[Mistake name]** — [What it looks like and why it is a problem.]

2. **[Mistake name]** — [What it looks like and why it is a problem.]

3. **[Mistake name]** — [What it looks like and why it is a problem.]

<!--
  === OPTIONAL SECTIONS ===
  Uncomment any of the following if they add real value.
  Do not include them just to fill space.
-->

<!--
## Examples

[Worked example inputs, outputs, or code snippets relevant to this skill.]
-->

<!--
## References

- [Link to related doctrine file]
- [Link to related skill]
- [Link to framework or external documentation]
-->

<!--
## Notes

[Edge cases, known limitations, or context that makes this skill more useful
but does not fit into the sections above.]
-->
