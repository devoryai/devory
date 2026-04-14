/**
 * workers/lib/planner-utils.ts
 *
 * Deterministic planning utilities for plan-task.ts (factory-025).
 *
 * All exported functions are pure (no I/O) so they can be tested in isolation
 * without touching the filesystem.
 *
 * Provides:
 *  - SubtaskTier           — shared type (moved here from plan-task.ts)
 *  - DecompositionMethod   — how subtask names were derived
 *  - assessTaskScope       — detect oversized or mixed-scope parent tasks
 *  - inferChildType        — map subtask name + tier to a valid task type
 *  - buildChildAcceptanceCriteria — tier-appropriate, actionable criteria
 *  - inheritVerification   — inherit/derive verification commands from parent
 *  - deriveSmartFallback   — type-aware fallback decomposition
 *  - detectMixedScope      — warn when subtask set spans many unrelated domains
 *  - buildDecompositionRationale — explain the decomposition decision
 */

import type { TaskMeta } from "./task-utils.js";

// ---------------------------------------------------------------------------
// SubtaskTier
// Defined here (not in plan-task.ts) so tests and other modules can import it.
// ---------------------------------------------------------------------------

/** 0 = setup/scaffold, 1 = implement (default), 2 = verify/test */
export type SubtaskTier = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// Decomposition method — records which source was used to derive subtask names.
// ---------------------------------------------------------------------------

export type DecompositionMethod =
  | "body-section"       // ## Subtasks or ## Decomposition section found in body
  | "frontmatter-hint"   // decomposition_hint frontmatter field used
  | "smart-fallback"     // type-specific fallback applied
  | "basic-fallback";    // generic setup/implement/verify used

// ---------------------------------------------------------------------------
// Scope assessment
//
// Produces deterministic signals about whether a task is appropriately sized.
// Uses file count, acceptance criteria count, and body section count as proxies.
// Thresholds are explicit constants — change them here to adjust sensitivity.
// ---------------------------------------------------------------------------

export interface ScopeAssessment {
  fileCount: number;
  acceptanceCriteriaCount: number;
  bodySectionCount: number;
  scopeLevel: "lean" | "moderate" | "large" | "oversized";
  warnings: string[];
}

// Thresholds: values *above* each level move to the next level.
const SCOPE_THRESHOLDS = {
  lean:     { files: 3,  criteria: 4,  sections: 4 },
  moderate: { files: 6,  criteria: 7,  sections: 6 },
  large:    { files: 10, criteria: 10, sections: 9 },
};

