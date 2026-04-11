# Prompt Guidelines

## Purpose

This document defines how prompts should be constructed when interacting with AI agents within the IDE.

Good prompts improve reliability, reduce ambiguity, and produce more consistent results across different models.

Agents responsible for generating prompts should follow these guidelines to ensure predictable and high-quality outputs.

---

# Core Prompt Philosophy

A prompt should clearly communicate:

- the objective
- the constraints
- the expected output format
- the success criteria

Ambiguous prompts often produce unpredictable results.

Clear instructions produce consistent outcomes.

---

# Always Define the Objective

Every prompt must begin by clearly stating the goal of the task.

The agent should understand:

- what problem it is solving
- what outcome is expected
- what success looks like

Example:
Your task is to implement the feature described below.
The implementation must satisfy the acceptance criteria and follow the engineering standards defined for this project.


---

# Provide Context

Prompts should include the minimum context required for the agent to perform the task correctly.

Relevant context may include:

- architecture rules
- engineering principles
- existing code patterns
- task description
- dependencies or constraints

Avoid overwhelming the agent with unnecessary information.

Provide the **relevant context only**.

---

# Define Constraints Clearly

Prompts should explicitly define constraints the agent must follow.

Examples:

- follow architectural rules
- write tests for new logic
- avoid modifying unrelated files
- keep route handlers thin
- use domain services for business logic

Explicit constraints reduce incorrect implementations.

---

# Specify the Output Format

The prompt must clearly define the required output format.

Examples of output formats:

- code modifications
- structured lists
- JSON responses
- XML-style file changes
- documentation summaries

When a format is required, it must be described explicitly.

Example:
Return file modifications using the following structure:

<file_changes>
<file>
<path>relative/path/to/file.ts</path>
<content>
...file contents...
</content>
</file>
</file_changes>


---

# Define Success Criteria

A prompt should describe what constitutes a successful result.

Success criteria may include:

- tests pass
- acceptance criteria satisfied
- architecture rules followed
- verification commands succeed

This helps the agent evaluate whether the task has been completed correctly.

---

# Avoid Ambiguity

Prompts should avoid vague language.

Avoid phrases such as:

- "improve this"
- "make it better"
- "optimize the code"

Instead, specify exactly what should change and why.

---

# Encourage Step-by-Step Reasoning

When tasks are complex, the prompt should encourage structured thinking.

Example instruction:
First analyze the task.
Then outline the approach.
Finally produce the implementation.


Structured reasoning often improves the quality of the output.

---

# Limit the Scope of Each Prompt

Prompts should focus on **one clear task**.

Avoid combining multiple unrelated objectives in a single prompt.

Large tasks should be decomposed into smaller prompts.

Focused prompts produce more reliable results.

---

# Prefer Explicit Instructions

If a behavior is required, state it directly.

Examples:

- "Write unit tests for the service."
- "Keep the route handler thin."
- "Do not modify unrelated files."

Explicit instructions reduce guesswork.

---

# Prevent Unwanted Behavior

Prompts should explicitly forbid risky or undesired actions.

Examples:

- do not modify files outside the task scope
- do not remove existing tests
- do not introduce unnecessary dependencies
- do not rewrite unrelated modules

These guardrails prevent unintended side effects.

---

# Request Documentation Artifacts

Prompts should request documentation artifacts when work is completed.

Typical artifacts include:

- implementation summary
- verification notes
- files modified
- risk notes

This ensures the system produces useful documentation automatically.

---

# Encourage Self-Verification

Prompts should instruct the agent to verify its own work.

Example:
Before completing the task, confirm that:

all acceptance criteria are satisfied

tests pass

verification commands succeed


Self-verification improves reliability.

---

# Prefer Deterministic Output

Prompts should aim for deterministic outputs whenever possible.

Avoid prompts that allow wide variation in responses.

Clear formatting instructions and constraints help ensure consistent results.

---

# Avoid Excessive Prompt Length

Prompts should contain enough context to complete the task but avoid unnecessary verbosity.

Very long prompts can reduce clarity and model performance.

Provide:

- relevant context
- clear instructions
- defined output format

Avoid including unrelated information.

---

# Reuse Established Patterns

When similar tasks have been completed previously, prompts should encourage reuse of existing patterns.

Consistency across the system improves maintainability.

Agents should prefer solutions that match the existing architecture and coding style.

---

# Final Rule

A good prompt should make it easy for the agent to answer four questions:

1. What is the task?
2. What constraints must be followed?
3. What output format is required?
4. How will success be verified?

If a prompt clearly answers those questions, it is likely to produce reliable results.