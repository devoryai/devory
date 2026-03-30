import type {
  HumanQuestionFallbackBehavior,
  HumanQuestionRecord,
  HumanQuestionStatus,
} from "./human-question.ts";

export const HUMAN_QUESTION_EVENT_VERSION = "human-question-event-v1" as const;
export const HUMAN_QUESTION_EVENT_ARTIFACT_DIR = "human-question-events" as const;
export const HUMAN_QUESTION_DIGEST_VERSION = "human-question-digest-v1" as const;
export const HUMAN_QUESTION_DIGEST_ARTIFACT_DIR = "human-question-digests" as const;

export type HumanQuestionLifecycleEventType =
  | "opened"
  | "notified"
  | "answered"
  | "dismissed"
  | "expired"
  | "resumed"
  | "skipped";

export interface HumanQuestionLifecycleEvent {
  version: typeof HUMAN_QUESTION_EVENT_VERSION;
  event_id: string;
  event_type: HumanQuestionLifecycleEventType;
  question_id: string;
  task_id: string | null;
  run_id: string | null;
  lane_id: string | null;
  status: HumanQuestionStatus;
  interruption_level: HumanQuestionRecord["interruption_level"];
  fallback_behavior: HumanQuestionFallbackBehavior;
  summary: string;
  timestamp: string;
  answer_state: "waiting" | "answered" | "dismissed" | "expired";
  selected_option_id: string | null;
  blocked_task_id: string | null;
  resumed_run_id: string | null;
  resulting_task_stage: string | null;
  note: string | null;
}

export interface HumanQuestionDigestEntry {
  question_id: string;
  task_id: string | null;
  run_id: string | null;
  lane_id: string | null;
  interruption_level: HumanQuestionRecord["interruption_level"];
  category: string;
  summary: string;
  created_at: string;
  age_minutes: number;
}

export interface HumanQuestionDigestArtifact {
  version: typeof HUMAN_QUESTION_DIGEST_VERSION;
  generated_at: string;
  total_open_questions: number;
  by_interruption_level: Record<string, number>;
  by_run_id: Record<string, number>;
  by_lane_id: Record<string, number>;
  entries: HumanQuestionDigestEntry[];
}

function toFilesystemTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function normaliseId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function answerStateFromStatus(status: HumanQuestionStatus): HumanQuestionLifecycleEvent["answer_state"] {
  if (status === "answered") return "answered";
  if (status === "dismissed") return "dismissed";
  if (status === "expired") return "expired";
  return "waiting";
}

export function buildHumanQuestionLifecycleEvent(input: {
  event_type: HumanQuestionLifecycleEventType;
  question: HumanQuestionRecord;
  timestamp: string;
  blocked_task_id?: string | null;
  resumed_run_id?: string | null;
  resulting_task_stage?: string | null;
  note?: string | null;
}): HumanQuestionLifecycleEvent {
  return {
    version: HUMAN_QUESTION_EVENT_VERSION,
    event_id: `${input.question.question_id}-${input.event_type}-${toFilesystemTimestamp(input.timestamp)}`,
    event_type: input.event_type,
    question_id: input.question.question_id,
    task_id: input.question.task_id,
    run_id: input.question.run_id,
    lane_id: input.question.lane_id,
    status: input.question.status,
    interruption_level: input.question.interruption_level,
    fallback_behavior: input.question.fallback_behavior,
    summary: input.question.summary,
    timestamp: input.timestamp,
    answer_state: answerStateFromStatus(input.question.status),
    selected_option_id: input.question.answer?.selected_option_id ?? null,
    blocked_task_id: input.blocked_task_id ?? input.question.task_id ?? null,
    resumed_run_id: input.resumed_run_id ?? null,
    resulting_task_stage: input.resulting_task_stage ?? null,
    note: input.note ?? null,
  };
}

