/**
 * packages/core/src/routing-policy.ts
 *
 * Execution routing policy config model and loader.
 *
 * Defines the RoutingPolicy that governs how Devory routes tasks to providers:
 * local-only mode, cloud permission, confirmation requirements, cost ceilings,
 * and preferred provider selection.
 *
 * Follows the same shipped-defaults → workspace-config resolution pattern used
 * by execution-policy.ts and human-interruption-policy.ts.
 *
 * Workspace config: config/routing-policy.json
 * Shipped defaults: packages/core/src/defaults/routing-policy.json
 *
 * Entry points: resolveRoutingPolicy(), DEFAULT_ROUTING_POLICY
 */

import * as fs from "fs";
import * as path from "path";
import { resolveCoreDefaultsDir } from "./defaults-path.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ROUTING_POLICY_VERSION = "routing-policy-v1" as const;
export const ROUTING_POLICY_FILENAME = "routing-policy.json" as const;
export const ROUTING_POLICY_WORKSPACE_PATH = path.join(
  "config",
  ROUTING_POLICY_FILENAME
);

/**
 * Valid execution preference values — mirrored from execution-router.ts
 * to avoid a circular import. The string literals are identical and compatible.
 */
export const VALID_ROUTING_POLICY_PREFERENCES = [
  "auto",
  "prefer_local",
  "force_local",
  "allow_cloud",
  "force_cloud",
  "deterministic_only",
] as const;

export type RoutingPolicyPreference =
  (typeof VALID_ROUTING_POLICY_PREFERENCES)[number];

/**
 * Valid provider class IDs — mirrored from provider-registry.ts
 * to avoid a circular import.
 */
export const VALID_ROUTING_POLICY_PROVIDER_CLASSES = [
  "deterministic",
  "local_ollama",
  "cloud_premium",
] as const;

export type RoutingPolicyProviderClass =
  (typeof VALID_ROUTING_POLICY_PROVIDER_CLASSES)[number];

// ---------------------------------------------------------------------------
// Policy model
// ---------------------------------------------------------------------------

/**
 * Routing policy controlling how Devory selects execution providers.
 *
 * Applied during routing (routeExecution) and binding (bindExecution) to
 * enforce local-first defaults, restrict cloud access, and require
 * confirmation or cost caps before cloud execution.
 *
 * All fields have safe defaults. Missing or partial configs degrade to
 * the shipped defaults — never to permissive behavior.
 */
export interface RoutingPolicy {
  /**
   * Default execution preference when no explicit preference is provided.
   * Defaults to "auto" (local-first heuristics).
   */
  default_preference: RoutingPolicyPreference;
  /**
   * Whether cloud execution is permitted at all.
   * When false, cloud providers are treated as unavailable regardless
   * of other settings. Overrides allow_fallback_to_cloud.
   */
  cloud_allowed: boolean;
  /**
   * When true, only local providers may be used.
   * Equivalent to cloud_allowed=false; added as an explicit readable flag
   * for sensitive workspace configurations.
   */
  local_only: boolean;
  /**
   * When true, tasks routed to cloud require explicit user confirmation
   * before execution proceeds. Routing records cloud_confirmation_required=true.
   */
  require_cloud_confirmation: boolean;
  /**
   * Maximum estimated cloud cost per run in USD.
   * When the dry-run estimate exceeds this, a policy warning is produced.
   * Null disables the ceiling check.
   */
  max_estimated_cloud_cost_usd: number | null;
  /**
   * Preferred local provider class. Influences local provider selection
   * when multiple local providers are available.
   * Null uses registry ordering.
   */
  preferred_local_provider: RoutingPolicyProviderClass | null;
  /**
   * Preferred cloud provider class. Influences cloud provider selection.
   * Null uses registry ordering.
   */
  preferred_cloud_provider: RoutingPolicyProviderClass | null;
  /**
   * Ordered preferred local concrete targets beneath the selected provider class.
   * Entries are target ids such as "ollama:qwen2.5-coder:14b".
   * Empty array uses resolver defaults.
   */
  preferred_local_targets: string[];
  /**
   * Ordered preferred cloud concrete targets beneath the selected provider class.
   * Entries are target ids such as "cloud:claude-sonnet-4-6".
   * Empty array uses resolver defaults.
   */
  preferred_cloud_targets: string[];
  /**
   * Explicitly enabled concrete targets.
   * Empty array means "no explicit override" rather than "disable all".
   */
  enabled_targets: string[];
  /**
   * Explicitly disabled concrete targets.
   * Disabled targets are never selected, even when preferred.
   */
  disabled_targets: string[];
  /**
   * When true, the workspace is flagged as sensitive.
   * Currently a scaffold — reflected in routing explanations and constrains
   * cloud logging assumptions. Does not yet trigger additional access controls.
   */
  sensitive_workspace_mode: boolean;
  /**
   * When false, routing is not allowed to fall back to cloud if local is
   * unavailable. Local unavailability causes a stop rather than cloud escalation.
   * When true (default), the routing engine may fall back to cloud on local failure.
   */
  allow_fallback_to_cloud: boolean;
}

