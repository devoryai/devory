export const WORK_CONTEXT_SOURCES = ["external", "manual"] as const;
export type WorkContextSource = (typeof WORK_CONTEXT_SOURCES)[number];

export const WORK_CONTEXT_STATUSES = ["active", "paused", "complete"] as const;
export type WorkContextStatus = (typeof WORK_CONTEXT_STATUSES)[number];

export interface WorkContext {
  context_id: string;
  workspace_id: string;
  profile_id: string;
  name: string;
  source: WorkContextSource;
  external_key?: string;
  external_url?: string;
  task_ids: string[];
  artifact_paths: string[];
  status: WorkContextStatus;
  created_at: string;
  updated_at: string;
}

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

function normalizeSource(value: unknown): WorkContextSource | null {
  return (WORK_CONTEXT_SOURCES as readonly string[]).includes(String(value))
    ? (value as WorkContextSource)
    : null;
}

function normalizeStatus(value: unknown): WorkContextStatus | null {
  return (WORK_CONTEXT_STATUSES as readonly string[]).includes(String(value))
    ? (value as WorkContextStatus)
    : null;
}

export function normalizeWorkContext(value: unknown): WorkContext | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const contextId = asString(record.context_id);
  const workspaceId = asString(record.workspace_id);
  const profileId = asString(record.profile_id);
  const name = asString(record.name);
  const source = normalizeSource(record.source);
  const status = normalizeStatus(record.status);
  const createdAt = asString(record.created_at);
  const updatedAt = asString(record.updated_at);

  if (!contextId || !workspaceId || !profileId || !name || !source || !status || !createdAt || !updatedAt) {
    return null;
  }

  return {
    context_id: contextId,
    workspace_id: workspaceId,
    profile_id: profileId,
    name,
    source,
    external_key: asOptionalString(record.external_key),
    external_url: asOptionalString(record.external_url),
    task_ids: asStringArray(record.task_ids),
    artifact_paths: asStringArray(record.artifact_paths),
    status,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function buildWorkContextFixture(overrides: Partial<WorkContext> = {}): WorkContext {
  return {
    context_id: overrides.context_id ?? "context-1",
    workspace_id: overrides.workspace_id ?? "default",
    profile_id: overrides.profile_id ?? "balanced-default",
    name: overrides.name ?? "Issue owner/repo#123",
    source: overrides.source ?? "external",
    external_key: overrides.external_key,
    external_url: overrides.external_url,
    task_ids: overrides.task_ids ?? ["factory-123"],
    artifact_paths: overrides.artifact_paths ?? ["artifacts/intake/example.md"],
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}