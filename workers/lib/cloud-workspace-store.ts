/**
 * workers/lib/cloud-workspace-store.ts
 *
 * Cloud workspace store — reads and writes workspace records via Supabase.
 * All functions accept a pre-constructed Supabase client (not constructed internally).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workspace, WorkspaceMember, WorkspaceRole } from "@devory/core";

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

interface WorkspaceRow {
  workspace_id: string;
  name: string;
  description: string | null;
  owner_user_id: string;
  owner_org_id: string | null;
  default_profile_id: string;
  integrations: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToWorkspace(row: WorkspaceRow, members?: MemberRow[]): Workspace {
  const workspace: Workspace = {
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description ?? undefined,
    repos: [],
    default_profile_id: row.default_profile_id,
    integrations: {
      github_org:
        typeof row.integrations?.github_org === "string"
          ? row.integrations.github_org
          : undefined,
      jira_base_url:
        typeof row.integrations?.jira_base_url === "string"
          ? row.integrations.jira_base_url
          : undefined,
    },
    owner_user_id: row.owner_user_id,
    owner_org_id: row.owner_org_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (members) {
    workspace.members = members.map(
      (m): WorkspaceMember => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
      }),
    );
  }
  return workspace;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all workspaces the authenticated user is a member of.
 * RLS enforces membership — no additional filtering needed.
 */
export async function fetchCloudWorkspaces(client: SupabaseClient): Promise<Workspace[]> {
  const { data, error } = await client
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`fetchCloudWorkspaces: ${error.message}`);
  if (!data) return [];

  return (data as WorkspaceRow[]).map((row) => rowToWorkspace(row));
}

/**
 * Fetches a single workspace by ID including its members list.
 * Returns null if the workspace does not exist or RLS denies access.
 */
export async function pullWorkspace(
  client: SupabaseClient,
  workspaceId: string,
): Promise<Workspace | null> {
  const [wsResult, membersResult] = await Promise.all([
    client.from("workspaces").select("*").eq("workspace_id", workspaceId).single(),
    client.from("workspace_members").select("*").eq("workspace_id", workspaceId),
  ]);

  if (wsResult.error || !wsResult.data) return null;

  const members = (membersResult.data ?? []) as MemberRow[];
  return rowToWorkspace(wsResult.data as WorkspaceRow, members);
}

/**
 * Upserts a workspace record to the cloud. Returns the updated workspace.
 * Uses upsert to be idempotent — safe to call multiple times.
 */
export async function pushWorkspace(
  client: SupabaseClient,
  workspace: Workspace,
): Promise<Workspace> {
  const row = {
    workspace_id: workspace.workspace_id,
    name: workspace.name,
    description: workspace.description ?? null,
    owner_user_id: workspace.owner_user_id,
    owner_org_id: workspace.owner_org_id ?? null,
    default_profile_id: workspace.default_profile_id,
    integrations: workspace.integrations ?? {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("workspaces")
    .upsert(row, { onConflict: "workspace_id" })
    .select()
    .single();

  if (error) throw new Error(`pushWorkspace: ${error.message}`);
  return rowToWorkspace(data as WorkspaceRow);
}

/**
 * Creates a new workspace and atomically adds the creating user as an owner member.
 * Uses a Supabase RPC to ensure atomicity — if the member insert fails, the workspace
 * is not created.
 */
export async function createCloudWorkspace(
  client: SupabaseClient,
  input: {
    name: string;
    description?: string;
    default_profile_id?: string;
  },
): Promise<Workspace> {
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData?.user) {
    throw new Error("createCloudWorkspace: not authenticated");
  }
  const userId = userData.user.id;

  // Prefer the SECURITY DEFINER RPC when available. It bypasses RLS edge cases
  // where JWT claims may not be forwarded consistently by the caller context.
  const { data: rpcData, error: rpcError } = await client.rpc("create_user_workspace", {
    p_name: input.name,
    p_user_id: userId,
  });

  if (!rpcError && rpcData) {
    const maybe = rpcData as Record<string, unknown>;
    const workspaceId =
      typeof maybe.workspace_id === "string"
        ? maybe.workspace_id
        : typeof maybe.id === "string"
          ? maybe.id
          : null;

    if (workspaceId) {
      const workspace = await pullWorkspace(client, workspaceId);
      if (workspace) return workspace;
    }
  }

  // Insert workspace
  const { data: wsData, error: wsError } = await client
    .from("workspaces")
    .insert({
      name: input.name,
      description: input.description ?? null,
      owner_user_id: userId,
      default_profile_id: input.default_profile_id ?? "balanced-default",
      integrations: {},
    })
    .select()
    .single();

  if (wsError || !wsData) {
    throw new Error(`createCloudWorkspace: failed to create workspace: ${wsError?.message}`);
  }

  const workspace = wsData as WorkspaceRow;

  // Insert owner member — if this fails, attempt to roll back the workspace
  const { error: memberError } = await client.from("workspace_members").insert({
    workspace_id: workspace.workspace_id,
    user_id: userId,
    role: "owner" as WorkspaceRole,
  });

  if (memberError) {
    // Best-effort rollback
    await client.from("workspaces").delete().eq("workspace_id", workspace.workspace_id);
    throw new Error(
      `createCloudWorkspace: failed to add owner member: ${memberError.message}`,
    );
  }

  const member: MemberRow = {
    workspace_id: workspace.workspace_id,
    user_id: userId,
    role: "owner",
    joined_at: new Date().toISOString(),
  };

  return rowToWorkspace(workspace, [member]);
}
