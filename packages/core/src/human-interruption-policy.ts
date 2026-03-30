import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import type { TaskMeta } from "./parse.ts";
import type {
  HumanInterruptionLevel,
  HumanQuestionFallbackBehavior,
  HumanQuestionInputMode,
} from "./human-question.ts";

const MODULE_DIR =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export const HUMAN_INTERRUPTION_POLICY_VERSION = "human-interruption-policy-v1" as const;
export const HUMAN_INTERRUPTION_POLICY_FILENAME = "human-interruption-policy.json" as const;
export const HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH = path.join(
  "config",
  HUMAN_INTERRUPTION_POLICY_FILENAME
);

export const VALID_HUMAN_NOTIFICATION_MODES = ["immediate", "digest"] as const;
export type HumanNotificationMode = (typeof VALID_HUMAN_NOTIFICATION_MODES)[number];

export const VALID_HUMAN_POLICY_THRESHOLD_KEYS = [
  "ambiguity",
  "confirmation",
  "approval",
  "destructive_change",
  "credentials",
  "external_side_effect",
] as const;
export type HumanPolicyThresholdKey = (typeof VALID_HUMAN_POLICY_THRESHOLD_KEYS)[number];

export interface HumanInterruptionPolicy {
  version: typeof HUMAN_INTERRUPTION_POLICY_VERSION;
  default_interruption_level: HumanInterruptionLevel;
  default_input_mode: HumanQuestionInputMode;
  allowed_input_modes: HumanQuestionInputMode[];
  default_fallback_behavior: HumanQuestionFallbackBehavior;
  timeout_seconds: number;
  timeout_on_expiry: HumanQuestionFallbackBehavior;
  notification_mode: HumanNotificationMode;
  digest_cadence_minutes: number | null;
  interruption_thresholds: Record<HumanPolicyThresholdKey, HumanInterruptionLevel>;
}

export interface HumanInterruptionPolicyResolution {
  policy: HumanInterruptionPolicy;
  applied_layers: Array<"shipped-defaults" | "workspace-config" | "task-frontmatter">;
  workspace_config_path: string | null;
}

export interface HumanInterruptionPolicyOverrides {
  default_interruption_level?: HumanInterruptionLevel;
  default_input_mode?: HumanQuestionInputMode;
  allowed_input_modes?: HumanQuestionInputMode[];
  default_fallback_behavior?: HumanQuestionFallbackBehavior;
  timeout_seconds?: number;
  timeout_on_expiry?: HumanQuestionFallbackBehavior;
  notification_mode?: HumanNotificationMode;
  digest_cadence_minutes?: number | null;
  interruption_thresholds?: Partial<Record<HumanPolicyThresholdKey, HumanInterruptionLevel>>;
}

const DEFAULTS_PATH = path.join(MODULE_DIR, "defaults", HUMAN_INTERRUPTION_POLICY_FILENAME);
const VALID_INTERRUPTION_LEVELS = ["level_1", "level_2", "level_3"] as const;
const VALID_INPUT_MODES = ["local-api", "cli", "digest"] as const;
const VALID_FALLBACK_BEHAVIORS = [
  "continue-other-work",
  "pause-affected-lane",
  "halt-run",
  "assume-default",
  "skip-task",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEnum<T extends readonly string[]>(
  value: unknown,
  validValues: T
): T[number] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return (validValues as readonly string[]).includes(normalized)
    ? (normalized as T[number])
    : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeNullablePositiveInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  const normalized = normalizePositiveInteger(value);
  return normalized ?? undefined;
}

function normalizeInputModes(value: unknown): HumanQuestionInputMode[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => normalizeEnum(item, VALID_INPUT_MODES))
    .filter((item): item is HumanQuestionInputMode => item !== null);
  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

