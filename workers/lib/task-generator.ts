/**
 * workers/lib/task-generator.ts
 *
 * Factory-053: Pure task generation utilities for the intent planner.
 *
 * No filesystem access — all I/O is handled by callers.
 *
 * Exports:
 *  - IntentInput              raw input from a product intent request
 *  - IntentSpec               normalized, enriched form of IntentInput
 *  - GeneratedTaskSpec        structured task spec ready to render
 *  - IntentScope              "specific" | "broad" | "vague"
 *  - detectIntentType()       infer task type from a free-form description
 *  - deriveTaskTitle()        extract/normalize a title from a description
 *  - assessIntentClarity()    scope and clarity signals from a description
 *  - normalizeIntent()        build an IntentSpec from raw IntentInput
 *  - deriveAcceptanceCriteria() generate type-specific acceptance criteria
 *  - buildGeneratedTaskSpec() assemble a GeneratedTaskSpec from an IntentSpec
 *  - renderGeneratedTask()    render task markdown from a GeneratedTaskSpec
 *  - validateGeneratedContent() validate rendered content against the schema
 */

import {
  buildMinimalTaskDraftFixture,
  renderTaskMarkdown,
  parseFrontmatter,
  validateTask,
  type ValidationResult,
} from "@devory/core";
import { validateTask as validateTaskMeta } from "./task-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw input describing a product feature or intent. */
export interface IntentInput {
  /** Free-form description of the feature, bug, or work to be done. */
  description: string;
  /** Project this task belongs to, e.g. "harbor". */
  project: string;
  /**
   * Desired task ID, e.g. "harbor-055".
   * When absent, one is derived from the project and a title slug.
   */
  id?: string;
  /** Task type override. When absent, inferred from the description. */
  type?: string;
  /** Priority hint. Defaults to "medium". */
  priority?: string;
  /** Agent to assign. Defaults to "fullstack-builder". */
  agent?: string;
  /** Repository identifier. Defaults to ".". */
  repo?: string;
  /** Branch prefix. When absent, derived as "task/{id}". */
  branch?: string;
  /** Optional decomposition behavior hint for planners. */
  decomposition_hint?: "single-task" | "auto" | "decompose";
}

/** Estimated scope of an intent description. */
export type IntentScope = "specific" | "broad" | "vague";

/**
 * Normalized, enriched form of an IntentInput.
 * All derivation decisions are recorded here so callers can audit them.
 */
export interface IntentSpec {
  /** Cleaned description text. */
  description: string;
  /** Detected or overridden task type. */
  type: string;
  /** Detected title, derived from the first meaningful phrase. */
  suggestedTitle: string;
  /** Suggested priority inferred from intent language. */
  suggestedPriority: "high" | "medium" | "low";
  /** Suggested agent inferred from intent type. */
  suggestedAgent: string;
  /** Estimated scope: "specific" → 1 task, "broad" → decompose. */
  scope: IntentScope;
  /** Type signals that influenced the detected type. */
  typeSignals: string[];
  /** Warnings about clarity, ambiguity, or doctrine violations. */
  clarityWarnings: string[];
}

/** Structured task spec — one task ready to be rendered as markdown. */
export interface GeneratedTaskSpec {
  id: string;
  title: string;
  project: string;
  repo: string;
  branch: string;
  type: string;
  priority: string;
  agent: string;
  acceptanceCriteria: string[];
  verification: string[];
  /** Notes explaining planning decisions, included in the artifact. */
  doctrineNotes: string[];
}

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------

const TYPE_DETECTION_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  {
    type: "bugfix",
    pattern: /\b(fix|bug|broken|error|issue|crash|incorrect|wrong|failing|regression|patch)\b/i,
  },
  {
    type: "refactor",
    pattern: /\b(refactor|restructure|extract|rename|clean\s+up|simplify|reorgani[sz]e)\b/i,
  },
  {
    type: "documentation",
    pattern: /\b(document|docs|readme|changelog|guide|wiki|howto|write\s+up)\b/i,
  },
  {
    type: "test",
    pattern: /\b(add\s+tests?|write\s+tests?|test\s+coverage|spec|missing\s+tests?)\b/i,
  },
  {
    type: "feature",
    pattern:
      /\b(add|implement|build|create|introduce|enable|extend|integrate|define|scaffold|set\s*up)\b/i,
  },
];

/**
 * Infer a task type from a free-form description.
 * Returns the most specific type that matches (priority: bugfix > refactor >
 * documentation > test > feature) and the list of matched signals.
 */
export function detectIntentType(description: string): {
  type: string;
  signals: string[];
} {
  const signals: string[] = [];
  for (const { type, pattern } of TYPE_DETECTION_PATTERNS) {
    if (pattern.test(description)) signals.push(type);
  }

  const PRIORITY = ["bugfix", "refactor", "documentation", "test", "feature"];
  for (const p of PRIORITY) {
    if (signals.includes(p)) return { type: p, signals };
  }
  return { type: "feature", signals: ["feature (default)"] };
}

