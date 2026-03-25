/**
 * packages/core/src/license.ts
 *
 * Tier detection and Pro feature gating for Devory.
 *
 * Tiers:
 *   Core  — no license key required; default baselines only; custom_rules ignored
 *   Pro   — license key enables custom_rules and baseline overrides
 *
 * Key resolution order:
 *   1. DEVORY_LICENSE_KEY environment variable
 *   2. .devory/license file in the factory root
 *   3. No key found → Core
 *
 * Network verification is stubbed — a real call will be wired once the
 * license service exists. Local validation (format check) runs synchronously
 * so Core tier never blocks on any network call.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = "core" | "pro";

/** Features gated behind Pro tier. */
export type ProFeature = "custom_rules" | "baseline_overrides" | "shared_doctrine" | "pr_gates";

export interface LicenseInfo {
  tier: Tier;
  /** Raw key value, if one was found */
  key?: string;
  /** Where the key was found */
  source?: "env" | "file";
  /** True when a key was found but failed local format validation */
  invalid?: boolean;
  /** Human-readable explanation of the tier decision */
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENV_VAR = "DEVORY_LICENSE_KEY";
const LICENSE_FILE = path.join(".devory", "license");

/**
 * Minimum length for a key to pass local format validation.
 * Keys will follow a `devory_<tier>_<random>` convention once the license
 * service is built; this floor rejects obvious junk values in the meantime.
 */
const MIN_KEY_LENGTH = 16;

// ---------------------------------------------------------------------------
// Tier detection
// ---------------------------------------------------------------------------

/**
 * Detect the current license tier.
 *
 * @param factoryRoot  Absolute path to the factory workspace root.
 *                     When omitted, file-based key detection is skipped.
 */
export function detectTier(factoryRoot?: string): LicenseInfo {
  // 1. Environment variable
  const envKey = process.env[ENV_VAR];
  if (envKey !== undefined) {
    return validateKey(envKey.trim(), "env");
  }

  // 2. .devory/license file
  if (factoryRoot) {
    const filePath = path.join(factoryRoot, LICENSE_FILE);
    if (fs.existsSync(filePath)) {
      const fileKey = fs.readFileSync(filePath, "utf-8").trim();
      return validateKey(fileKey, "file");
    }
  }

  // 3. No key — Core
  return {
    tier: "core",
    reason: "No license key found — running on Core tier",
  };
}

/**
 * Validate a raw key string and return the corresponding LicenseInfo.
 * Currently performs local format validation only.
 * Network verification is a no-op stub until the license service exists.
 */
function validateKey(key: string, source: "env" | "file"): LicenseInfo {
  if (!key || key.length < MIN_KEY_LENGTH) {
    return {
      tier: "core",
      key,
      source,
      invalid: true,
      reason: `License key from ${source === "env" ? "DEVORY_LICENSE_KEY" : ".devory/license"} is invalid (must be ≥ ${MIN_KEY_LENGTH} characters) — falling back to Core tier`,
    };
  }

  // TODO: when the license service ships, verify the key here (once, cached
  // locally in .devory/license-cache.json with an expiry timestamp).
  return {
    tier: "pro",
    key,
    source,
    reason: `License key found via ${source === "env" ? "DEVORY_LICENSE_KEY" : ".devory/license"} — Pro tier active`,
  };
}

// ---------------------------------------------------------------------------
// Feature gating
// ---------------------------------------------------------------------------

/**
 * Returns true if the given Pro feature is enabled for the current tier.
 * Call this at each Pro feature boundary instead of comparing tier directly.
 */
export function isFeatureEnabled(feature: ProFeature, info: LicenseInfo): boolean {
  // All Pro features require Pro tier. Teams features would extend this check.
  switch (feature) {
    case "custom_rules":
    case "baseline_overrides":
    case "shared_doctrine":
    case "pr_gates":
      return info.tier === "pro";
  }
}

/**
 * Produce a one-line advisory message shown to Core users when they have a
 * Pro-only field configured. Shown once per command invocation, not per file.
 */
export function tierGateMessage(feature: ProFeature): string {
  const featureLabel: Record<ProFeature, string> = {
    custom_rules: "custom_rules in devory.standards.yml",
    baseline_overrides: "baseline overrides",
    shared_doctrine: "shared doctrine",
    pr_gates: "PR gates",
  };
  return (
    `[devory] ${featureLabel[feature]} requires a Pro license — ` +
    `set DEVORY_LICENSE_KEY or create .devory/license to upgrade. ` +
    `This setting will be ignored on Core tier.`
  );
}
