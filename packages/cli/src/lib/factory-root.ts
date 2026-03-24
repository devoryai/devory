/**
 * packages/cli/src/lib/factory-root.ts
 *
 * Backward-compatible re-export of the shared factory environment resolver.
 */

export {
  factoryPaths,
  findFactoryContextDir,
  resolveFactoryRoot,
} from "@devory/core";
export type {
  FactoryPaths,
  FactoryRootSource,
} from "@devory/core";
export type FactoryRootResult = {
  root: string;
  source: import("@devory/core").FactoryRootSource;
};
