/**
 * packages/github/src/lib/action-helpers.ts
 *
 * Helpers for emitting outputs and environment variables in a GitHub Actions
 * step context.
 *
 * Two modes:
 *  - Live (default): writes to GITHUB_OUTPUT / GITHUB_ENV files per the
 *    Actions protocol.
 *  - Dry-run / test: returns the lines that *would* be written without any
 *    filesystem side effects.
 *
 * Reference:
 *   https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
 */

import * as fs from "fs";

// ---------------------------------------------------------------------------
// Output writing (GITHUB_OUTPUT)
// ---------------------------------------------------------------------------

/**
 * Set a step output value.  The `name=value` line is appended to the file
 * pointed to by the GITHUB_OUTPUT environment variable.
 *
 * @returns The line that was (or would be) written.
 */
export function setOutput(name: string, value: string): string {
  const line = `${name}=${value}`;
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, line + "\n", "utf-8");
  }
  return line;
}

/**
 * Set multiple step outputs at once.
 * @returns Array of `name=value` lines written.
 */
export function setOutputs(pairs: Record<string, string>): string[] {
  return Object.entries(pairs).map(([name, value]) => setOutput(name, value));
}

// ---------------------------------------------------------------------------
// Environment variable writing (GITHUB_ENV)
// ---------------------------------------------------------------------------

/**
 * Export an environment variable for subsequent steps.
 * Appends `NAME=VALUE` to the GITHUB_ENV file.
 *
 * @returns The line that was (or would be) written.
 */
export function setEnv(name: string, value: string): string {
  const line = `${name}=${value}`;
  const envFile = process.env.GITHUB_ENV;
  if (envFile) {
    fs.appendFileSync(envFile, line + "\n", "utf-8");
  }
  return line;
}

// ---------------------------------------------------------------------------
// Step summary (GITHUB_STEP_SUMMARY)
// ---------------------------------------------------------------------------

/**
 * Append markdown content to the GitHub Actions step summary page.
 *
 * @returns The content that was (or would be) written.
 */
export function appendStepSummary(markdown: string): string {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    fs.appendFileSync(summaryFile, markdown + "\n", "utf-8");
  }
  return markdown;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Returns true when running inside a GitHub Actions runner. */
export function isGitHubActions(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

/** Returns the current GitHub Actions run ID, or null when not in Actions. */
export function getRunId(): string | null {
  return process.env.GITHUB_RUN_ID ?? null;
}

/** Returns the repository slug (`owner/repo`), or null when not in Actions. */
export function getRepoSlug(): string | null {
  return process.env.GITHUB_REPOSITORY ?? null;
}
