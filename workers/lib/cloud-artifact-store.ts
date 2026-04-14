/**
 * workers/lib/cloud-artifact-store.ts
 *
 * Cloud artifact store — push and pull syncable artifacts via Supabase.
 * The sync_log is written automatically on every push/pull.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SYNCABLE_ARTIFACT_TYPES } from "@devory/core";
import type { SyncableArtifactType } from "@devory/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactChangeSource = "cli_push" | "web_edit" | "sync_pull";

export interface ArtifactRecord {
  artifact_id: string;
  artifact_type: SyncableArtifactType;
  content: string;
  metadata: Record<string, unknown>;
  local_updated_at: string;
  change_source?: ArtifactChangeSource;
}

export interface ArtifactIndexEntry {
  artifact_id: string;
  artifact_type: SyncableArtifactType;
  updated_at: string;
  synced_at?: string;
  version?: number;
}

export interface ArtifactContent {
  artifact_id: string;
  content: string;
  metadata: Record<string, unknown>;
  synced_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertSyncableType(type: string): asserts type is SyncableArtifactType {
  if (!(SYNCABLE_ARTIFACT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unsupported artifact type: ${type}`);
  }
}

async function getCurrentUserId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getUser();
  return data?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns metadata for all artifacts in a workspace — no content column.
 * Used for efficient manifest building (timestamps only).
 */
export async function fetchCloudArtifactIndex(
  client: SupabaseClient,
  workspaceId: string,
): Promise<ArtifactIndexEntry[]> {
  const { data, error } = await client
    .from("artifacts")
    .select("artifact_id, artifact_type, local_updated_at, synced_at, version")
    .eq("workspace_id", workspaceId)
    .order("artifact_id", { ascending: true });

  if (error) throw new Error(`fetchCloudArtifactIndex: ${error.message}`);
  if (!data) return [];

  return data.map((row) => ({
    artifact_id: row.artifact_id as string,
    artifact_type: row.artifact_type as SyncableArtifactType,
    updated_at: row.local_updated_at as string,
    synced_at: row.synced_at as string,
    version: row.version as number,
  }));
}

/**
 * Pushes an artifact to Supabase with upsert (idempotent).
 * Appends a sync_log entry with action "created" or "updated".
 */
export async function pushArtifact(
  client: SupabaseClient,
  workspaceId: string,
  record: ArtifactRecord,
): Promise<void> {
  assertSyncableType(record.artifact_type);

  const userId = await getCurrentUserId(client);

  // Check if artifact already exists to determine log action
  // (userId may be null when using a service role client — sync_log insert is skipped below)
  const { data: existing } = await client
    .from("artifacts")
    .select("artifact_id")
    .eq("workspace_id", workspaceId)
    .eq("artifact_id", record.artifact_id)
    .single();

  const action = existing ? "updated" : "created";

  const { error: upsertError } = await client.from("artifacts").upsert(
    {
      workspace_id: workspaceId,
      artifact_id: record.artifact_id,
      artifact_type: record.artifact_type,
      content: record.content,
      metadata: record.metadata,
      local_updated_at: record.local_updated_at,
      synced_at: new Date().toISOString(),
      updated_by: userId ?? undefined,
      change_source: record.change_source ?? "cli_push",
    },
    { onConflict: "workspace_id,artifact_id" },
  );

  if (upsertError) throw new Error(`pushArtifact: ${upsertError.message}`);

  // Append sync log entry (best-effort — skipped when no user session, e.g. service role client)
  if (userId) {
    await client.from("sync_log").insert({
      workspace_id: workspaceId,
      user_id: userId,
      direction: "push",
      artifact_type: record.artifact_type,
      artifact_id: record.artifact_id,
      action,
    });
  }
}

/**
 * Pulls a single artifact by ID. Returns null if not found.
 */
export async function pullArtifact(
  client: SupabaseClient,
  workspaceId: string,
  artifactId: string,
): Promise<ArtifactContent | null> {
  const { data, error } = await client
    .from("artifacts")
    .select("artifact_id, content, metadata, synced_at")
    .eq("workspace_id", workspaceId)
    .eq("artifact_id", artifactId)
    .single();

  if (error || !data) return null;

  return {
    artifact_id: data.artifact_id as string,
    content: data.content as string,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    synced_at: data.synced_at as string,
  };
}

/**
 * Pulls all artifacts of a given type for a workspace.
 */
export async function pullArtifactsByType(
  client: SupabaseClient,
  workspaceId: string,
  type: SyncableArtifactType,
): Promise<ArtifactContent[]> {
  assertSyncableType(type);

  const { data, error } = await client
    .from("artifacts")
    .select("artifact_id, content, metadata, synced_at")
    .eq("workspace_id", workspaceId)
    .eq("artifact_type", type)
    .order("artifact_id", { ascending: true });

  if (error) throw new Error(`pullArtifactsByType: ${error.message}`);
  if (!data) return [];

  return data.map((row) => ({
    artifact_id: row.artifact_id as string,
    content: row.content as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    synced_at: row.synced_at as string,
  }));
}
