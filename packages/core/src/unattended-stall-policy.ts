import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const MODULE_DIR =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export const UNATTENDED_STALL_POLICY_VERSION =
  "unattended-stall-policy-v1" as const;
export const UNATTENDED_STALL_POLICY_FILENAME =
  "unattended-stall-policy.json" as const;
export const UNATTENDED_STALL_POLICY_WORKSPACE_PATH = path.join(
  "config",
  UNATTENDED_STALL_POLICY_FILENAME
);

export interface UnattendedStallPolicy {
  version: typeof UNATTENDED_STALL_POLICY_VERSION;
  heartbeat_stale_after_ms: number;
  heartbeat_missing_after_ms: number;
  progress_stalled_after_ms: number;
  waiting_progress_grace_ms: number;
  looping_event_window: number;
  looping_event_threshold: number;
  repeated_failure_without_progress_threshold: number;
}

export type UnattendedStallPolicyOverrides = Partial<
  Omit<UnattendedStallPolicy, "version">
>;

export interface UnattendedStallPolicyResolution {
  policy: UnattendedStallPolicy;
  applied_layers: Array<"shipped-defaults" | "workspace-config" | "run-override">;
  workspace_config_path: string | null;
}

const DEFAULTS_PATH = path.join(
  MODULE_DIR,
  "defaults",
  UNATTENDED_STALL_POLICY_FILENAME
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function normalizeUnattendedStallPolicyOverrides(
  value: unknown
): UnattendedStallPolicyOverrides {
  if (!isRecord(value)) {
    throw new Error("devory: unattended stall policy config must be a JSON object");
  }

  const overrides: UnattendedStallPolicyOverrides = {};
  const keys = [
    "heartbeat_stale_after_ms",
    "heartbeat_missing_after_ms",
    "progress_stalled_after_ms",
    "waiting_progress_grace_ms",
    "looping_event_window",
    "looping_event_threshold",
    "repeated_failure_without_progress_threshold",
  ] as const;

  for (const key of keys) {
    const normalized = normalizePositiveInteger(value[key]);
    if (normalized !== undefined) {
      overrides[key] = normalized;
    }
  }

  return overrides;
}

export function applyUnattendedStallPolicyOverrides(
  base: UnattendedStallPolicy,
  overrides: UnattendedStallPolicyOverrides
): UnattendedStallPolicy {
  return {
    ...base,
    ...overrides,
    version: UNATTENDED_STALL_POLICY_VERSION,
  };
}

export function loadDefaultUnattendedStallPolicy(): UnattendedStallPolicy {
  return JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf-8")) as UnattendedStallPolicy;
}

export function loadWorkspaceUnattendedStallPolicy(
  factoryRoot: string
): UnattendedStallPolicyOverrides | null {
  const filePath = path.join(factoryRoot, UNATTENDED_STALL_POLICY_WORKSPACE_PATH);
  if (!fs.existsSync(filePath)) return null;
  return normalizeUnattendedStallPolicyOverrides(
    JSON.parse(fs.readFileSync(filePath, "utf-8"))
  );
}

export function resolveUnattendedStallPolicy(
  factoryRoot: string | null,
  runOverrides: UnattendedStallPolicyOverrides = {}
): UnattendedStallPolicyResolution {
  const base = loadDefaultUnattendedStallPolicy();
  let policy = base;
  const applied_layers: UnattendedStallPolicyResolution["applied_layers"] = [
    "shipped-defaults",
  ];
  let workspace_config_path: string | null = null;

  if (factoryRoot) {
    const workspace = loadWorkspaceUnattendedStallPolicy(factoryRoot);
    if (workspace) {
      policy = applyUnattendedStallPolicyOverrides(policy, workspace);
      applied_layers.push("workspace-config");
      workspace_config_path = path.join(
        factoryRoot,
        UNATTENDED_STALL_POLICY_WORKSPACE_PATH
      );
    }
  }

  if (Object.keys(runOverrides).length > 0) {
    policy = applyUnattendedStallPolicyOverrides(policy, runOverrides);
    applied_layers.push("run-override");
  }

  return {
    policy,
    applied_layers,
    workspace_config_path,
  };
}
