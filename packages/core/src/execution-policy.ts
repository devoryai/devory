import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const MODULE_DIR =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export const EXECUTION_POLICY_VERSION = "execution-policy-v1" as const;
export const EXECUTION_POLICY_FILENAME = "execution-policy.json" as const;
export const EXECUTION_POLICY_WORKSPACE_PATH = path.join(
  "config",
  EXECUTION_POLICY_FILENAME
);

export const VALID_POLICY_ESCALATION_BEHAVIORS = [
  "allow",
  "require_approval",
  "halt_and_escalate",
  "fallback_to_defaults",
] as const;

export type PolicyEscalationBehavior =
  (typeof VALID_POLICY_ESCALATION_BEHAVIORS)[number];

export interface ExecutionCommandPolicy {
  allow: string[];
  require_approval: string[];
  forbid: string[];
}

export interface ExecutionFilesystemPolicy {
  writable_roots: string[];
  read_only_roots: string[];
  require_approval_outside_writable_roots: boolean;
}

export interface ExecutionNetworkPolicy {
  allow: boolean;
  allowed_hosts: string[];
  require_approval_for_hosts: string[];
}

export interface ExecutionPackageInstallPolicy {
  allow: boolean;
  allowed_managers: string[];
  require_approval: boolean;
}

export interface ExecutionTestPolicy {
  allow: boolean;
  allowed_commands: string[];
  require_approval_commands: string[];
}

export interface ExecutionPolicyEscalation {
  unmatched_command: PolicyEscalationBehavior;
  out_of_policy_action: PolicyEscalationBehavior;
  invalid_policy: PolicyEscalationBehavior;
}

export interface ExecutionPolicyManifest {
  version: typeof EXECUTION_POLICY_VERSION;
  commands: ExecutionCommandPolicy;
  filesystem: ExecutionFilesystemPolicy;
  network: ExecutionNetworkPolicy;
  package_installs: ExecutionPackageInstallPolicy;
  test_execution: ExecutionTestPolicy;
  approval_required_actions: string[];
  forbidden_actions: string[];
  escalation: ExecutionPolicyEscalation;
}

export interface ExecutionPolicyManifestOverrides {
  commands?: Partial<ExecutionCommandPolicy>;
  filesystem?: Partial<ExecutionFilesystemPolicy>;
  network?: Partial<ExecutionNetworkPolicy>;
  package_installs?: Partial<ExecutionPackageInstallPolicy>;
  test_execution?: Partial<ExecutionTestPolicy>;
  approval_required_actions?: string[];
  forbidden_actions?: string[];
  escalation?: Partial<ExecutionPolicyEscalation>;
}

export interface ExecutionPolicyResolution {
  policy: ExecutionPolicyManifest;
  applied_layers: Array<"shipped-defaults" | "workspace-config" | "run-override">;
  workspace_config_path: string | null;
}

const DEFAULTS_PATH = path.join(MODULE_DIR, "defaults", EXECUTION_POLICY_FILENAME);
const VALID_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(normalized)];
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeEscalationBehavior(
  value: unknown
): PolicyEscalationBehavior | undefined {
  return typeof value === "string" &&
    (VALID_POLICY_ESCALATION_BEHAVIORS as readonly string[]).includes(value)
    ? (value as PolicyEscalationBehavior)
    : undefined;
}

function normalizeAllowedManagers(value: unknown): string[] | undefined {
  const values = asStringArray(value);
  if (!values) return undefined;
  const normalized = values.filter((entry) =>
    (VALID_MANAGERS as readonly string[]).includes(entry)
  );
  return normalized.length > 0 ? normalized : [];
}

