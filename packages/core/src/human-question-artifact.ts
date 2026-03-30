import type { HumanQuestionRecord, HumanQuestionStatus } from "./human-question.ts";

export const HUMAN_QUESTION_ARTIFACT_DIR = "human-questions" as const;
export const HUMAN_QUESTION_ARTIFACT_TYPE = "human-question" as const;

export interface HumanQuestionArtifactMetadata {
  question_id: string;
  task_id: string | null;
  run_id: string | null;
  status: HumanQuestionStatus;
  created_at: string;
}

function normaliseQuestionId(questionId: string): string {
  return questionId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function toFilesystemTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

export function buildHumanQuestionArtifactRelativePath(
  record: HumanQuestionRecord
): string {
  const taskScope = record.task_id?.trim() || "unscoped";
  const timestamp = toFilesystemTimestamp(record.created_at);
  const questionId = normaliseQuestionId(record.question_id);
  return `${HUMAN_QUESTION_ARTIFACT_DIR}/${taskScope}/${timestamp}-${questionId}.json`;
}

export function serializeHumanQuestionArtifact(record: HumanQuestionRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseHumanQuestionArtifact(raw: string): HumanQuestionRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (typeof parsed.question_id !== "string" || parsed.question_id.trim() === "") return null;
  if (typeof parsed.status !== "string" || parsed.status.trim() === "") return null;
  if (typeof parsed.created_at !== "string" || parsed.created_at.trim() === "") return null;
  if (typeof parsed.updated_at !== "string" || parsed.updated_at.trim() === "") return null;

  return parsed as unknown as HumanQuestionRecord;
}

export function extractHumanQuestionArtifactMetadata(
  raw: string
): HumanQuestionArtifactMetadata | null {
  const record = parseHumanQuestionArtifact(raw);
  if (!record) return null;
  return {
    question_id: record.question_id,
    task_id: record.task_id,
    run_id: record.run_id,
    status: record.status,
    created_at: record.created_at,
  };
}
