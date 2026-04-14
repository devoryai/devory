/**
 * workers/lib/cloud-profile-store.ts
 *
 * Cloud profile store — push and pull engineering profiles via Supabase.
 * Built-in presets are never synced (they are constants in @devory/core).
 *
 * Conflict model: "let the engineer decide."
 * pushProfile throws SyncConflictError when the cloud record is newer.
 * The caller presents the conflict to the engineer who chooses to force-push,
 * pull instead, or skip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineeringProfile } from "@devory/core";

// ---------------------------------------------------------------------------
// SyncConflictError
// ---------------------------------------------------------------------------

export class SyncConflictError extends Error {
  readonly artifactId: string;
  readonly localUpdatedAt: string;
  readonly cloudUpdatedAt: string;

  constructor(artifactId: string, localUpdatedAt: string, cloudUpdatedAt: string) {
    super(
      `Sync conflict on "${artifactId}": cloud updated at ${cloudUpdatedAt}, local at ${localUpdatedAt}. ` +
        `Use force push to overwrite or pull first.`,
    );
    this.name = "SyncConflictError";
    this.artifactId = artifactId;
    this.localUpdatedAt = localUpdatedAt;
    this.cloudUpdatedAt = cloudUpdatedAt;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, SyncConflictError.prototype);
  }
}

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

interface ProfileRow {
  profile_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  is_preset: boolean;
  risk_tolerance: string;
  planning_depth: string;
  validation_strictness: string;
  required_artifacts: string[];
  enabled_skills: string[];
  stack_assumptions: string[];
  max_cost_tier: string;
  personal_only: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mapping helper
// ---------------------------------------------------------------------------

function rowToProfile(row: ProfileRow): EngineeringProfile {
  return {
    profile_id: row.profile_id,
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description ?? "",
    is_preset: row.is_preset,
    risk_tolerance: row.risk_tolerance as EngineeringProfile["risk_tolerance"],
    planning_depth: row.planning_depth as EngineeringProfile["planning_depth"],
    validation_strictness:
      row.validation_strictness as EngineeringProfile["validation_strictness"],
    required_artifacts: row.required_artifacts ?? [],
    enabled_skills: row.enabled_skills ?? [],
    stack_assumptions: row.stack_assumptions ?? [],
    max_cost_tier: row.max_cost_tier as EngineeringProfile["max_cost_tier"],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function profileToRow(
  workspaceId: string,
  profile: EngineeringProfile,
): Omit<ProfileRow, "created_at"> {
  return {
    profile_id: profile.profile_id,
    workspace_id: workspaceId,
    name: profile.name,
    description: profile.description || null,
    is_preset: false,
    risk_tolerance: profile.risk_tolerance,
    planning_depth: profile.planning_depth,
    validation_strictness: profile.validation_strictness,
    required_artifacts: profile.required_artifacts,
    enabled_skills: profile.enabled_skills,
    stack_assumptions: profile.stack_assumptions,
    max_cost_tier: profile.max_cost_tier,
    personal_only: false,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all custom profiles for a workspace. Never returns presets.
 */
export async function fetchCloudProfiles(
  client: SupabaseClient,
  workspaceId: string,
): Promise<EngineeringProfile[]> {
  const { data, error } = await client
    .from("workspace_profiles")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_preset", false)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`fetchCloudProfiles: ${error.message}`);
  if (!data) return [];

  return (data as ProfileRow[]).map(rowToProfile);
}

/**
 * Fetches a single profile by ID. Returns null if not found.
 */
export async function pullProfile(
  client: SupabaseClient,
  workspaceId: string,
  profileId: string,
): Promise<EngineeringProfile | null> {
  const { data, error } = await client
    .from("workspace_profiles")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", profileId)
    .single();

  if (error || !data) return null;
  return rowToProfile(data as ProfileRow);
}

/**
 * Pushes a custom profile to Supabase. Throws SyncConflictError if the cloud
 * record has a newer updated_at than the local record.
 * Throws an error if the profile is a built-in preset.
 */
export async function pushProfile(
  client: SupabaseClient,
  workspaceId: string,
  profile: EngineeringProfile,
): Promise<EngineeringProfile> {
  if (profile.is_preset) {
    throw new Error("Cannot sync built-in presets");
  }

  // Check for conflict: fetch cloud record first
  const existing = await pullProfile(client, workspaceId, profile.profile_id);
  if (existing && existing.updated_at > profile.updated_at) {
    throw new SyncConflictError(profile.profile_id, profile.updated_at, existing.updated_at);
  }

  return forcePushProfile(client, workspaceId, profile);
}

/**
 * Upserts a profile unconditionally — bypasses conflict detection.
 * Used when the engineer has explicitly chosen to overwrite the cloud version.
 */
export async function forcePushProfile(
  client: SupabaseClient,
  workspaceId: string,
  profile: EngineeringProfile,
): Promise<EngineeringProfile> {
  if (profile.is_preset) {
    throw new Error("Cannot sync built-in presets");
  }

  const row = profileToRow(workspaceId, profile);

  const { data, error } = await client
    .from("workspace_profiles")
    .upsert(row, { onConflict: "profile_id" })
    .select()
    .single();

  if (error || !data) throw new Error(`forcePushProfile: ${error?.message ?? "no data returned"}`);
  return rowToProfile(data as ProfileRow);
}
