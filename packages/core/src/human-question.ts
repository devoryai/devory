export const HUMAN_QUESTION_VERSION = "human-question-v1" as const;

export type HumanInterruptionLevel = "level_1" | "level_2" | "level_3";
export type HumanQuestionStatus =
  | "open"
  | "answered"
  | "dismissed"
  | "expired";
export type HumanQuestionInputMode = "local-api" | "cli" | "digest";
export type HumanQuestionFallbackBehavior =
  | "continue-other-work"
  | "pause-affected-lane"
  | "halt-run"
  | "assume-default"
  | "skip-task";

export interface HumanQuestionOption {
  id: string;
  label: string;
  description: string;
}

export interface HumanQuestionTimeoutPolicy {
  timeout_seconds: number | null;
  on_timeout: HumanQuestionFallbackBehavior;
}

export interface HumanQuestionAnswerPayload {
  selected_option_id: string | null;
  freeform_response: string | null;
  answered_by: string | null;
  answered_at: string | null;
}

export interface HumanQuestionAuditEvent {
  event_type: "opened" | "notified" | "answered" | "dismissed" | "expired";
  timestamp: string;
  actor: string | null;
  note: string | null;
}

export interface HumanQuestionRecord {
  version: typeof HUMAN_QUESTION_VERSION;
  question_id: string;
  task_id: string | null;
  run_id: string | null;
  lane_id: string | null;
  status: HumanQuestionStatus;
  category: string;
  summary: string;
  question_detail: string;
  interruption_level: HumanInterruptionLevel;
  input_mode: HumanQuestionInputMode;
  fallback_behavior: HumanQuestionFallbackBehavior;
  timeout_policy: HumanQuestionTimeoutPolicy;
  options: HumanQuestionOption[];
  recommended_option_id: string | null;
  answer: HumanQuestionAnswerPayload | null;
  created_at: string;
  updated_at: string;
  audit_trail: HumanQuestionAuditEvent[];
}

export interface InterruptionPolicyMapping {
  interruption_level: HumanInterruptionLevel;
  work_continues: boolean;
  lane_pauses: boolean;
  run_halts: boolean;
  run_status: "running" | "paused_for_review" | "failed";
  blocked_task_status: "blocked";
}

export const HUMAN_INTERRUPTION_POLICY_MAP: Record<
  HumanInterruptionLevel,
  InterruptionPolicyMapping
> = {
  level_1: {
    interruption_level: "level_1",
    work_continues: true,
    lane_pauses: false,
    run_halts: false,
    run_status: "running",
    blocked_task_status: "blocked",
  },
  level_2: {
    interruption_level: "level_2",
    work_continues: true,
    lane_pauses: true,
    run_halts: false,
    run_status: "paused_for_review",
    blocked_task_status: "blocked",
  },
  level_3: {
    interruption_level: "level_3",
    work_continues: false,
    lane_pauses: true,
    run_halts: true,
    run_status: "failed",
    blocked_task_status: "blocked",
  },
};

export function buildHumanQuestionFixture(
  overrides: Partial<HumanQuestionRecord> = {}
): HumanQuestionRecord {
  const status = overrides.status ?? "open";
  const createdAt = overrides.created_at ?? "2026-03-28T10:00:00.000Z";
  const updatedAt = overrides.updated_at ?? createdAt;
  return {
    version: HUMAN_QUESTION_VERSION,
    question_id: "hq-001",
    task_id: "factory-136",
    run_id: "orchestrator-run-001",
    lane_id: "default",
    status,
    category: "execution-ambiguity",
    summary: "Choose the safe fallback for the failing migration path.",
    question_detail: "The planned migration may drop existing local state. Which fallback should Devory use?",
    interruption_level: "level_2",
    input_mode: "local-api",
    fallback_behavior: "pause-affected-lane",
    timeout_policy: {
      timeout_seconds: 1800,
      on_timeout: "assume-default",
    },
    options: [
      {
        id: "keep-current",
        label: "Keep current behavior",
        description: "Continue with the existing migration path.",
      },
      {
        id: "skip-migration",
        label: "Skip migration",
        description: "Bypass the migration and leave current state untouched.",
      },
    ],
    recommended_option_id: "skip-migration",
    answer:
      status === "answered"
        ? {
            selected_option_id: "skip-migration",
            freeform_response: null,
            answered_by: "operator",
            answered_at: updatedAt,
          }
        : null,
    created_at: createdAt,
    updated_at: updatedAt,
    audit_trail:
      status === "answered"
        ? [
            {
              event_type: "opened",
              timestamp: createdAt,
              actor: "devory",
              note: "Question opened during execution.",
            },
            {
              event_type: "answered",
              timestamp: updatedAt,
              actor: "operator",
              note: "Selected recommended safe fallback.",
            },
          ]
        : [
            {
              event_type: "opened",
              timestamp: createdAt,
              actor: "devory",
              note: "Question opened during execution.",
            },
          ],
    ...overrides,
  };
}
