import type { HumanInterruptionLevel } from "./human-question.ts";

export const SLACK_NOTIFICATION_CONFIG_VERSION = "slack-notification-config-v1" as const;

export const VALID_SLACK_TRANSPORT_KINDS = ["webhook", "bot-token"] as const;
export type SlackTransportKind = (typeof VALID_SLACK_TRANSPORT_KINDS)[number];

export const VALID_SLACK_DELIVERY_MODES = [
  "suppressed",
  "digest",
  "immediate",
  "urgent",
] as const;
export type SlackDeliveryMode = (typeof VALID_SLACK_DELIVERY_MODES)[number];

export const VALID_SLACK_DIGEST_GROUP_BY = [
  "interruption_level",
  "run",
  "lane",
  "age",
] as const;
export type SlackDigestGroupBy = (typeof VALID_SLACK_DIGEST_GROUP_BY)[number];

export interface SlackWebhookTransportConfig {
  kind: "webhook";
  webhook_url_env: string;
}

export interface SlackBotTokenTransportConfig {
  kind: "bot-token";
  bot_token_env: string;
}

export type SlackTransportConfig = SlackWebhookTransportConfig | SlackBotTokenTransportConfig;

export interface SlackDmRoutingConfig {
  enabled: boolean;
  resolver_fields: string[];
  user_map: Record<string, string>;
  fallback_to_default_channel: boolean;
}

export interface SlackSeverityRoutingConfig {
  minimum_level: HumanInterruptionLevel;
  level_modes: Record<HumanInterruptionLevel, SlackDeliveryMode>;
}

export interface SlackDigestConfig {
  enabled: boolean;
  default_channel: string | null;
  cadence_minutes: number | null;
  max_entries: number;
  group_by: SlackDigestGroupBy[];
}

export interface SlackNotificationConfig {
  version: typeof SLACK_NOTIFICATION_CONFIG_VERSION;
  enabled: boolean;
  transport: SlackTransportConfig;
  default_channel: string;
  dm_routing: SlackDmRoutingConfig;
  severity_routing: SlackSeverityRoutingConfig;
  digest: SlackDigestConfig;
}

export interface SlackDeliveryRecordLink {
  artifact_path: string;
  artifact_type: "human-question" | "human-question-digest" | "run-event";
  artifact_id: string;
}

export interface SlackDeliveryRequest {
  destination: {
    kind: "channel" | "dm";
    channel_id: string | null;
    channel_name: string | null;
    slack_user_id: string | null;
    resolver_key: string | null;
  };
  delivery_mode: SlackDeliveryMode;
  level: HumanInterruptionLevel;
  title: string;
  body: string;
  fallback_text: string;
  source: SlackDeliveryRecordLink;
  emitted_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => entry !== null);
  return normalized.length > 0 ? [...new Set(normalized)] : [...fallback];
}

function normalizeLevel(value: unknown, fallback: HumanInterruptionLevel): HumanInterruptionLevel {
  return value === "level_1" || value === "level_2" || value === "level_3" ? value : fallback;
}

function normalizeDeliveryMode(value: unknown, fallback: SlackDeliveryMode): SlackDeliveryMode {
  return value === "suppressed" ||
    value === "digest" ||
    value === "immediate" ||
    value === "urgent"
    ? value
    : fallback;
}

function normalizeDigestGroupBy(value: unknown, fallback: SlackDigestGroupBy[]): SlackDigestGroupBy[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value.filter(
    (entry): entry is SlackDigestGroupBy =>
      entry === "interruption_level" || entry === "run" || entry === "lane" || entry === "age"
  );
  return normalized.length > 0 ? [...new Set(normalized)] : [...fallback];
}

function normalizeTransport(value: unknown): SlackTransportConfig {
  if (!isRecord(value)) {
    return { kind: "webhook", webhook_url_env: "SLACK_WEBHOOK_URL" };
  }

  if (value.kind === "bot-token") {
    return {
      kind: "bot-token",
      bot_token_env: normalizeString(value.bot_token_env) ?? "SLACK_BOT_TOKEN",
    };
  }

  return {
    kind: "webhook",
    webhook_url_env: normalizeString(value.webhook_url_env) ?? "SLACK_WEBHOOK_URL",
  };
}

export function normalizeSlackNotificationConfig(value: unknown): SlackNotificationConfig {
  if (!isRecord(value)) {
    throw new Error("devory: slack notification config must be a JSON object");
  }

  const transport = normalizeTransport(value.transport);
  const defaultChannel = normalizeString(value.default_channel) ?? "#devory-alerts";
  const dmRouting = isRecord(value.dm_routing) ? value.dm_routing : {};
  const severityRouting = isRecord(value.severity_routing) ? value.severity_routing : {};
  const severityLevelModes = isRecord(severityRouting.level_modes)
    ? severityRouting.level_modes
    : {};
  const digest = isRecord(value.digest) ? value.digest : {};

  return {
    version: SLACK_NOTIFICATION_CONFIG_VERSION,
    enabled: normalizeBoolean(value.enabled, true),
    transport,
    default_channel: defaultChannel,
    dm_routing: {
      enabled: normalizeBoolean(dmRouting.enabled, false),
      resolver_fields: normalizeStringArray(dmRouting.resolver_fields, [
        "slack_user_id",
        "owner",
        "assignee",
      ]),
      user_map: isRecord(dmRouting.user_map)
        ? Object.fromEntries(
            Object.entries(dmRouting.user_map)
              .map(([key, mapped]) => [key.trim(), normalizeString(mapped)])
              .filter((entry): entry is [string, string] => entry[0] !== "" && entry[1] !== null)
          )
        : {},
      fallback_to_default_channel: normalizeBoolean(dmRouting.fallback_to_default_channel, true),
    },
    severity_routing: {
      minimum_level: normalizeLevel(severityRouting.minimum_level, "level_1"),
      level_modes: {
        level_1: normalizeDeliveryMode(severityLevelModes["level_1"], "digest"),
        level_2: normalizeDeliveryMode(severityLevelModes["level_2"], "immediate"),
        level_3: normalizeDeliveryMode(severityLevelModes["level_3"], "urgent"),
      },
    },
    digest: {
      enabled: normalizeBoolean(digest.enabled, true),
      default_channel: normalizeString(digest.default_channel),
      cadence_minutes: normalizePositiveInteger(digest.cadence_minutes, 30),
      max_entries: normalizePositiveInteger(digest.max_entries, 20) ?? 20,
      group_by: normalizeDigestGroupBy(digest.group_by, ["interruption_level", "run"]),
    },
  };
}
