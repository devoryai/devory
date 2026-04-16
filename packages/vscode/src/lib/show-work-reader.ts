/**
 * packages/vscode/src/lib/show-work-reader.ts
 *
 * Aggregates real task and execution state for the Show Work panel.
 * Reads from the filesystem only — no VS Code API dependency.
 */

import * as fs from "fs";
import * as path from "path";
import {
  buildProviderDoctorSnapshot,
  buildProviderTargetRegistry,
  buildRegistryFromEnvironment,
  resolveRoutingPolicy,
  type ProviderDoctorReachability,
  type RoutingPolicy,
} from "@devory/core";
import { parseFrontmatter } from "@devory/core";
import { readExecutionOutcomeLedger } from "./execution-outcome-summary.js";
import { getRunById } from "./run-reader.js";
import { listTasksInStage, type TaskSummary } from "./task-reader.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HeartbeatRecord {
  version?: string;
  run_id: string;
  started_at?: string;
  last_heartbeat_at?: string;
  last_progress_at?: string;
  current_phase?: string;
  current_task_id?: string | null;
  current_adapter?: string | null;
  current_attempt?: number;
  recent_event_summary?: string | null;
  suspicion_flags?: string[];
  source?: string;
}

export interface TaskWithExtras extends TaskSummary {
  agent: string | null;
  filesLikelyAffected: string[];
}

export interface ProviderReadinessItem {
  label: string;
  supportLevel: string;
  configured: boolean;
  reachable: ProviderDoctorReachability;
  routeable: boolean;
  summary: string;
}

export interface ShowWorkData {
  doingTasks: TaskWithExtras[];
  reviewTasks: TaskWithExtras[];
  latestHeartbeat: HeartbeatRecord | null;
  /** True if the heartbeat was written within the last 10 minutes. */
  isHeartbeatFresh: boolean;
  routingTruth: RoutingTruthRecord | null;
  providerReadiness: ProviderReadinessItem[];
  lastRunSummary: LastRunSummary | null;
  failureSummary: FailureSummary | null;
  recentActivity: ActivityItem[];
}

export interface RoutingTruthRecord {
  runId: string | null;
  taskIds: string[];
  selectedRoute: string | null;
  actualRoute: string | null;
  status: string | null;
  reason: string | null;
  fallbackTaken: boolean;
  decompositionRecommended: boolean;
  recordedAt: string;
}

export interface LastRunSummary {
  taskCount: number;
  primaryProvider: string;
  result: "Completed" | "Partial" | "Failed";
  fallbackOccurred: boolean;
  recordedAt: string;
}

export interface FailureSummary {
  reason: string;
  attempted: string | null;
  failedAt: string;
  fallback: string;
}

export interface ActivityItem {
  label: string;
  detail: string;
  recordedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract agent and files_likely_affected from a task file. */
function readTaskExtras(filepath: string): {
  agent: string | null;
  filesLikelyAffected: string[];
} {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const { meta } = parseFrontmatter(content);
    const files = Array.isArray(meta.files_likely_affected)
      ? (meta.files_likely_affected as unknown[])
          .filter((f): f is string => typeof f === "string")
          .slice(0, 5)
      : [];
    return {
      agent: typeof meta.agent === "string" ? meta.agent : null,
      filesLikelyAffected: files,
    };
  } catch {
    return { agent: null, filesLikelyAffected: [] };
  }
}