// ---------------------------------------------------------------------------
// Overrides type (all fields optional — for partial workspace config)
// ---------------------------------------------------------------------------

export type RoutingPolicyOverrides = Partial<Omit<RoutingPolicy, never>>;

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export interface RoutingPolicyResolution {
  policy: RoutingPolicy;
  applied_layers: Array<"shipped-defaults" | "workspace-config">;
  workspace_config_path: string | null;
}

// ---------------------------------------------------------------------------
// Shipped default (conservative safe baseline)
// ---------------------------------------------------------------------------

/**
 * Conservative baseline applied before any file is read.
 * Matches the shipped defaults/routing-policy.json.
 */
export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  default_preference: "auto",
  cloud_allowed: true,
  local_only: false,
  require_cloud_confirmation: true,
  max_estimated_cloud_cost_usd: null,
  preferred_local_provider: null,
  preferred_cloud_provider: null,
  preferred_local_targets: [],
  preferred_cloud_targets: [],
  enabled_targets: [],
  disabled_targets: [],
  sensitive_workspace_mode: false,
  allow_fallback_to_cloud: true,
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNullablePositiveNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && isFinite(value) && value >= 0) return value;
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizePreference(
  value: unknown
): RoutingPolicyPreference | undefined {
  if (
    typeof value === "string" &&
    (VALID_ROUTING_POLICY_PREFERENCES as readonly string[]).includes(value)
  ) {
    return value as RoutingPolicyPreference;
  }
  return undefined;
}

function normalizeProviderClass(
  value: unknown
): RoutingPolicyProviderClass | null | undefined {
  if (value === null) return null;
  if (
    typeof value === "string" &&
    (VALID_ROUTING_POLICY_PROVIDER_CLASSES as readonly string[]).includes(value)
  ) {
    return value as RoutingPolicyProviderClass;
  }
  return undefined;
}

/**
 * Normalizes a raw JSON value into RoutingPolicyOverrides.
 * Unknown or invalid fields are silently ignored.
 * Throws only when the top-level value is not an object.
 */
export function normalizeRoutingPolicyOverrides(
  value: unknown
): RoutingPolicyOverrides {
  if (!isRecord(value)) {
    throw new Error("devory: routing policy config must be a JSON object");
  }

  const overrides: RoutingPolicyOverrides = {};

  const defaultPreference = normalizePreference(value.default_preference);
  if (defaultPreference !== undefined) {
    overrides.default_preference = defaultPreference;
  }

  const cloudAllowed = asBoolean(value.cloud_allowed);
  if (cloudAllowed !== undefined) overrides.cloud_allowed = cloudAllowed;

  const localOnly = asBoolean(value.local_only);
  if (localOnly !== undefined) overrides.local_only = localOnly;

  const requireConfirmation = asBoolean(value.require_cloud_confirmation);
  if (requireConfirmation !== undefined) {
    overrides.require_cloud_confirmation = requireConfirmation;
  }

  const maxCost = asNullablePositiveNumber(value.max_estimated_cloud_cost_usd);
  if (maxCost !== undefined) overrides.max_estimated_cloud_cost_usd = maxCost;

  const preferredLocal = normalizeProviderClass(value.preferred_local_provider);
  if (preferredLocal !== undefined) {
    overrides.preferred_local_provider = preferredLocal;
  }

  const preferredCloud = normalizeProviderClass(value.preferred_cloud_provider);
  if (preferredCloud !== undefined) {
    overrides.preferred_cloud_provider = preferredCloud;
  }

  const preferredLocalTargets = asStringArray(value.preferred_local_targets);
  if (preferredLocalTargets !== undefined) {
    overrides.preferred_local_targets = preferredLocalTargets;
  }

  const preferredCloudTargets = asStringArray(value.preferred_cloud_targets);
  if (preferredCloudTargets !== undefined) {
    overrides.preferred_cloud_targets = preferredCloudTargets;
  }

  const enabledTargets = asStringArray(value.enabled_targets);
  if (enabledTargets !== undefined) {
    overrides.enabled_targets = enabledTargets;
  }

  const disabledTargets = asStringArray(value.disabled_targets);
  if (disabledTargets !== undefined) {
    overrides.disabled_targets = disabledTargets;
  }

  const sensitiveMode = asBoolean(value.sensitive_workspace_mode);
  if (sensitiveMode !== undefined) {
    overrides.sensitive_workspace_mode = sensitiveMode;
  }

  const allowFallback = asBoolean(value.allow_fallback_to_cloud);
  if (allowFallback !== undefined) {
    overrides.allow_fallback_to_cloud = allowFallback;
  }

  return overrides;
}

