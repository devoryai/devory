/**
 * @devory/core — public API
 *
 * Shared types, parsing utilities, path configuration,
 * engineering standards, and license tier detection.
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
export {
  loadStandards,
  loadBaseline,
  mergeStandards,
  resolveBaselinePath,
  serializeStandardsAsDoctrine,
  STANDARDS_FILENAME,
} from "./standards.ts";
export type {
  Standards,
  StandardsStack,
  StandardsTesting,
  StandardsArchitecture,
  StandardsCodeStyle,
  StandardsDoctrine,
  StandardsSource,
  StandardsSourceType,
  LoadedStandards,
} from "./standards.ts";
export {
  clearLicenseCache,
  clearLicenseToken,
  detectTier,
  getLicenseCacheFilePath,
  getLicenseFilePath,
  getLicenseStatus,
  isFeatureEnabled,
  tierGateMessage,
  writeLicenseToken,
} from "./license.ts";
export type { Tier, ProFeature, LicenseInfo, LicenseStatus } from "./license.ts";