export function buildHumanQuestionLifecycleEventRelativePath(
  event: HumanQuestionLifecycleEvent
): string {
  const timestamp = toFilesystemTimestamp(event.timestamp);
  return `${HUMAN_QUESTION_EVENT_ARTIFACT_DIR}/${timestamp}-${normaliseId(event.question_id)}-${event.event_type}.json`;
}

export function serializeHumanQuestionLifecycleEvent(
  event: HumanQuestionLifecycleEvent
): string {
  return `${JSON.stringify(event, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseHumanQuestionLifecycleEvent(raw: string): HumanQuestionLifecycleEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (typeof parsed.event_id !== "string" || typeof parsed.question_id !== "string") return null;
  if (typeof parsed.event_type !== "string" || typeof parsed.timestamp !== "string") return null;
  return parsed as unknown as HumanQuestionLifecycleEvent;
}

export function buildHumanQuestionDigest(
  questions: HumanQuestionRecord[],
  generatedAt: string
): HumanQuestionDigestArtifact {
  const openQuestions = questions
    .filter((question) => question.status === "open")
    .sort((left, right) => left.created_at.localeCompare(right.created_at));

  const entries = openQuestions.map((question) => ({
    question_id: question.question_id,
    task_id: question.task_id,
    run_id: question.run_id,
    lane_id: question.lane_id,
    interruption_level: question.interruption_level,
    category: question.category,
    summary: question.summary,
    created_at: question.created_at,
    age_minutes: Math.max(
      0,
      Math.floor(
        (new Date(generatedAt).getTime() - new Date(question.created_at).getTime()) / 60000
      )
    ),
  }));

  const by_interruption_level: Record<string, number> = {};
  const by_run_id: Record<string, number> = {};
  const by_lane_id: Record<string, number> = {};

  for (const entry of entries) {
    by_interruption_level[entry.interruption_level] =
      (by_interruption_level[entry.interruption_level] ?? 0) + 1;
    by_run_id[entry.run_id ?? "unscoped"] = (by_run_id[entry.run_id ?? "unscoped"] ?? 0) + 1;
    by_lane_id[entry.lane_id ?? "unscoped"] = (by_lane_id[entry.lane_id ?? "unscoped"] ?? 0) + 1;
  }

  return {
    version: HUMAN_QUESTION_DIGEST_VERSION,
    generated_at: generatedAt,
    total_open_questions: entries.length,
    by_interruption_level,
    by_run_id,
    by_lane_id,
    entries,
  };
}

export function buildHumanQuestionDigestRelativePath(generatedAt: string): string {
  return `${HUMAN_QUESTION_DIGEST_ARTIFACT_DIR}/${toFilesystemTimestamp(generatedAt)}-digest.json`;
}

export function serializeHumanQuestionDigest(digest: HumanQuestionDigestArtifact): string {
  return `${JSON.stringify(digest, null, 2)}\n`;
}

export function renderHumanQuestionDigestMarkdown(
  digest: HumanQuestionDigestArtifact
): string {
  const lines = [
    "---",
    `version: ${digest.version}`,
    `generated_at: ${digest.generated_at}`,
    `total_open_questions: ${digest.total_open_questions}`,
    "---",
    "",
    "# Human Question Digest",
    "",
    `Open questions: ${digest.total_open_questions}`,
    "",
    "## Open Questions",
    "",
  ];

  if (digest.entries.length === 0) {
    lines.push("- None");
  } else {
    for (const entry of digest.entries) {
      lines.push(
        `- ${entry.question_id} · ${entry.interruption_level} · ${entry.summary} · age ${entry.age_minutes}m · run ${entry.run_id ?? "unscoped"} · lane ${entry.lane_id ?? "unscoped"}`
      );
    }
  }

  lines.push("", "## By Interruption Level", "");
  if (Object.keys(digest.by_interruption_level).length === 0) {
    lines.push("- None");
  } else {
    for (const [key, count] of Object.entries(digest.by_interruption_level)) {
      lines.push(`- ${key}: ${count}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