// ---------------------------------------------------------------------------
// Title derivation
// ---------------------------------------------------------------------------

/**
 * Extract a concise title from a free-form description.
 * Takes the first sentence, strips trailing punctuation, and truncates to
 * 80 characters.
 */
export function deriveTaskTitle(description: string): string {
  const cleaned = description.trim().replace(/\s+/g, " ");
  const firstSentence =
    cleaned.match(/^[^.!?\n]+/)?.[0]?.trim() ?? cleaned;
  const titled =
    firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
  return titled.length > 80 ? titled.slice(0, 77) + "..." : titled;
}

// ---------------------------------------------------------------------------
// Clarity and scope assessment
// ---------------------------------------------------------------------------

/** Patterns that suggest a vague / non-specific intent. */
const VAGUE_PATTERNS: RegExp[] = [
  /\b(improve|optimize|enhance|clean\s+up|better|faster|nicer|everything|the\s+whole|generally|overall)\b/i,
  /\b(fix\s+stuff|fix\s+things|update\s+everything|update\s+the\s+system)\b/i,
];

/** Patterns that suggest a broad (multi-concern) intent. */
const BROAD_PATTERN = /\b(and\s+also|as\s+well\s+as|and\s+additionally|and\s+then)\b/i;

/**
 * Assess the clarity and estimated scope of an intent description.
 * Returns:
 *   - scope: "vague" | "broad" | "specific"
 *   - warnings: human-readable strings for the planning artifact
 */
export function assessIntentClarity(description: string): {
  scope: IntentScope;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (description.trim().length < 15) {
    warnings.push(
      "Description is very short — add more detail to produce a well-formed task"
    );
    return { scope: "vague", warnings };
  }

  for (const pat of VAGUE_PATTERNS) {
    if (pat.test(description)) {
      warnings.push(
        "Description contains vague language — task-writing-standard requires specific outcomes"
      );
      break;
    }
  }

  // "broad" = likely multiple distinct concerns in one description
  const andCount = (description.match(/\b(and|also|as\s+well)\b/gi) ?? []).length;
  if (BROAD_PATTERN.test(description) || andCount >= 3) {
    warnings.push(
      "Description may cover multiple concerns — consider splitting into separate tasks"
    );
    const scope = warnings.some((w) => w.includes("vague")) ? "vague" : "broad";
    return { scope, warnings };
  }

  const scope = warnings.some((w) => w.includes("vague")) ? "vague" : "specific";
  return { scope, warnings };
}

function detectIntentPriority(description: string): "high" | "medium" | "low" {
  const text = description.toLowerCase();
  const highSignals = ["urgent", "blocking", "critical", "asap", "immediately", "broken"];
  const lowSignals = ["eventually", "nice to have", "low priority", "someday", "minor"];

  if (highSignals.some((signal) => text.includes(signal))) {
    return "high";
  }
  if (lowSignals.some((signal) => text.includes(signal))) {
    return "low";
  }
  return "medium";
}

function detectSuggestedAgent(type: string): string {
  if (type === "review" || type === "audit" || type === "docs-review") {
    return "reviewer";
  }
  if (type === "research" || type === "planning" || type === "requirements") {
    return "product-analyst";
  }
  return "fullstack-builder";
}

// ---------------------------------------------------------------------------
// Intent normalisation
// ---------------------------------------------------------------------------

/**
 * Build an IntentSpec from a raw IntentInput.
 * Applies type detection, title derivation, and clarity assessment.
 * Pure — no side effects.
 */
export function normalizeIntent(input: IntentInput): IntentSpec {
  const { type: detectedType, signals } = input.type
    ? { type: input.type, signals: [`override: ${input.type}`] }
    : detectIntentType(input.description);

  const suggestedTitle = deriveTaskTitle(input.description);
  const { scope, warnings } = assessIntentClarity(input.description);

  return {
    description: input.description.trim().replace(/\s+/g, " "),
    type: detectedType,
    suggestedTitle,
    suggestedPriority: detectIntentPriority(input.description),
    suggestedAgent: detectSuggestedAgent(detectedType),
    scope,
    typeSignals: signals,
    clarityWarnings: warnings,
  };
}

// ---------------------------------------------------------------------------
// Acceptance criteria
// ---------------------------------------------------------------------------

type CriteriaBuilder = (title: string) => string[];

