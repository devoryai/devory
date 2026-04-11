export const EXTERNAL_WORK_ITEM_SOURCES = ["github-issue", "jira"] as const;

export type ExternalWorkItemSource = (typeof EXTERNAL_WORK_ITEM_SOURCES)[number];

export interface ExternalWorkItem {
  source: ExternalWorkItemSource;
  key: string;
  url: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  labels: string[];
  repo?: string;
  project?: string;
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

function normalizeSource(value: unknown): ExternalWorkItemSource {
  return (EXTERNAL_WORK_ITEM_SOURCES as readonly string[]).includes(String(value))
    ? (value as ExternalWorkItemSource)
    : "github-issue";
}

export function normalizeExternalWorkItem(value: unknown): ExternalWorkItem | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const key = asString(record.key);
  const url = asString(record.url);
  const title = asString(record.title);
  const description = asString(record.description);
  if (!key || !url || !title || !description) {
    return null;
  }

  return {
    source: normalizeSource(record.source),
    key,
    url,
    title,
    description,
    acceptance_criteria: asStringArray(record.acceptance_criteria),
    labels: asStringArray(record.labels),
    repo: asOptionalString(record.repo),
    project: asOptionalString(record.project),
  };
}

export function buildExternalWorkItemFixture(
  overrides: Partial<ExternalWorkItem> = {}
): ExternalWorkItem {
  return {
    source: overrides.source ?? "github-issue",
    key: overrides.key ?? "owner/repo#123",
    url: overrides.url ?? "https://github.com/owner/repo/issues/123",
    title: overrides.title ?? "Improve issue intake flow",
    description:
      overrides.description ??
      "Ingest external work items and convert them into governed execution artifacts.",
    acceptance_criteria: overrides.acceptance_criteria ?? [
      "Engineers can preview normalized intake content before generation.",
    ],
    labels: overrides.labels ?? ["intake"],
    repo: overrides.repo,
    project: overrides.project,
  };
}
