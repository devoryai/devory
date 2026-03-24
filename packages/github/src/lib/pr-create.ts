/**
 * packages/github/src/lib/pr-create.ts
 *
 * factory-071: Gated PR creation helper.
 *
 * Creates a GitHub PR via the `gh` CLI (https://cli.github.com/).
 * The factory is read-only by default — this module only executes when
 * the caller explicitly passes `options.confirm: true` AND GITHUB_TOKEN
 * is present in the environment.
 *
 * Design constraints:
 *  - No side effects unless `options.confirm === true`
 *  - `GITHUB_TOKEN` must be present; absent token → PrCreateResult.ok false
 *  - `options.branch` must be supplied; the caller is responsible for
 *    ensuring the branch exists before calling createPr
 *  - Uses `gh pr create` — no direct GitHub API calls
 *  - All pure helper functions (canCreatePr, buildGhCreateArgs) are
 *    independently testable with no process spawning
 */

import { spawnSync } from "child_process";
import type { TaskMeta } from "@devory/core";
import { buildPrTitle, buildPrBody } from "./pr-helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrCreateOptions {
  /**
   * Must be explicitly true to create the PR.
   * When false or absent, createPr() is a no-op and returns ok: false.
   */
  confirm: boolean;
  /** Branch name to create the PR from. Required. */
  branch: string;
  /** Base branch. Defaults to "main". */
  base?: string;
  /** Override environment (injected for testing; defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

export interface PrCreateResult {
  ok: boolean;
  /** URL of the created PR, if successful. */
  prUrl?: string;
  /** Human-readable reason when ok is false. */
  error?: string;
  /** True when createPr was called without confirm: true (safe no-op). */
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Returns true when GITHUB_TOKEN is present in the given environment.
 * Does not verify the token is valid — only that it is non-empty.
 */
export function canCreatePr(env: NodeJS.ProcessEnv = process.env): boolean {
  const token = env["GITHUB_TOKEN"];
  return typeof token === "string" && token.trim().length > 0;
}

/**
 * Returns a human-readable reason why PR creation is not possible,
 * or null if creation should be allowed.
 */
export function prCreateBlockedReason(
  options: PrCreateOptions,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!options.confirm) {
    return "PR creation requires --confirm flag";
  }
  if (!options.branch || options.branch.trim().length === 0) {
    return "PR creation requires a branch name (--branch)";
  }
  if (!canCreatePr(env)) {
    return "GITHUB_TOKEN is not set — cannot create PR";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Invocation building
// ---------------------------------------------------------------------------

/**
 * Build the argument list for `gh pr create`.
 * Pure function — no side effects.
 */
export function buildGhCreateArgs(
  meta: Partial<TaskMeta>,
  taskBody: string,
  options: Pick<PrCreateOptions, "branch" | "base">
): string[] {
  const title = buildPrTitle(meta);
  const body = buildPrBody(meta, taskBody);
  const base = options.base?.trim() || "main";

  return [
    "pr",
    "create",
    "--title", title,
    "--body", body,
    "--head", options.branch,
    "--base", base,
  ];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Create a GitHub PR via `gh pr create`.
 *
 * Only executes when:
 *   1. `options.confirm === true`
 *   2. GITHUB_TOKEN is present in the environment
 *   3. `options.branch` is non-empty
 *
 * Returns `{ ok: false, skipped: true }` when any guard fails.
 * Returns `{ ok: true, prUrl }` on success.
 * Returns `{ ok: false, error }` on gh execution failure.
 */
export function createPr(
  meta: Partial<TaskMeta>,
  taskBody: string,
  options: PrCreateOptions
): PrCreateResult {
  const env = options.env ?? process.env;

  const blockedReason = prCreateBlockedReason(options, env);
  if (blockedReason) {
    return { ok: false, skipped: true, error: blockedReason };
  }

  const args = buildGhCreateArgs(meta, taskBody, options);

  const result = spawnSync("gh", args, {
    encoding: "utf-8",
    env,
    timeout: 30_000,
  });

  if (result.error) {
    return {
      ok: false,
      error: `Failed to spawn gh: ${result.error.message}. Is the gh CLI installed?`,
    };
  }

  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    return {
      ok: false,
      error: (stderr || stdout || `gh pr create exited with code ${result.status}`).slice(0, 500),
    };
  }

  const prUrl = (result.stdout ?? "").trim();
  return { ok: true, prUrl: prUrl || undefined };
}
