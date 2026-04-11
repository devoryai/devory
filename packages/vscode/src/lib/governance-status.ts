import * as fs from "fs";
import * as path from "path";
import { loadFeatureFlags } from "../../../core/src/feature-flags.ts";
import {
  evaluateCloudCommandReadiness,
  formatCloudCommandReadinessLine,
  type CloudCommandReadiness,
} from "../../../cli/src/commands/governance.ts";

const BINDING_PATH = path.join(".devory", "governance.json");
const GOVERNANCE_CONFIG_PATH = path.join(".devory-governance", "config.json");

export type GovernanceIndicator = "ON" | "OFF" | "ERROR";

interface GovernanceBinding {
  governance_repo_path?: string;
  workspace_id?: string;
}

export interface GovernanceStatusSnapshot {
  indicator: GovernanceIndicator;
  governanceModeOn: boolean;
  factoryRoot: string;
  featureFlagEnabled: boolean;
  governanceRepoPath: string | null;
  governanceRepoReachable: boolean;
  workspaceId: string | null;
  cloudReadiness: CloudCommandReadiness;
  nextStep: string | null;
  errorMessage: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseBinding(bindingPath: string): GovernanceBinding | null {
  if (!fs.existsSync(bindingPath)) return null;
  const raw = fs.readFileSync(bindingPath, "utf-8");
  const parsed = asRecord(JSON.parse(raw));
  if (!parsed) return null;
  return {
    governance_repo_path:
      typeof parsed.governance_repo_path === "string"
        ? parsed.governance_repo_path
        : undefined,
    workspace_id:
      typeof parsed.workspace_id === "string"
        ? parsed.workspace_id
        : undefined,
  };
}

function buildNextStep(snapshot: {
  hasFactoryRoot: boolean;
  featureFlagEnabled: boolean;
  hasBinding: boolean;
  hasGovernanceRepoPath: boolean;
  governanceRepoReachable: boolean;
}): string | null {
  if (!snapshot.hasFactoryRoot) {
    return "Set devory.factoryRoot to your local Devory workspace path.";
  }
  if (!snapshot.hasBinding) {
    return "Run devory governance bind --governance-repo <path> from your workspace.";
  }
  if (!snapshot.hasGovernanceRepoPath || !snapshot.governanceRepoReachable) {
    return "Ensure .devory/governance.json points to a valid governance repo with .devory-governance/config.json.";
  }
  if (!snapshot.featureFlagEnabled) {
    return "Enable governance mode in .devory/feature-flags.json (governance_repo_enabled: true).";
  }
  return null;
}

export function readGovernanceStatus(factoryRoot: string): GovernanceStatusSnapshot {
  if (!factoryRoot || !fs.existsSync(factoryRoot)) {
    const cloudReadiness = evaluateCloudCommandReadiness(process.env, false);
    return {
      indicator: "OFF",
      governanceModeOn: false,
      factoryRoot,
      featureFlagEnabled: false,
      governanceRepoPath: null,
      governanceRepoReachable: false,
      workspaceId: null,
      cloudReadiness,
      nextStep: buildNextStep({
        hasFactoryRoot: false,
        featureFlagEnabled: false,
        hasBinding: false,
        hasGovernanceRepoPath: false,
        governanceRepoReachable: false,
      }),
      errorMessage: null,
    };
  }

  try {
    const featureFlags = loadFeatureFlags(factoryRoot);
    const featureFlagEnabled = featureFlags.flags.governance_repo_enabled;
    const bindingPath = path.join(factoryRoot, BINDING_PATH);
    const binding = parseBinding(bindingPath);
    const governanceRepoPath = binding?.governance_repo_path?.trim() || null;
    const workspaceId = binding?.workspace_id?.trim() || null;
    const governanceRepoReachable =
      governanceRepoPath !== null &&
      fs.existsSync(path.join(governanceRepoPath, GOVERNANCE_CONFIG_PATH));

    const governanceModeOn =
      featureFlagEnabled && binding !== null && governanceRepoReachable;
    const cloudReadiness = evaluateCloudCommandReadiness(process.env, governanceModeOn);

    return {
      indicator: governanceModeOn ? "ON" : "OFF",
      governanceModeOn,
      factoryRoot,
      featureFlagEnabled,
      governanceRepoPath,
      governanceRepoReachable,
      workspaceId,
      cloudReadiness,
      nextStep: buildNextStep({
        hasFactoryRoot: true,
        featureFlagEnabled,
        hasBinding: binding !== null,
        hasGovernanceRepoPath: governanceRepoPath !== null,
        governanceRepoReachable,
      }),
      errorMessage: null,
    };
  } catch (error) {
    const cloudReadiness = evaluateCloudCommandReadiness(process.env, false);
    return {
      indicator: "ERROR",
      governanceModeOn: false,
      factoryRoot,
      featureFlagEnabled: false,
      governanceRepoPath: null,
      governanceRepoReachable: false,
      workspaceId: null,
      cloudReadiness,
      nextStep: "Run Devory: Show Governance Status for details.",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function formatGovernanceStatusBarText(snapshot: GovernanceStatusSnapshot): string {
  if (snapshot.indicator === "ERROR") return "Governance: ERROR";
  if (snapshot.indicator === "ON") {
    if (snapshot.workspaceId) {
      return `Governance: ON (${snapshot.workspaceId})`;
    }
    return "Governance: ON";
  }
  return "Governance: OFF";
}

export function formatGovernanceStatusSummary(snapshot: GovernanceStatusSnapshot): string {
  const lines: string[] = [];
  lines.push(`Governance mode: ${snapshot.indicator}`);
  lines.push(
    `Governance repo path: ${snapshot.governanceRepoPath ?? "(not configured)"}`,
  );
  lines.push(`Workspace ID: ${snapshot.workspaceId ?? "(not configured)"}`);
  lines.push(formatCloudCommandReadinessLine(snapshot.cloudReadiness));

  if (snapshot.errorMessage) {
    lines.push(`Error: ${snapshot.errorMessage}`);
  }
  if (snapshot.nextStep) {
    lines.push(`Next step: ${snapshot.nextStep}`);
  }

  return lines.join("\n");
}