export function normalizeExecutionPolicyOverrides(
  value: unknown
): ExecutionPolicyManifestOverrides {
  if (!isRecord(value)) {
    throw new Error("devory: execution policy config must be a JSON object");
  }

  const overrides: ExecutionPolicyManifestOverrides = {};

  if (isRecord(value.commands)) {
    overrides.commands = {};
    const allow = asStringArray(value.commands.allow);
    const requireApproval = asStringArray(value.commands.require_approval);
    const forbid = asStringArray(value.commands.forbid);
    if (allow) overrides.commands.allow = allow;
    if (requireApproval) overrides.commands.require_approval = requireApproval;
    if (forbid) overrides.commands.forbid = forbid;
  }

  if (isRecord(value.filesystem)) {
    overrides.filesystem = {};
    const writableRoots = asStringArray(value.filesystem.writable_roots);
    const readOnlyRoots = asStringArray(value.filesystem.read_only_roots);
    const outsideApproval = asBoolean(
      value.filesystem.require_approval_outside_writable_roots
    );
    if (writableRoots) overrides.filesystem.writable_roots = writableRoots;
    if (readOnlyRoots) overrides.filesystem.read_only_roots = readOnlyRoots;
    if (outsideApproval !== undefined) {
      overrides.filesystem.require_approval_outside_writable_roots = outsideApproval;
    }
  }

  if (isRecord(value.network)) {
    overrides.network = {};
    const allow = asBoolean(value.network.allow);
    const allowedHosts = asStringArray(value.network.allowed_hosts);
    const approvalHosts = asStringArray(value.network.require_approval_for_hosts);
    if (allow !== undefined) overrides.network.allow = allow;
    if (allowedHosts) overrides.network.allowed_hosts = allowedHosts;
    if (approvalHosts) overrides.network.require_approval_for_hosts = approvalHosts;
  }

  if (isRecord(value.package_installs)) {
    overrides.package_installs = {};
    const allow = asBoolean(value.package_installs.allow);
    const managers = normalizeAllowedManagers(value.package_installs.allowed_managers);
    const requireApproval = asBoolean(value.package_installs.require_approval);
    if (allow !== undefined) overrides.package_installs.allow = allow;
    if (managers) overrides.package_installs.allowed_managers = managers;
    if (requireApproval !== undefined) {
      overrides.package_installs.require_approval = requireApproval;
    }
  }

  if (isRecord(value.test_execution)) {
    overrides.test_execution = {};
    const allow = asBoolean(value.test_execution.allow);
    const allowedCommands = asStringArray(value.test_execution.allowed_commands);
    const approvalCommands = asStringArray(
      value.test_execution.require_approval_commands
    );
    if (allow !== undefined) overrides.test_execution.allow = allow;
    if (allowedCommands) overrides.test_execution.allowed_commands = allowedCommands;
    if (approvalCommands) {
      overrides.test_execution.require_approval_commands = approvalCommands;
    }
  }

  const approvalRequiredActions = asStringArray(value.approval_required_actions);
  if (approvalRequiredActions) {
    overrides.approval_required_actions = approvalRequiredActions;
  }

  const forbiddenActions = asStringArray(value.forbidden_actions);
  if (forbiddenActions) {
    overrides.forbidden_actions = forbiddenActions;
  }

  if (isRecord(value.escalation)) {
    overrides.escalation = {};
    const unmatched = normalizeEscalationBehavior(value.escalation.unmatched_command);
    const outOfPolicy = normalizeEscalationBehavior(
      value.escalation.out_of_policy_action
    );
    const invalidPolicy = normalizeEscalationBehavior(value.escalation.invalid_policy);
    if (unmatched) overrides.escalation.unmatched_command = unmatched;
    if (outOfPolicy) overrides.escalation.out_of_policy_action = outOfPolicy;
    if (invalidPolicy) overrides.escalation.invalid_policy = invalidPolicy;
  }

  return overrides;
}

