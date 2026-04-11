export interface WorkspaceIntegrations {
  github_org?: string;
  jira_base_url?: string;
}

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceMember {
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface Workspace {
  workspace_id: string;
  name: string;
  description?: string;
  repos: string[];
  default_profile_id: string;
  integrations: WorkspaceIntegrations;
  /** UUID of the user who owns this workspace (maps to Supabase auth.users) */
  owner_user_id?: string;
  /** Org identifier for Teams-tier shared workspaces. Null for personal workspaces. */
  owner_org_id?: string;
  members?: WorkspaceMember[];
  created_at: string;
  updated_at: string;
}

/**
 * Returns true if this workspace belongs to an org (Teams-tier shared workspace).
 * Personal workspaces have no owner_org_id.
 */
export function isTeamWorkspace(workspace: Workspace): boolean {
  return typeof workspace.owner_org_id === "string" && workspace.owner_org_id.trim() !== "";
}

/**
 * Returns true if the given userId is an owner of this workspace.
 */
export function isWorkspaceOwner(workspace: Workspace, userId: string): boolean {
  if (!workspace.members) return false;
  return workspace.members.some((m) => m.user_id === userId && m.role === "owner");
}

export const DEFAULT_WORKSPACE: Workspace = {
  workspace_id: "default",
  name: "Default",
  description: "Default workspace used when no explicit workspace is configured.",
  repos: [],
  default_profile_id: "balanced-default",
  integrations: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function normalizeIntegrations(value: unknown): WorkspaceIntegrations {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return {};
  }

  return {
    github_org: asOptionalString(record.github_org),
    jira_base_url: asOptionalString(record.jira_base_url),
  };
}

function normalizeMembers(value: unknown): WorkspaceMember[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const members: WorkspaceMember[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const userId = asString(item.user_id);
    const role = item.role === "owner" || item.role === "member" ? item.role : null;
    const joinedAt = asString(item.joined_at);
    if (userId && role && joinedAt) {
      members.push({ user_id: userId, role, joined_at: joinedAt });
    }
  }
  return members.length > 0 ? members : undefined;
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const workspaceId = asString(record.workspace_id);
  const name = asString(record.name);
  const defaultProfileId = asString(record.default_profile_id);
  const createdAt = asString(record.created_at);
  const updatedAt = asString(record.updated_at);

  if (!workspaceId || !name || !defaultProfileId || !createdAt || !updatedAt) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    name,
    description: asOptionalString(record.description),
    repos: asStringArray(record.repos),
    default_profile_id: defaultProfileId,
    integrations: normalizeIntegrations(record.integrations),
    owner_user_id: asOptionalString(record.owner_user_id),
    owner_org_id: asOptionalString(record.owner_org_id),
    members: normalizeMembers(record.members),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function buildWorkspaceFixture(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspace_id: overrides.workspace_id ?? "workspace-1",
    name: overrides.name ?? "Devory Core",
    description: overrides.description ?? "Primary engineering workspace.",
    repos: overrides.repos ?? ["devory", "devory-website"],
    default_profile_id: overrides.default_profile_id ?? "balanced-default",
    integrations: overrides.integrations ?? {},
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}