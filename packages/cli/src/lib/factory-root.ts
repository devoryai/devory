/**
 * packages/cli/src/lib/factory-root.ts
 *
 * Backward-compatible re-export of the shared factory environment resolver.
 */

export {
  factoryPaths,
  findFactoryContextDir,
  resolveFactoryRoot,
} from "../../../core/src/index.ts";
export type {
  FactoryPaths,
  FactoryRootSource,
} from "../../../core/src/index.ts";
export type FactoryRootResult = {
  root: string;
  source: import("../../../core/src/index.ts").FactoryRootSource;
};
