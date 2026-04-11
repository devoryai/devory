/**
 * packages/core/src/sync-manifest.ts
 *
 * SyncManifest — the diff between local and cloud artifact state.
 * Pure types and functions — no I/O.
 *
 * Syncable artifact types are everything that lives outside of git.
 * Tasks, doctrine, and skills stay git-only and are NOT in this list.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SYNCABLE_ARTIFACT_TYPES = [
  "workspace",
  "profile",
  "active-state",
  "working-brief",
  "planning-draft",
  "work-context",
  "write-back",
  "run-history",
] as const;

export type SyncableArtifactType = (typeof SYNCABLE_ARTIFACT_TYPES)[number];

/**
 * Status of a single artifact in the sync diff:
 * - local-only:  exists locally, not in cloud → push will create it
 * - cloud-only:  exists in cloud, not locally → pull will create it
 * - in-sync:     both exist, timestamps match → nothing to do
 * - local-newer: both exist, local is later → push will update cloud
 * - cloud-newer: both exist, cloud is later  → pull will update local
 */
export type SyncStatus =
  | "local-only"
  | "cloud-only"
  | "in-sync"
  | "local-newer"
  | "cloud-newer";

export interface SyncEntry {
  artifact_id: string;
  artifact_type: SyncableArtifactType;
  /** ISO 8601 timestamp from local file mtime, or null if not present locally */
  local_updated_at: string | null;
  /** ISO 8601 timestamp from cloud record, or null if not present in cloud */
  cloud_updated_at: string | null;
  status: SyncStatus;
}

export interface SyncManifest {
  workspace_id: string;
  /** ISO 8601 timestamp when the manifest was generated */
  generated_at: string;
  entries: SyncEntry[];
  /** Count of entries that would be pushed (local-only or local-newer) */
  push_count: number;
  /** Count of entries that would be pulled (cloud-only or cloud-newer) */
  pull_count: number;
  in_sync_count: number;
}

// ---------------------------------------------------------------------------
// buildSyncManifest — pure diff function
// ---------------------------------------------------------------------------

interface ArtifactRef {
  artifact_id: string;
  artifact_type: SyncableArtifactType;
  updated_at: string;
}

function classifyStatus(localAt: string | null, cloudAt: string | null): SyncStatus {
  if (localAt === null) return "cloud-only";
  if (cloudAt === null) return "local-only";
  // ISO 8601 strings are safely comparable lexicographically
  if (localAt === cloudAt) return "in-sync";
  return localAt > cloudAt ? "local-newer" : "cloud-newer";
}

/**
 * Pure function. Computes the sync diff between local and cloud artifact lists.
 *
 * @param workspaceId  The workspace being compared
 * @param local        Artifacts known locally (from filesystem or local store)
 * @param cloud        Artifacts known in cloud (from Supabase query)
 */
export function buildSyncManifest(
  workspaceId: string,
  local: ArtifactRef[],
  cloud: ArtifactRef[],
): SyncManifest {
  const localMap = new Map<string, ArtifactRef>();
  for (const item of local) {
    localMap.set(item.artifact_id, item);
  }

  const cloudMap = new Map<string, ArtifactRef>();
  for (const item of cloud) {
    cloudMap.set(item.artifact_id, item);
  }

  const seenIds = new Set<string>();
  const entries: SyncEntry[] = [];

  // Local side
  for (const [id, localItem] of localMap) {
    seenIds.add(id);
    const cloudItem = cloudMap.get(id);
    const status = classifyStatus(localItem.updated_at, cloudItem?.updated_at ?? null);
    entries.push({
      artifact_id: id,
      artifact_type: localItem.artifact_type,
      local_updated_at: localItem.updated_at,
      cloud_updated_at: cloudItem?.updated_at ?? null,
      status,
    });
  }

  // Cloud-only items
  for (const [id, cloudItem] of cloudMap) {
    if (seenIds.has(id)) continue;
    entries.push({
      artifact_id: id,
      artifact_type: cloudItem.artifact_type,
      local_updated_at: null,
      cloud_updated_at: cloudItem.updated_at,
      status: "cloud-only",
    });
  }

  const push_count = entries.filter(
    (e) => e.status === "local-only" || e.status === "local-newer",
  ).length;
  const pull_count = entries.filter(
    (e) => e.status === "cloud-only" || e.status === "cloud-newer",
  ).length;
  const in_sync_count = entries.filter((e) => e.status === "in-sync").length;

  return {
    workspace_id: workspaceId,
    generated_at: new Date().toISOString(),
    entries,
    push_count,
    pull_count,
    in_sync_count,
  };
}
