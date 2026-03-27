/**
 * packages/cli/src/index.ts
 *
 * Public API surface of @devory/cli.
 * Re-exports the types and pure functions that are useful to other packages
 * or to tests that want to exercise CLI logic without spawning processes.
 */

export { COMMANDS } from "./registry.ts";
export type { CommandSpec } from "./registry.ts";

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
  parseArgs as parseLicenseArgs,
  formatLicenseStatusReport,
} from "./commands/license.ts";
export type { LicenseArgs, LicenseSubcommand } from "./commands/license.ts";

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