/** Read the newest heartbeat file from artifacts/heartbeats/. */
export function readLatestHeartbeat(artifactsDir: string): {
  record: HeartbeatRecord | null;
  isFresh: boolean;
} {
  const heartbeatsDir = path.join(artifactsDir, "heartbeats");
  if (!fs.existsSync(heartbeatsDir)) return { record: null, isFresh: false };

  const files = fs
    .readdirSync(heartbeatsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return { record: null, isFresh: false };

  try {
    const raw = fs.readFileSync(path.join(heartbeatsDir, files[0]), "utf-8");
    const record = JSON.parse(raw) as HeartbeatRecord;
    const ts = record.last_heartbeat_at ?? record.started_at;
    const ageMs = ts ? Date.now() - new Date(ts).getTime() : Infinity;
    // Consider fresh if written within the last 10 minutes.
    const isFresh = ageMs < 10 * 60 * 1000;
    return { record, isFresh };
  } catch {
    return { record: null, isFresh: false };
  }
}

function formatRoute(
  providerClass: string | null,
  targetId: string | null,
  adapterId: string | null
): string | null {
  if (!providerClass && !targetId && !adapterId) {
    return null;
  }

  const parts = [providerClass ?? "unknown"];
  if (targetId) {
    parts.push(`-> ${targetId}`);
  }
  if (adapterId) {
    parts.push(`via ${adapterId}`);
  }
  return parts.join(" ");
}

function normalizeSentence(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function formatProviderDisplay(route: RoutingTruthRecord | null, fallback = "Unknown"): string {
  if (route?.actualRoute) {
    return route.actualRoute;
  }
  if (route?.selectedRoute) {
    return route.selectedRoute;
  }
  return fallback;
}

function deriveLastRunResult(input: {
  status: string | null;
  reviewCount: number;
  failureCount: number;
  taskCount: number;
}): LastRunSummary["result"] {
  if (input.status === "completed" && input.failureCount === 0 && input.reviewCount === 0) {
    return "Completed";
  }

  if (
    input.status === "failed" ||
    input.status === "blocked" ||
    input.status === "cancelled"
  ) {
    return input.taskCount > 0 ? "Partial" : "Failed";
  }

  if (input.reviewCount > 0 || input.failureCount > 0 || input.status === "no-op") {
    return "Partial";
  }

  return "Completed";
}

function buildLastRunSummary(
  routingTruth: RoutingTruthRecord | null,
  runRecord: ReturnType<typeof getRunById>
): LastRunSummary | null {
  if (!routingTruth && !runRecord) {
    return null;
  }

  const runSummary = runRecord?.routing_ledger.run_summary;
  const taskCount =
    runSummary?.tasks_executed_count ??
    runRecord?.tasks_executed.length ??
    routingTruth?.taskIds.length ??
    0;
  const failureCount = runSummary?.failure_count ?? 0;
  const reviewCount = runSummary?.review_count ?? 0;
  const primaryProvider =
    runSummary?.models_used[0] ??
    runSummary?.providers_used[0] ??
    formatProviderDisplay(routingTruth);

  return {
    taskCount,
    primaryProvider,
    result: deriveLastRunResult({
      status: routingTruth?.status ?? null,
      reviewCount,
      failureCount,
      taskCount,
    }),
    fallbackOccurred:
      (runSummary?.fallback_count ?? 0) > 0 || routingTruth?.fallbackTaken === true,
    recordedAt: routingTruth?.recordedAt ?? runRecord?.end_time ?? runRecord?.start_time ?? "",
  };
}

function buildFailureSummary(
  routingTruth: RoutingTruthRecord | null,
  runRecord: ReturnType<typeof getRunById>
): FailureSummary | null {
  const status = routingTruth?.status ?? null;
  if (status !== "failed" && status !== "blocked" && status !== "cancelled") {
    return null;
  }

  const failureReason =
    normalizeSentence(
      routingTruth?.reason ??
        runRecord?.failure?.reason ??
        (status === "blocked"
          ? "No valid execution target available"
          : status === "cancelled"
            ? "Execution stopped before completion"
            : "Execution stopped due to provider error")
    ) ?? "Execution stopped.";

  const attempted = routingTruth?.selectedRoute ?? routingTruth?.actualRoute ?? null;
  const actualRoute = routingTruth?.actualRoute ?? null;
  const fallback =
    routingTruth?.fallbackTaken && routingTruth?.selectedRoute && actualRoute
      ? `Attempted ${routingTruth.selectedRoute} -> fell back to ${actualRoute} -> ${status === "cancelled" ? "stopped" : "failed"}.`
      : routingTruth?.fallbackTaken && actualRoute
        ? `Fallback attempted via ${actualRoute}.`
        : "No fallback available under current policy.";

  const failedAt =
    status === "blocked"
      ? normalizeSentence(
          runRecord?.failure?.reason
            ? `Launch was blocked: ${runRecord.failure.reason}`
            : "Execution was blocked before launch"
        ) ?? "Execution was blocked before launch."
      : normalizeSentence(
          actualRoute ? `Execution stopped on ${actualRoute}` : "Execution stopped after launch"
        ) ?? "Execution stopped after launch.";

  return {
    reason: failureReason,
    attempted,
    failedAt,
    fallback,
  };
}

function buildRecentActivity(
  heartbeat: HeartbeatRecord | null,
  routingTruth: RoutingTruthRecord | null,
  runRecord: ReturnType<typeof getRunById>
): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (heartbeat?.recent_event_summary) {
    items.push({
      label: "Live",
      detail: heartbeat.recent_event_summary,
      recordedAt: heartbeat.last_heartbeat_at ?? heartbeat.started_at ?? null,
    });
  }

  const recentProgress = [...(runRecord?.progress_events ?? [])]
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-3);
  for (const event of recentProgress) {
    items.push({
      label: "Run Output",
      detail: event.summary,
      recordedAt: event.created_at,
    });
  }

  if (routingTruth?.reason) {
    items.push({
      label: "Outcome",
      detail: routingTruth.reason,
      recordedAt: routingTruth.recordedAt,
    });
  }

  const unique: ActivityItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.label}:${item.detail}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique.slice(-4).reverse();
}

