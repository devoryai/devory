# Code Style Guide

## Purpose

This document defines the code style expectations for all Saltware projects.

Consistent style improves readability, maintainability, and collaboration across the codebase.

Agents generating or modifying code must follow these conventions whenever possible.

---

# Core Style Philosophy

Code should be:

- readable
- predictable
- consistent
- easy to maintain

Clarity is more important than cleverness.

Future engineers should be able to understand the intent of the code quickly.

---

# Language Standards

Projects primarily use **TypeScript**.

TypeScript should be used in **strict mode whenever possible**.

Avoid implicit types when clarity is important.

Prefer explicit types for:

- function parameters
- return values
- public interfaces
- shared data structures

Example:

```ts
function createEvent(title: string, date: Date): Event

# File Naming

Files should use clear, descriptive names.

Preferred formats:

kebab-case for filenames

descriptive names that reflect purpose

Examples:
create-event.service.ts
events.repository.ts
events.routes.ts
event-validation.ts

Avoid vague names such as:
utils.ts
helpers.ts
misc.ts

Unless the file truly contains general utilities.

# Function Naming

Function names should describe what the function does.

Prefer:
createEvent()
updateServicePlan()
validateEventInput()

Avoid vague names such as:
process()
handle()
runTask()

Names should communicate intent.

# Variable Naming

Variables should use clear and descriptive names.

Prefer:
eventTitle
serviceDate
userId
eventRepository

Avoid single-letter variables except in very small scopes such as loops.

Example of acceptable use:
for (let i = 0; i < items.length; i++)

Outside of those contexts, prefer descriptive names.

# Constants

Constants should be clearly defined and named.

Prefer uppercase with underscores for global constants.

Example:
MAX_RETRY_ATTEMPTS
DEFAULT_TIMEOUT_MS

Local constants may follow standard camelCase.

# Function Size

Functions should remain small and focused.

Guidelines:

aim for functions under ~30 lines when practical

avoid functions that perform multiple unrelated tasks

extract helper functions when complexity grows

Small functions improve readability and testability.

# Module Responsibilities

Each file or module should have a clear responsibility.

Avoid modules that mix unrelated logic.

Examples of clear responsibilities:

validation

domain services

database access

routing

Separation of responsibilities improves maintainability.

# Imports

Imports should be organized clearly.

Preferred order:

external libraries

internal modules

local files

Example:
import express from "express"

import { createEventService } from "../services/create-event.service"

import { validateEventInput } from "./event-validation"

Avoid deeply nested or unclear import structures.

# Error Handling

Errors should be handled explicitly.

Avoid silent failures.

Error messages should include useful context when possible.

Example:
throw new Error("Event creation failed: missing event date")

Clear errors simplify debugging.

# Comments

Comments should explain why, not what.

Avoid comments that simply restate the code.

Bad example:
// increment the counter
counter++

Good example:
// increment retry counter to prevent infinite retry loops
retryCount++

Use comments to explain non-obvious decisions.

# Avoid Dead Code

Unused code should be removed.

Avoid leaving:

commented-out blocks

unused variables

unused imports

Dead code makes the system harder to understand.

# Formatting

Formatting should remain consistent.

General guidelines:

use consistent indentation

keep lines reasonably short

avoid deeply nested code

Readable formatting improves maintainability.

Automated formatting tools may be used where appropriate.

# Logging

Logs should provide useful operational information.

Logs should include:

meaningful messages

relevant identifiers

useful context

Avoid excessive logging or logging sensitive information.

# Testing Conventions

Tests should follow the same readability and clarity principles.

Test files should be named clearly.

Examples:
events.service.test.ts
event-validation.test.ts

Tests should describe behavior clearly.

# Consistency Across the Codebase

Consistency is more important than personal preference.

When modifying existing code:

follow the style already used in the surrounding code

avoid introducing inconsistent patterns

Consistency reduces cognitive overhead.

# Final Rule

Code should be easy for another engineer to read, understand, and modify without confusion.

If a piece of code feels difficult to understand, it should be simplified.