// ---------------------------------------------------------------------------
// Apply overrides
// ---------------------------------------------------------------------------

/**
 * Merges overrides on top of a base policy.
 * Returns a new object; does not mutate base.
 */
export function applyRoutingPolicyOverrides(
  base: RoutingPolicy,
  overrides: RoutingPolicyOverrides
): RoutingPolicy {
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

const DEFAULTS_PATH = path.join(
  resolveCoreDefaultsDir(__dirname),
  ROUTING_POLICY_FILENAME
);

/**
 * Loads the shipped routing policy defaults from the bundled JSON file,
 * merged on top of the hardcoded baseline.
 */
export function loadDefaultRoutingPolicy(): RoutingPolicy {
  try {
    const raw = fs.readFileSync(DEFAULTS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const overrides = normalizeRoutingPolicyOverrides(parsed);
    return applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, overrides);
  } catch {
    // If the defaults file is missing or malformed, fall back to hardcoded baseline
    return { ...DEFAULT_ROUTING_POLICY };
  }
}

/**
 * Loads workspace-level routing policy overrides from config/routing-policy.json.
 * Returns null if the file does not exist.
 * Throws on malformed JSON.
 */
export function loadWorkspaceRoutingPolicy(
  factoryRoot: string
): RoutingPolicyOverrides | null {
  const configPath = path.join(factoryRoot, ROUTING_POLICY_WORKSPACE_PATH);
  if (!fs.existsSync(configPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(
      `devory: failed to parse ${ROUTING_POLICY_WORKSPACE_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return normalizeRoutingPolicyOverrides(parsed);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the effective routing policy for a factory root by merging:
 *   shipped-defaults → workspace-config
 *
 * Missing or partial configs degrade to shipped defaults.
 * Invalid JSON in workspace config is a hard error.
 */
export function resolveRoutingPolicy(
  factoryRoot: string
): RoutingPolicyResolution {
  let policy = loadDefaultRoutingPolicy();
  const appliedLayers: RoutingPolicyResolution["applied_layers"] = [
    "shipped-defaults",
  ];
  const workspaceConfigPath = path.join(
    factoryRoot,
    ROUTING_POLICY_WORKSPACE_PATH
  );

  const workspaceOverrides = loadWorkspaceRoutingPolicy(factoryRoot);
  if (workspaceOverrides && Object.keys(workspaceOverrides).length > 0) {
    policy = applyRoutingPolicyOverrides(policy, workspaceOverrides);
    appliedLayers.push("workspace-config");
  }

  // Invariant: local_only always implies cloud is disallowed
  if (policy.local_only) {
    policy = { ...policy, cloud_allowed: false, allow_fallback_to_cloud: false };
  }

  return {
    policy,
    applied_layers: appliedLayers,
    workspace_config_path: fs.existsSync(workspaceConfigPath)
      ? workspaceConfigPath
      : null,
  };
}

// ---------------------------------------------------------------------------
// Policy summary helpers
// ---------------------------------------------------------------------------

/**
 * Returns a compact human-readable summary of the active policy constraints.
 * Empty string when the policy is all defaults (no notable constraints).
 */
export function formatRoutingPolicySummary(policy: RoutingPolicy): string {
  const parts: string[] = [];

  if (policy.local_only) {
    parts.push("local-only mode");
  } else {
    if (policy.cloud_allowed !== DEFAULT_ROUTING_POLICY.cloud_allowed) {
      parts.push("cloud=disabled");
    }
    if (
      policy.allow_fallback_to_cloud !==
      DEFAULT_ROUTING_POLICY.allow_fallback_to_cloud
    ) {
      parts.push("no-cloud-fallback");
    }
    if (
      policy.require_cloud_confirmation !==
      DEFAULT_ROUTING_POLICY.require_cloud_confirmation
    ) {
      parts.push(
        policy.require_cloud_confirmation
          ? "cloud-confirmation-required"
          : "cloud-confirmation-disabled"
      );
    }
    if (policy.default_preference !== DEFAULT_ROUTING_POLICY.default_preference) {
      parts.push(`default=${policy.default_preference}`);
    }
    if (policy.max_estimated_cloud_cost_usd !== null) {
      parts.push(`max-cost=$${policy.max_estimated_cloud_cost_usd.toFixed(2)}`);
    }
    if (policy.preferred_local_targets.length > 0) {
      parts.push(`local-target=${policy.preferred_local_targets[0]}`);
    }
    if (policy.preferred_cloud_targets.length > 0) {
      parts.push(`cloud-target=${policy.preferred_cloud_targets[0]}`);
    }
    if (policy.sensitive_workspace_mode) parts.push("sensitive-workspace");
  }

  return parts.join(" | ");
}