function readProviderReadiness(factoryRoot: string): ProviderReadinessItem[] {
  const env = process.env as Record<string, string | undefined>;
  let policy: RoutingPolicy | undefined;
  try {
    policy = resolveRoutingPolicy(factoryRoot).policy;
  } catch {
    policy = undefined;
  }

  const providerRegistry = buildRegistryFromEnvironment(
    env,
    policy ? policy.cloud_allowed && !policy.local_only : true
  );
  const targetRegistry = buildProviderTargetRegistry({
    env,
    policy,
    provider_registry: providerRegistry,
  });
  const snapshot = buildProviderDoctorSnapshot({
    env,
    policy,
    target_registry: targetRegistry,
  });

  return snapshot.providers
    .filter((row) => row.support_level !== "unsupported")
    .map((row) => ({
      label: row.label,
      supportLevel: row.support_level,
      configured: row.configured,
      reachable: row.reachable,
      routeable: row.routeable,
      summary: row.routeable ? row.routeable_detail : row.summary,
    }));
}

function pickLatestRoutingTruthRecord(
  artifactsDir: string,
  activeRunId: string | null
): RoutingTruthRecord | null {
  const ledgerPath = path.join(
    artifactsDir,
    "routing-outcomes",
    "execution-outcomes.jsonl"
  );
  const ledger = readExecutionOutcomeLedger(ledgerPath);
  if (ledger.records.length === 0) {
    return null;
  }

  const matchingRecord =
    activeRunId !== null
      ? [...ledger.records]
          .reverse()
          .find((record) => record.run_id === activeRunId) ?? null
      : null;
  const record = matchingRecord ?? ledger.records[ledger.records.length - 1] ?? null;
  if (!record) {
    return null;
  }
  const reason =
    record.run_result_status === "failed" ||
    record.run_result_status === "blocked" ||
    record.run_result_status === "cancelled"
      ? record.failure_reason ?? record.fallback_reason
      : record.fallback_reason ?? record.failure_reason;

  return {
    runId: record.run_id,
    taskIds: record.task_ids,
    selectedRoute: formatRoute(
      record.selected_provider_class,
      record.selected_target_id,
      record.selected_adapter_id
    ),
    actualRoute: formatRoute(
      record.actual_provider_class,
      record.actual_target_id,
      record.actual_adapter_id
    ),
    status: record.run_result_status,
    reason,
    fallbackTaken: record.fallback_taken,
    decompositionRecommended: record.decomposition_recommended === true,
    recordedAt: record.recorded_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Aggregate all data needed to render the Show Work panel. */
export function readShowWorkData(
  tasksDir: string,
  artifactsDir: string
): ShowWorkData {
  const enrich = (task: TaskSummary): TaskWithExtras => ({
    ...task,
    ...readTaskExtras(task.filepath),
  });

  const doingTasks = listTasksInStage(tasksDir, "doing").map(enrich);
  const reviewTasks = listTasksInStage(tasksDir, "review").map(enrich);

  const { record: latestHeartbeat, isFresh: isHeartbeatFresh } =
    readLatestHeartbeat(artifactsDir);
  const routingTruth = pickLatestRoutingTruthRecord(
    artifactsDir,
    latestHeartbeat?.run_id ?? null
  );
  const providerReadiness = readProviderReadiness(path.dirname(tasksDir));
  const runsDir = path.join(path.dirname(tasksDir), "runs");
  const runRecord =
    routingTruth?.runId ? getRunById(runsDir, routingTruth.runId) : null;

  return {
    doingTasks,
    reviewTasks,
    latestHeartbeat,
    isHeartbeatFresh,
    routingTruth,
    providerReadiness,
    lastRunSummary: buildLastRunSummary(routingTruth, runRecord),
    failureSummary: buildFailureSummary(routingTruth, runRecord),
    recentActivity: buildRecentActivity(latestHeartbeat, routingTruth, runRecord),
  };
}

/** Format a timestamp as a short relative string, e.g. "3 min ago". */
export function formatRelativeTime(isoTs: string | undefined): string {
  if (!isoTs) return "";
  const ageMs = Date.now() - new Date(isoTs).getTime();
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)} min ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)} hr ago`;
  return `${Math.floor(ageMs / 86_400_000)} day(s) ago`;
}