export function assessTaskScope(
  meta: Partial<TaskMeta>,
  body: string
): ScopeAssessment {
  const files = Array.isArray(meta.files_likely_affected)
    ? meta.files_likely_affected
    : [];
  const fileCount = files.length;

  // Count bullet items in the ## Acceptance Criteria section (if present).
  // No `m` flag: without it, `$` matches only end-of-string, so the lazy
  // `[\s\S]*?` correctly captures everything up to the next `\n##` heading
  // or the end of the string — rather than stopping at the first line end.
  const criteriaMatch = body.match(
    /(?:^|\n)##\s+Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  const criteriaText = criteriaMatch ? criteriaMatch[1] : "";
  const acceptanceCriteriaCount = (criteriaText.match(/^\s*[-*]\s+/gm) ?? []).length;

  // Count ## headings in body as a rough complexity proxy
  const bodySectionCount = (body.match(/^##\s+/gm) ?? []).length;

  const warnings: string[] = [];

  if (fileCount > SCOPE_THRESHOLDS.large.files) {
    warnings.push(
      `Task affects ${fileCount} files — scope is very broad; consider splitting by subsystem`
    );
  } else if (fileCount > SCOPE_THRESHOLDS.moderate.files) {
    warnings.push(`Task affects ${fileCount} files — verify this scope is intentional`);
  }

  if (acceptanceCriteriaCount > SCOPE_THRESHOLDS.large.criteria) {
    warnings.push(
      `Task has ${acceptanceCriteriaCount} acceptance criteria — consider splitting into separate tasks`
    );
  } else if (acceptanceCriteriaCount > SCOPE_THRESHOLDS.moderate.criteria) {
    warnings.push(
      `Task has ${acceptanceCriteriaCount} acceptance criteria — scope may be moderately complex`
    );
  }

  if (bodySectionCount > SCOPE_THRESHOLDS.large.sections) {
    warnings.push(
      `Task body has ${bodySectionCount} sections — task may span multiple distinct concerns`
    );
  }

  let scopeLevel: ScopeAssessment["scopeLevel"];
  if (
    fileCount > SCOPE_THRESHOLDS.large.files ||
    acceptanceCriteriaCount > SCOPE_THRESHOLDS.large.criteria ||
    bodySectionCount > SCOPE_THRESHOLDS.large.sections
  ) {
    scopeLevel = "oversized";
  } else if (
    fileCount > SCOPE_THRESHOLDS.moderate.files ||
    acceptanceCriteriaCount > SCOPE_THRESHOLDS.moderate.criteria ||
    bodySectionCount > SCOPE_THRESHOLDS.moderate.sections
  ) {
    scopeLevel = "large";
  } else if (
    fileCount > SCOPE_THRESHOLDS.lean.files ||
    acceptanceCriteriaCount > SCOPE_THRESHOLDS.lean.criteria ||
    bodySectionCount > SCOPE_THRESHOLDS.lean.sections
  ) {
    scopeLevel = "moderate";
  } else {
    scopeLevel = "lean";
  }

  return {
    fileCount,
    acceptanceCriteriaCount,
    bodySectionCount,
    scopeLevel,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Child task type inference
//
// Maps a subtask name + tier to a valid task type field value.
// Valid types per task-writing-standard: feature, bugfix, refactor, test, documentation
// ---------------------------------------------------------------------------

export type ChildTaskType =
  | "feature"
  | "refactor"
  | "test"
  | "documentation"
  | "subtask";

const CHILD_TYPE_PATTERNS: Array<{ type: ChildTaskType; pattern: RegExp }> = [
  {
    type: "test",
    pattern: /\b(test|spec|verify|validate|qa|assert|check)\b/i,
  },
  {
    type: "documentation",
    pattern: /\b(doc|docs|document|documentation|readme|changelog|wiki|guide|howto|write.up)\b/i,
  },
  {
    type: "refactor",
    pattern: /\b(refactor|extract|rename|clean|simplify|restructure|reorganise|reorganize)\b/i,
  },
  {
    type: "feature",
    pattern: /\b(implement|add|build|create|introduce|enable|extend|integrate|define|set.up|scaffold)\b/i,
  },
];

export function inferChildType(name: string, tier: SubtaskTier): ChildTaskType {
  // Tier 2 (verify) always maps to test
  if (tier === 2) return "test";

  for (const { type, pattern } of CHILD_TYPE_PATTERNS) {
    if (pattern.test(name)) return type;
  }

  // Tier 1 default = feature; tier 0 default = subtask (pure infrastructure)
  return tier === 1 ? "feature" : "subtask";
}

// ---------------------------------------------------------------------------
// Acceptance criteria builder
//
// Produces tier-appropriate, actionable acceptance criteria for a child task.
// More specific than the previous generic single-criterion template.
// ---------------------------------------------------------------------------

export function buildChildAcceptanceCriteria(
  name: string,
  tier: SubtaskTier
): string[] {
  const cap = capitalize(name);

  if (tier === 0) {
    return [
      `- [ ] ${cap} is in place with no errors`,
      `- [ ] Prerequisites for all dependent tasks are satisfied`,
      `- [ ] No new breaking changes introduced by this step`,
    ];
  }

  if (tier === 2) {
    return [
      `- [ ] All verification commands exit 0`,
      `- [ ] Tests are present and pass for the related implementation`,
      `- [ ] No regressions in existing functionality`,
    ];
  }

  // Tier 1 — implementation
  return [
    `- [ ] ${cap} works correctly for the expected inputs`,
    `- [ ] Edge cases are handled or explicitly documented as out of scope`,
    `- [ ] Implementation follows existing code conventions in this area`,
    `- [ ] No code outside the intended scope was modified`,
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Verification command inheritance
//
// Selects appropriate verification commands for a child task based on tier.
// Tier 2 (verify) inherits all parent commands.
// Tier 1 (implement) inherits only build/lint/compile commands.
// Tier 0 (setup) inherits nothing — nothing has been built yet.
// ---------------------------------------------------------------------------

export function inheritVerification(
  parentVerification: string[],
  tier: SubtaskTier
): string[] {
  if (parentVerification.length === 0) {
    // No parent commands — sensible tier-based defaults
    if (tier === 2) return ["npm run test", "npm run build"];
    if (tier === 1) return ["npm run build"];
    return [];
  }

  if (tier === 2) {
    // Verify tier inherits all parent verification commands
    return [...parentVerification];
  }

  if (tier === 1) {
    // Implement tier: inherit build/lint/compile/typecheck commands only,
    // not pure test commands. This avoids failing a test command before the
    // implementation tier is even complete.
    const buildCommands = parentVerification.filter(
      (cmd) =>
        /\b(build|lint|compile|typecheck|type-check|check)\b/i.test(cmd) &&
        !/\b(test|spec)\b/i.test(cmd)
    );
    return buildCommands;
  }

  // Tier 0 (setup): no verification commands
  return [];
}

// ---------------------------------------------------------------------------
// Smart fallback subtask decomposition
//
// Returns a type-appropriate decomposition when no explicit subtask list
// is provided. Better than the generic "setup, implement, verify" for tasks
// where the type is known.
// ---------------------------------------------------------------------------

// Subtask names are chosen so plan-task's tier classifier assigns the correct tier:
//   tier-0 keywords: setup, init, scaffold, configure, prepare, provision, bootstrap
//   tier-1 keywords: implement, add, build, create, introduce, extend (default)
//   tier-2 keywords: verify, test, validate, check, spec, qa, audit, assert
const TYPE_FALLBACKS: Record<string, string[]> = {
  feature: [
    "define data model or schema",
    "implement core logic",
    "add API or interface layer",
    "verify and test implementation",
  ],
  "feature-parent": [
    "define data model or schema",
    "implement core logic",
    "add API or interface layer",
    "verify and test implementation",
  ],
  epic: [
    "setup and scaffolding",
    "implement core feature",
    "add integration layer",
    "validate and verify",
  ],
  refactor: [
    "identify refactor scope and target",
    "apply refactor",
    "verify refactored code",
  ],
  bugfix: [
    "reproduce and document bug",
    "fix bug",
    "verify fix",
  ],
  documentation: [
    "draft documentation",
    "review documentation",
  ],
};

const BASIC_FALLBACK_NAMES = ["setup", "implement", "verify"];

export function deriveSmartFallback(meta: Partial<TaskMeta>): {
  names: string[];
  method: DecompositionMethod;
} {
  const taskType = (meta.type as string | undefined)?.toLowerCase().trim() ?? "";
  if (taskType && taskType in TYPE_FALLBACKS) {
    return {
      names: TYPE_FALLBACKS[taskType]!,
      method: "smart-fallback",
    };
  }
  return { names: BASIC_FALLBACK_NAMES, method: "basic-fallback" };
}

// ---------------------------------------------------------------------------
// Mixed-scope detection
//
// Detects when a planned subtask set spans very different technical domains.
// Used to produce a warning in the planning artifact when decomposition may
// need to be split across separate parent tasks.
// ---------------------------------------------------------------------------

const MIXED_SCOPE_DOMAIN_PATTERNS = [
  {
    domain: "frontend",
    pattern: /\b(frontend|ui|component|css|style|view|page|form|react|vue|angular)\b/i,
  },
  {
    domain: "backend",
    pattern: /\b(backend|api|server|database|db|model|migration|endpoint|route|controller|service)\b/i,
  },
  {
    domain: "infra",
    pattern: /\b(infra|deploy|ci|docker|kubernetes|k8s|terraform|pipeline|cloud)\b/i,
  },
  {
    domain: "docs",
    pattern: /\b(doc|document|readme|wiki|guide|changelog|howto)\b/i,
  },
];

export interface MixedScopeResult {
  domains: string[];
  mixed: boolean;
  warning: string | null;
}

export function detectMixedScope(subtaskNames: string[]): MixedScopeResult {
  const matchedDomains = new Set<string>();

  for (const name of subtaskNames) {
    for (const { domain, pattern } of MIXED_SCOPE_DOMAIN_PATTERNS) {
      if (pattern.test(name)) {
        matchedDomains.add(domain);
      }
    }
  }

  const domains = [...matchedDomains].sort();
  // Three or more distinct domains in a single parent task is a strong
  // mixed-scope signal. Two domains (e.g. backend + test) is common and fine.
  const mixed = domains.length >= 3;
  const warning = mixed
    ? `Subtask set spans ${domains.join(", ")} — consider splitting into separate parent tasks`
    : null;

  return { domains, mixed, warning };
}

// ---------------------------------------------------------------------------
// Decomposition rationale builder
//
// Produces a human-readable explanation of how subtasks were derived.
// Included in the planning artifact so the decision is inspectable later.
// ---------------------------------------------------------------------------

export function buildDecompositionRationale(
  method: DecompositionMethod,
  names: string[],
  parentType: string | undefined
): string {
  const nameList = names.map((n) => `"${n}"`).join(", ");

  switch (method) {
    case "body-section":
      return (
        `Subtasks were read from the ## Subtasks or ## Decomposition section ` +
        `in the parent task body: ${nameList}.`
      );
    case "frontmatter-hint":
      return (
        `Subtasks were derived from the decomposition_hint frontmatter field: ${nameList}.`
      );
    case "smart-fallback":
      return (
        `No explicit decomposition found. Type-specific decomposition applied ` +
        `for type "${parentType ?? "unknown"}": ${nameList}.`
      );
    case "basic-fallback":
      return (
        `No explicit decomposition found and no type-specific pattern matched. ` +
        `Generic setup/implement/verify decomposition used: ${nameList}.`
      );
  }
}