export function normalizeHumanInterruptionPolicyOverrides(
  value: unknown
): HumanInterruptionPolicyOverrides {
  if (!isRecord(value)) {
    throw new Error("devory: human interruption policy config must be a JSON object");
  }

  const overrides: HumanInterruptionPolicyOverrides = {};

  const defaultInterruptionLevel = normalizeEnum(
    value.default_interruption_level,
    VALID_INTERRUPTION_LEVELS
  );
  if (defaultInterruptionLevel) {
    overrides.default_interruption_level = defaultInterruptionLevel;
  }

  const defaultInputMode = normalizeEnum(value.default_input_mode, VALID_INPUT_MODES);
  if (defaultInputMode) {
    overrides.default_input_mode = defaultInputMode;
  }

  const allowedInputModes = normalizeInputModes(value.allowed_input_modes);
  if (allowedInputModes) {
    overrides.allowed_input_modes = allowedInputModes;
  }

  const defaultFallbackBehavior = normalizeEnum(
    value.default_fallback_behavior,
    VALID_FALLBACK_BEHAVIORS
  );
  if (defaultFallbackBehavior) {
    overrides.default_fallback_behavior = defaultFallbackBehavior;
  }

  const timeoutSeconds = normalizePositiveInteger(value.timeout_seconds);
  if (timeoutSeconds !== null) {
    overrides.timeout_seconds = timeoutSeconds;
  }

  const timeoutOnExpiry = normalizeEnum(value.timeout_on_expiry, VALID_FALLBACK_BEHAVIORS);
  if (timeoutOnExpiry) {
    overrides.timeout_on_expiry = timeoutOnExpiry;
  }

  const notificationMode = normalizeEnum(value.notification_mode, VALID_HUMAN_NOTIFICATION_MODES);
  if (notificationMode) {
    overrides.notification_mode = notificationMode;
  }

  const digestCadenceMinutes = normalizeNullablePositiveInteger(value.digest_cadence_minutes);
  if (digestCadenceMinutes !== undefined) {
    overrides.digest_cadence_minutes = digestCadenceMinutes;
  }

  if (isRecord(value.interruption_thresholds)) {
    const thresholdOverrides: Partial<Record<HumanPolicyThresholdKey, HumanInterruptionLevel>> = {};
    for (const key of VALID_HUMAN_POLICY_THRESHOLD_KEYS) {
      const normalized = normalizeEnum(value.interruption_thresholds[key], VALID_INTERRUPTION_LEVELS);
      if (normalized) {
        thresholdOverrides[key] = normalized;
      }
    }
    if (Object.keys(thresholdOverrides).length > 0) {
      overrides.interruption_thresholds = thresholdOverrides;
    }
  }

  return overrides;
}

export function applyHumanInterruptionPolicyOverrides(
  base: HumanInterruptionPolicy,
  overrides: HumanInterruptionPolicyOverrides
): HumanInterruptionPolicy {
  const policy: HumanInterruptionPolicy = {
    ...base,
    interruption_thresholds: {
      ...base.interruption_thresholds,
      ...overrides.interruption_thresholds,
    },
  };

  if (overrides.default_interruption_level) {
    policy.default_interruption_level = overrides.default_interruption_level;
  }
  if (overrides.default_input_mode) {
    policy.default_input_mode = overrides.default_input_mode;
  }
  if (overrides.allowed_input_modes) {
    policy.allowed_input_modes = overrides.allowed_input_modes;
  }
  if (overrides.default_fallback_behavior) {
    policy.default_fallback_behavior = overrides.default_fallback_behavior;
  }
  if (overrides.timeout_seconds !== undefined) {
    policy.timeout_seconds = overrides.timeout_seconds;
  }
  if (overrides.timeout_on_expiry) {
    policy.timeout_on_expiry = overrides.timeout_on_expiry;
  }
  if (overrides.notification_mode) {
    policy.notification_mode = overrides.notification_mode;
  }
  if (overrides.digest_cadence_minutes !== undefined) {
    policy.digest_cadence_minutes = overrides.digest_cadence_minutes;
  }

  if (!policy.allowed_input_modes.includes(policy.default_input_mode)) {
    policy.allowed_input_modes = [...policy.allowed_input_modes, policy.default_input_mode];
  }

  if (policy.notification_mode === "immediate") {
    policy.digest_cadence_minutes = null;
  }

  return policy;
}

