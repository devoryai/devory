/**
 * packages/core/src/feature-flags.ts
 *
 * Feature flags for Devory — controls opt-in functionality like governance repo mode.
 *
 * Precedence (highest to lowest):
 *   1. Environment variables
 *   2. .devory/feature-flags.json in factory root
 *   3. Defaults (all flags off)
 *
 * All flags default to false — every feature is opt-in.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevoryFeatureFlags {
  /**
   * When true, Devory reads/writes governance assets (tasks, doctrine, profiles,
   * runs, audit events) from the governance repo instead of the working repo.
   * Requires .devory/governance.json binding to be present.
   * Default: false (opt-in).
   */
  governance_repo_enabled: boolean;
}

export type FeatureFlagSource = "env-var" | "config-file" | "default";

export interface ResolvedFeatureFlags {
  flags: DevoryFeatureFlags;
  /** Where the flags were loaded from. */
  source: FeatureFlagSource;
  /** Absolute path to the flags file, if loaded from file. */
  file_path?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLAGS_FILENAME = "feature-flags.json";
const FLAGS_DIR = ".devory";

const DEFAULTS: DevoryFeatureFlags = {
  governance_repo_enabled: false,
};

// ---------------------------------------------------------------------------
// Environment variable helpers
// ---------------------------------------------------------------------------

function readEnvFlag(envKey: string): boolean | null {
  const raw = process.env[envKey];
  if (raw === undefined) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1") return true;
  if (trimmed === "false" || trimmed === "0") return false;
  // Unrecognized value — ignore and fall through to next source
  return null;
}

function resolveFromEnv(): Partial<DevoryFeatureFlags> {
  const overrides: Partial<DevoryFeatureFlags> = {};
  const govEnabled = readEnvFlag("DEVORY_GOVERNANCE_REPO_ENABLED");
  if (govEnabled !== null) overrides.governance_repo_enabled = govEnabled;
  return overrides;
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

function parseFlagsFile(filePath: string): Partial<DevoryFeatureFlags> {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const result: Partial<DevoryFeatureFlags> = {};
    if (typeof obj.governance_repo_enabled === "boolean") {
      result.governance_repo_enabled = obj.governance_repo_enabled;
    }
    return result;
  } catch {
    // Missing file, invalid JSON, or unreadable — return empty (use defaults)
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load feature flags for the given factory root.
 *
 * Synchronous — acceptable at startup; do not call in hot paths.
 * Never throws. Returns defaults on any error.
 */
export function loadFeatureFlags(factoryRoot: string): ResolvedFeatureFlags {
  const envOverrides = resolveFromEnv();

  // If any flag was set via env var, env wins (partial override — other flags still from file/defaults)
  const flagsFilePath = path.join(factoryRoot, FLAGS_DIR, FLAGS_FILENAME);

  let fileFlags: Partial<DevoryFeatureFlags> = {};
  let fileExists = false;
  try {
    fileExists = fs.existsSync(flagsFilePath);
    if (fileExists) {
      fileFlags = parseFlagsFile(flagsFilePath);
    }
  } catch {
    // Swallow — treat as missing
  }

  const merged: DevoryFeatureFlags = {
    ...DEFAULTS,
    ...fileFlags,
    ...envOverrides, // env vars always win
  };

  // Determine source for reporting (reflects the highest-priority source that contributed)
  const hasEnvOverrides = Object.keys(envOverrides).length > 0;
  const source: FeatureFlagSource = hasEnvOverrides
    ? "env-var"
    : fileExists
      ? "config-file"
      : "default";

  return {
    flags: merged,
    source,
    file_path: fileExists ? flagsFilePath : undefined,
  };
}

/**
 * Build the flags file path for a given factory root.
 * Useful for `devory config` output and `devory migrate`.
 */
export function featureFlagsFilePath(factoryRoot: string): string {
  return path.join(factoryRoot, FLAGS_DIR, FLAGS_FILENAME);
}