const CRITERIA_BY_TYPE: Record<string, CriteriaBuilder> = {
  feature: (title) => [
    `- [ ] ${title} is implemented as described`,
    "- [ ] The implementation handles expected inputs correctly",
    "- [ ] Edge cases are handled or explicitly documented as out of scope",
    "- [ ] No code outside the intended scope was modified",
    "- [ ] Verification commands exit 0",
  ],
  bugfix: (title) => [
    `- [ ] The bug described in "${title}" is reproducible before the fix`,
    "- [ ] The fix resolves the issue without introducing regressions",
    "- [ ] All existing tests continue to pass",
    "- [ ] Verification commands exit 0",
  ],
  refactor: (title) => [
    `- [ ] Behaviour is unchanged after the refactor (${title})`,
    "- [ ] Code is cleaner and more maintainable",
    "- [ ] All existing tests continue to pass",
    "- [ ] No unrelated changes introduced",
  ],
  documentation: (title) => [
    `- [ ] Documentation for "${title}" is accurate and complete`,
    "- [ ] Examples or usage instructions are included where relevant",
    "- [ ] No broken links or formatting issues",
  ],
  test: (title) => [
    `- [ ] Tests for "${title}" are present and named clearly`,
    "- [ ] All new tests pass",
    "- [ ] Test coverage improves for the relevant area",
    "- [ ] No existing tests are weakened or removed",
  ],
};

const DEFAULT_CRITERIA: CriteriaBuilder = (title) => [
  `- [ ] ${title} is complete`,
  "- [ ] Verification commands exit 0",
  "- [ ] No unintended side effects introduced",
];

/**
 * Generate type-specific, actionable acceptance criteria for a task.
 */
export function deriveAcceptanceCriteria(type: string, title: string): string[] {
  const builder = CRITERIA_BY_TYPE[type] ?? DEFAULT_CRITERIA;
  return builder(title);
}

// ---------------------------------------------------------------------------
// Task spec assembly
// ---------------------------------------------------------------------------

/**
 * Derive a filesystem-safe ID from a project name and a title.
 * Example: ("harbor", "Add event validation") → "harbor-add-event-validation"
 */
export function deriveTaskId(project: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${project}-${slug}`;
}

/**
 * Assemble a GeneratedTaskSpec from a normalised IntentSpec and the original
 * IntentInput. Pure — no I/O.
 */
export function buildGeneratedTaskSpec(
  spec: IntentSpec,
  input: IntentInput,
  titleOverride?: string
): GeneratedTaskSpec {
  const title = titleOverride ?? spec.suggestedTitle;
  const id =
    input.id ?? deriveTaskId(input.project, title);
  const repo = input.repo ?? ".";
  const branch = input.branch ?? `task/${id}`;
  const priority = input.priority ?? spec.suggestedPriority;
  const agent = input.agent ?? spec.suggestedAgent;

  const doctrineNotes: string[] = [
    `Type detected: ${spec.type} (signals: ${spec.typeSignals.join(", ")})`,
    `Scope assessed: ${spec.scope}`,
    ...spec.clarityWarnings.map((w) => `Warning: ${w}`),
  ];

  return {
    id,
    title,
    project: input.project,
    repo,
    branch,
    type: spec.type,
    priority,
    agent,
    acceptanceCriteria: deriveAcceptanceCriteria(spec.type, title),
    verification: ["npm run test", "npm run build"],
    doctrineNotes,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a GeneratedTaskSpec as a valid task markdown file.
 * The result is ready to write directly to tasks/backlog/.
 */
export function renderGeneratedTask(
  spec: GeneratedTaskSpec,
  intentDescription: string
): string {
  return renderTaskMarkdown(
    buildMinimalTaskDraftFixture({
      draft_id: spec.id,
      title: spec.title,
      project: spec.project,
      repo: spec.repo,
      branch: spec.branch,
      type: spec.type,
      priority: spec.priority,
      status: "backlog",
      agent: spec.agent,
      verification: spec.verification,
      goal: spec.title,
      context: [
        `Generated from product intent: ${intentDescription}`,
        "Execution must include `FACTORY_CONTEXT.md` and follow doctrine in `doctrine/`.",
      ],
      acceptance_criteria: spec.acceptanceCriteria.map((entry) =>
        entry.replace(/^- \[ \]\s*/, "")
      ),
      expected_artifacts: [
        "Implementation changes in the target repository",
        "Updated verification evidence in the task summary or review notes",
      ],
      failure_conditions: [
        "Build fails",
        "Tests fail",
        "Implementation does not match the generated intent",
      ],
      reviewer_checklist: [
        "[ ] Implementation matches the described intent",
        "[ ] No unrelated changes introduced",
        "[ ] Verification commands pass",
      ],
    })
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the content of a generated task against the factory schema.
 * Returns the same ValidationResult type used throughout the factory.
 */
export function validateGeneratedContent(content: string): ValidationResult {
  const { meta } = parseFrontmatter(content);
  return validateTaskMeta(meta, "backlog");
}