export function loadDefaultHumanInterruptionPolicy(): HumanInterruptionPolicy {
  const raw = fs.readFileSync(DEFAULTS_PATH, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const normalized = normalizeHumanInterruptionPolicyOverrides(parsed);

  const base: HumanInterruptionPolicy = {
    version: HUMAN_INTERRUPTION_POLICY_VERSION,
    default_interruption_level: "level_1",
    default_input_mode: "local-api",
    allowed_input_modes: ["local-api", "cli", "digest"],
    default_fallback_behavior: "continue-other-work",
    timeout_seconds: 1800,
    timeout_on_expiry: "assume-default",
    notification_mode: "digest",
    digest_cadence_minutes: 30,
    interruption_thresholds: {
      ambiguity: "level_1",
      confirmation: "level_1",
      approval: "level_2",
      destructive_change: "level_3",
      credentials: "level_3",
      external_side_effect: "level_2",
    },
  };

  return applyHumanInterruptionPolicyOverrides(base, normalized);
}

export function loadWorkspaceHumanInterruptionPolicy(
  factoryRoot: string
): HumanInterruptionPolicyOverrides | null {
  const filePath = path.join(factoryRoot, HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(
      `devory: failed to parse ${HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return normalizeHumanInterruptionPolicyOverrides(parsed);
}

export function getTaskHumanInterruptionPolicyOverrides(
  meta: Partial<TaskMeta>
): HumanInterruptionPolicyOverrides {
  const overrides: HumanInterruptionPolicyOverrides = {};

  const defaultInterruptionLevel = normalizeEnum(
    meta.human_default_interruption_level,
    VALID_INTERRUPTION_LEVELS
  );
  if (defaultInterruptionLevel) {
    overrides.default_interruption_level = defaultInterruptionLevel;
  }

  const defaultInputMode = normalizeEnum(meta.human_default_input_mode, VALID_INPUT_MODES);
  if (defaultInputMode) {
    overrides.default_input_mode = defaultInputMode;
  }

  const allowedInputModes = normalizeInputModes(meta.human_allowed_input_modes);
  if (allowedInputModes) {
    overrides.allowed_input_modes = allowedInputModes;
  }

  const defaultFallbackBehavior = normalizeEnum(
    meta.human_default_fallback_behavior,
    VALID_FALLBACK_BEHAVIORS
  );
  if (defaultFallbackBehavior) {
    overrides.default_fallback_behavior = defaultFallbackBehavior;
  }

  const timeoutSeconds = normalizePositiveInteger(meta.human_timeout_seconds);
  if (timeoutSeconds !== null) {
    overrides.timeout_seconds = timeoutSeconds;
  }

  const timeoutOnExpiry = normalizeEnum(meta.human_timeout_on_expiry, VALID_FALLBACK_BEHAVIORS);
  if (timeoutOnExpiry) {
    overrides.timeout_on_expiry = timeoutOnExpiry;
  }

  const notificationMode = normalizeEnum(
    meta.human_notification_mode,
    VALID_HUMAN_NOTIFICATION_MODES
  );
  if (notificationMode) {
    overrides.notification_mode = notificationMode;
  }

  const digestCadenceMinutes = normalizeNullablePositiveInteger(meta.human_digest_cadence_minutes);
  if (digestCadenceMinutes !== undefined) {
    overrides.digest_cadence_minutes = digestCadenceMinutes;
  }

  const thresholdOverrides: Partial<Record<HumanPolicyThresholdKey, HumanInterruptionLevel>> = {};
  for (const key of VALID_HUMAN_POLICY_THRESHOLD_KEYS) {
    const fieldName = `human_threshold_${key}` as keyof TaskMeta;
    const normalized = normalizeEnum(meta[fieldName], VALID_INTERRUPTION_LEVELS);
    if (normalized) {
      thresholdOverrides[key] = normalized;
    }
  }
  if (Object.keys(thresholdOverrides).length > 0) {
    overrides.interruption_thresholds = thresholdOverrides;
  }

  return overrides;
}

export function resolveHumanInterruptionPolicy(
  factoryRoot: string,
  meta: Partial<TaskMeta> = {}
): HumanInterruptionPolicyResolution {
  let policy = loadDefaultHumanInterruptionPolicy();
  const appliedLayers: HumanInterruptionPolicyResolution["applied_layers"] = ["shipped-defaults"];
  const workspaceConfigPath = path.join(factoryRoot, HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH);

  const workspaceOverrides = loadWorkspaceHumanInterruptionPolicy(factoryRoot);
  if (workspaceOverrides) {
    policy = applyHumanInterruptionPolicyOverrides(policy, workspaceOverrides);
    appliedLayers.push("workspace-config");
  }

  const taskOverrides = getTaskHumanInterruptionPolicyOverrides(meta);
  if (Object.keys(taskOverrides).length > 0) {
    policy = applyHumanInterruptionPolicyOverrides(policy, taskOverrides);
    appliedLayers.push("task-frontmatter");
  }

  return {
    policy,
    applied_layers: appliedLayers,
    workspace_config_path: fs.existsSync(workspaceConfigPath) ? workspaceConfigPath : null,
  };
}
