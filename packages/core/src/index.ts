/**
 * @devory/core — public API
 *
 * Shared types, parsing utilities, and path configuration
 * for the AI Dev Factory monorepo.
 */

export { parseFrontmatter } from "./parse.ts";
export type { TaskMeta, ParseResult } from "./parse.ts";
export {
  factoryPaths,
  findFactoryContextDir,
  resolveFactoryEnvironment,
  resolveFactoryMode,
  resolveFactoryRoot,
} from "./factory-environment.ts";
export type {
  FactoryEnvironment,
  FactoryMode,
  FactoryPaths,
  FactoryRootSource,
} from "./factory-environment.ts";
