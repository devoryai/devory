/**
 * packages/github/src/lib/branch-helpers.ts
 *
 * Pure helpers for deriving branch names from factory task metadata.
 * No filesystem access. Depends only on @devory/core types.
 *
 * Design rule: if the task already declares a `branch` field, use it.
 * Otherwise derive deterministically from id + title so names are
 * stable across invocations.
 */

import type { TaskMeta } from "@devory/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BranchResult {
  /** The derived or confirmed branch name */
  branch: string;
  /**
   * "task-meta" — the task's `branch` field was used as-is.
   * "derived"   — branch was constructed from id + title slug.
   */
  source: "task-meta" | "derived";
  /** Advisory messages, e.g. unusual characters that were stripped */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Branch-prefix table
// Maps task `type` to the branch prefix segment.
// ---------------------------------------------------------------------------

const BRANCH_PREFIX_MAP: Record<string, string> = {
  feature: "feat",
  feat: "feat",
  bugfix: "fix",
  bug: "fix",
  fix: "fix",
  refactor: "refactor",
  chore: "chore",
  documentation: "docs",
  docs: "docs",
  test: "test",
  tests: "test",
  perf: "perf",
  performance: "perf",
};

/** Map a task type to its branch prefix. Unknown types default to "task". */
export function branchPrefix(taskType: string | undefined): string {
  const t = (taskType ?? "").toLowerCase().trim();
  return BRANCH_PREFIX_MAP[t] ?? "task";
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

/**
 * Convert an arbitrary string to a branch-safe slug.
 * - Lowercased
 * - Non-alphanumeric runs replaced with single hyphens
 * - Leading/trailing hyphens stripped
 * - Truncated to maxLen characters
 */
export function slugify(s: string, maxLen = 50): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Derive a branch name from task metadata.
 *
 * Resolution order:
 *  1. `meta.branch` — used as-is if present and non-empty
 *  2. `task/<prefix>/<id>-<title-slug>` derived from id + title
 *  3. `task/<id>` if title is empty
 */
export function buildBranchName(meta: Partial<TaskMeta>): BranchResult {
  const warnings: string[] = [];

  // Case 1: task declares its own branch name
  if (typeof meta.branch === "string" && meta.branch.trim()) {
    return { branch: meta.branch.trim(), source: "task-meta", warnings };
  }

  const id = typeof meta.id === "string" ? meta.id.trim() : "";
  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  const prefix = branchPrefix(typeof meta.type === "string" ? meta.type : undefined);

  const titleSlug = slugify(title, 40);

  // Case 2: id + title slug
  if (id && titleSlug) {
    const branch = `${prefix}/${id}-${titleSlug}`;
    return { branch, source: "derived", warnings };
  }

  // Case 3: id only (unusual — warn)
  if (id) {
    warnings.push("task title is empty; branch slug uses id only");
    return { branch: `${prefix}/${id}`, source: "derived", warnings };
  }

  // Fallback: should not happen in a valid task
  warnings.push("task has no id or title; using fallback branch name");
  return { branch: "task/unnamed", source: "derived", warnings };
}
