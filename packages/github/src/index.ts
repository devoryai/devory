/**
 * packages/github/src/index.ts
 *
 * Public API surface of @devory/github.
 *
 * All exports are pure functions or typed constants — no filesystem side
 * effects except where explicitly documented (action-helpers.ts writes to
 * GITHUB_OUTPUT / GITHUB_ENV / GITHUB_STEP_SUMMARY).
 */

// ── Branch helpers ──────────────────────────────────────────────────────────
export {
  buildBranchName,
  branchPrefix,
  slugify,
} from "./lib/branch-helpers.ts";
export type { BranchResult } from "./lib/branch-helpers.ts";

// ── PR helpers ──────────────────────────────────────────────────────────────
export {
  buildPrTitle,
  buildPrBody,
  buildPrMetadata,
  commitType,
  taskScope,
} from "./lib/pr-helpers.ts";
export type { PrMetadata } from "./lib/pr-helpers.ts";

// ── GitHub Actions helpers ──────────────────────────────────────────────────
export {
  setOutput,
  setOutputs,
  setEnv,
  appendStepSummary,
  isGitHubActions,
  getRunId,
  getRepoSlug,
} from "./lib/action-helpers.ts";

// ── PR creation (gated) ──────────────────────────────────────────────────────
export {
  canCreatePr,
  prCreateBlockedReason,
  buildGhCreateArgs,
  createPr,
} from "./lib/pr-create.ts";
export type { PrCreateOptions, PrCreateResult } from "./lib/pr-create.ts";

// ── External intake adapters ────────────────────────────────────────────────
export { fetchGitHubIssue, isGitHubIssueUrl } from "./lib/issue-adapter.ts";
export {
  extractAcceptanceCriteria,
  filterPlanningComments,
} from "./lib/issue-content-extractor.ts";
