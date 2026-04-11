import { DEFAULT_PROFILE_ID } from "./profile-presets.ts";

export interface ActiveDevoryState {
  workspace_id: string;         // local slug, e.g. "default"
  cloud_workspace_id?: string;  // Supabase UUID, set when linked to cloud
  profile_id: string;
  context_id?: string;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeActiveDevoryState(value: unknown): ActiveDevoryState | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const workspaceId = asString(record.workspace_id);
  const profileId = asString(record.profile_id);
  const updatedAt = asString(record.updated_at);
  const contextId = asString(record.context_id) ?? undefined;

  if (!workspaceId || !profileId || !updatedAt) return null;

  const cloudWorkspaceId = asString(record.cloud_workspace_id) ?? undefined;

  return {
    workspace_id: workspaceId,
    cloud_workspace_id: cloudWorkspaceId,
    profile_id: profileId,
    context_id: contextId,
    updated_at: updatedAt,
  };
}

export function buildDefaultActiveState(): ActiveDevoryState {
  return {
    workspace_id: "default",
    profile_id: DEFAULT_PROFILE_ID,
    updated_at: new Date().toISOString(),
  };
}

export function buildActiveStateFixture(
  overrides: Partial<ActiveDevoryState> = {}
): ActiveDevoryState {
  return {
    workspace_id: overrides.workspace_id ?? "default",
    profile_id: overrides.profile_id ?? DEFAULT_PROFILE_ID,
    context_id: overrides.context_id,
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}