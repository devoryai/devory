/**
 * packages/cli/src/index.ts
 *
 * Public API surface of @devory/cli.
 * Re-exports the types and pure functions that are useful to other packages
 * or to tests that want to exercise CLI logic without spawning processes.
 */

export { COMMANDS } from "./registry.ts";
export type { CommandSpec } from "./registry.ts";

// Shared workspace mutation APIs — call these directly instead of spawning scripts
export {
  createTask,
  moveTask,
  applyReviewAction,
  applyLocalGovernanceCommand,
  buildTaskFilename,
  buildTaskSkeleton,
  buildReviewArtifact,
  ACTION_STAGE_MAP,
  checkTransition,
  reviewActionToStage,
  rewriteStatus,
  insertAgentIntoFrontmatter,
  REVIEW_ACTIONS,
  validateReviewAction,
  validateRequiredFields,
  LIFECYCLE_STAGES,
  LIFECYCLE_DIR_MAP,
  VALID_TRANSITIONS,
} from "./lib/workspace.ts";
export type {
  CreateTaskArgs,
  CreateTaskResult,
  MoveTaskArgs,
  MoveTaskResult,
  ApplyReviewActionArgs,
  ApplyReviewActionResult,
  LifecycleStage,
  ReviewAction,
  TransitionCheck,
} from "./lib/workspace.ts";

export { buildRootHelp, buildCommandHelp, helpFor } from "./help.ts";

export {
  parseArgs as parseTaskNewArgs,
  buildInvocation as buildTaskNewInvocation,
} from "./commands/task-new.ts";
export type { TaskNewArgs } from "./commands/task-new.ts";

export {
  parseArgs as parseTaskMoveArgs,
  buildInvocation as buildTaskMoveInvocation,
} from "./commands/task-move.ts";
export type { TaskMoveArgs } from "./commands/task-move.ts";

export {
  parseArgs as parseTaskValidateArgs,
  buildInvocation as buildTaskValidateInvocation,
} from "./commands/task-validate.ts";
export type { TaskValidateArgs } from "./commands/task-validate.ts";

export {
  parseArgs as parseRunArgs,
  buildInvocation as buildRunInvocation,
} from "./commands/run.ts";
export type { RunArgs } from "./commands/run.ts";

export {
  buildConfigReport,
  formatConfigReport,
} from "./commands/config.ts";
export type { ConfigReport } from "./commands/config.ts";

export {
  parseArgs as parsePrPrepArgs,
  buildInvocation as buildPrPrepInvocation,
} from "./commands/pr-prep.ts";
export type { PrPrepArgs } from "./commands/pr-prep.ts";

export {
  parseArgs as parsePrCreateArgs,
} from "./commands/pr-create.ts";
export type { PrCreateArgs } from "./commands/pr-create.ts";

export {
  parseArgs as parseImproveArgs,
  buildInvocation as buildImproveInvocation,
  SIGNAL_TYPES as IMPROVE_SIGNAL_TYPES,
} from "./commands/improve.ts";
export type {
  ImproveArgs,
  ImproveSignalType,
} from "./commands/improve.ts";

export {
  parseArgs as parseDoctorArgs,
  runChecks as runDoctorChecks,
  checkTaskStages,
  checkStandardsFile,
  checkRuntimeConfig,
} from "./commands/doctor.ts";
export type { DoctorArgs } from "./commands/doctor.ts";

export {
  evaluateCloudCommandReadiness,
  formatCloudCommandReadinessLine,
} from "./commands/governance.ts";
export type { CloudCommandReadiness } from "./commands/governance.ts";