export function applyExecutionPolicyOverrides(
  base: ExecutionPolicyManifest,
  overrides: ExecutionPolicyManifestOverrides
): ExecutionPolicyManifest {
  return {
    ...base,
    commands: {
      ...base.commands,
      ...overrides.commands,
    },
    filesystem: {
      ...base.filesystem,
      ...overrides.filesystem,
    },
    network: {
      ...base.network,
      ...overrides.network,
    },
    package_installs: {
      ...base.package_installs,
      ...overrides.package_installs,
    },
    test_execution: {
      ...base.test_execution,
      ...overrides.test_execution,
    },
    approval_required_actions:
      overrides.approval_required_actions ?? base.approval_required_actions,
    forbidden_actions: overrides.forbidden_actions ?? base.forbidden_actions,
    escalation: {
      ...base.escalation,
      ...overrides.escalation,
    },
  };
}

export function loadDefaultExecutionPolicy(): ExecutionPolicyManifest {
  const raw = fs.readFileSync(DEFAULTS_PATH, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const overrides = normalizeExecutionPolicyOverrides(parsed);

  const base: ExecutionPolicyManifest = {
    version: EXECUTION_POLICY_VERSION,
    commands: {
      allow: [],
      require_approval: [],
      forbid: [],
    },
    filesystem: {
      writable_roots: ["."],
      read_only_roots: [".git"],
      require_approval_outside_writable_roots: true,
    },
    network: {
      allow: false,
      allowed_hosts: [],
      require_approval_for_hosts: ["*"],
    },
    package_installs: {
      allow: false,
      allowed_managers: [],
      require_approval: true,
    },
    test_execution: {
      allow: true,
      allowed_commands: [],
      require_approval_commands: [],
    },
    approval_required_actions: [
      "write_outside_workspace",
      "network_access",
      "package_install",
    ],
    forbidden_actions: ["destructive_delete", "privilege_escalation"],
    escalation: {
      unmatched_command: "require_approval",
      out_of_policy_action: "halt_and_escalate",
      invalid_policy: "fallback_to_defaults",
    },
  };

  return applyExecutionPolicyOverrides(base, overrides);
}

export function loadWorkspaceExecutionPolicy(
  factoryRoot: string
): ExecutionPolicyManifestOverrides | null {
  const configPath = path.join(factoryRoot, EXECUTION_POLICY_WORKSPACE_PATH);
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf-8");
  return normalizeExecutionPolicyOverrides(JSON.parse(raw) as unknown);
}

export function resolveExecutionPolicy(
  factoryRoot: string,
  runOverride?: unknown
): ExecutionPolicyResolution {
  let policy = loadDefaultExecutionPolicy();
  const appliedLayers: ExecutionPolicyResolution["applied_layers"] = [
    "shipped-defaults",
  ];
  const workspaceConfigPath = path.join(factoryRoot, EXECUTION_POLICY_WORKSPACE_PATH);

  const workspaceOverrides = loadWorkspaceExecutionPolicy(factoryRoot);
  if (workspaceOverrides) {
    policy = applyExecutionPolicyOverrides(policy, workspaceOverrides);
    appliedLayers.push("workspace-config");
  }

  if (runOverride !== undefined && runOverride !== null) {
    const normalizedOverride = normalizeExecutionPolicyOverrides(runOverride);
    policy = applyExecutionPolicyOverrides(policy, normalizedOverride);
    appliedLayers.push("run-override");
  }

  return {
    policy,
    applied_layers: appliedLayers,
    workspace_config_path: fs.existsSync(workspaceConfigPath)
      ? workspaceConfigPath
      : null,
  };
}

export function buildExecutionPolicyInjection(
  resolution: ExecutionPolicyResolution
): {
  policy: ExecutionPolicyManifest;
  injection_source: "agent-context";
  applied_layers: ExecutionPolicyResolution["applied_layers"];
  workspace_config_path: string | null;
} {
  return {
    policy: resolution.policy,
    injection_source: "agent-context",
    applied_layers: resolution.applied_layers,
    workspace_config_path: resolution.workspace_config_path,
  };
}
