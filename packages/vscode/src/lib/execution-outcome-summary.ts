import * as fs from "fs";
import type {
  ExecutionOutcomeRecord,
  ExecutionOutcomeResultStatus,
} from "./execution-outcome.js";

function asNullableComplexityTier(
  value: unknown
): ExecutionOutcomeRecord["task_profile_summary"] extends infer T
  ? T extends { dominant_complexity_tier: infer U }
    ? U
    : never
  : never {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : null;
}

function asNullableLocalViabilityTier(
  value: unknown
): ExecutionOutcomeRecord["task_profile_summary"] extends infer T
  ? T extends { dominant_local_viability: infer U }
    ? U
    : never
  : never {
  return value === "good" || value === "marginal" || value === "poor"
    ? value
    : null;
}

export interface ExecutionOutcomeSummaryOptions {
  last_n?: number;
  provider_class?: string | null;
  status?: ExecutionOutcomeResultStatus | null;
  fallback_only?: boolean;
  blocked_only?: boolean;
}

export interface ExecutionOutcomeSummary {
  total_records: number;
  malformed_lines: number;
  fallback_count: number;
  blocked_count: number;
  selected_provider_counts: Record<string, number>;
  actual_provider_counts: Record<string, number>;
  target_counts: Record<string, number>;
  status_counts: Record<string, number>;
  top_reasons: Array<{ reason: string; count: number }>;
  estimated_cost_exposure: {
    records_with_estimate: number;
    min_usd_sum: number | null;
    max_usd_sum: number | null;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isExecutionOutcomeResultStatus(
  value: unknown
): value is ExecutionOutcomeResultStatus {
  return (
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "blocked" ||
    value === "no-op"
  );
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseTaskProfileSummary(
  value: unknown
): ExecutionOutcomeRecord["task_profile_summary"] {
  if (!isObject(value)) {
    return null;
  }

  const totalTasks =
    typeof value.total_tasks === "number" && Number.isFinite(value.total_tasks)
      ? value.total_tasks
      : null;
  const dominantComplexity = asNullableComplexityTier(
    value.dominant_complexity_tier
  );
  const dominantLocalViability = asNullableLocalViabilityTier(
    value.dominant_local_viability
  );
  const decompositionCandidates =
    typeof value.decomposition_candidates === "number" &&
    Number.isFinite(value.decomposition_candidates)
      ? value.decomposition_candidates
      : null;
  const mix = isObject(value.recommended_provider_mix)
    ? {
        deterministic:
          typeof value.recommended_provider_mix.deterministic === "number" &&
          Number.isFinite(value.recommended_provider_mix.deterministic)
            ? value.recommended_provider_mix.deterministic
            : 0,
        local:
          typeof value.recommended_provider_mix.local === "number" &&
          Number.isFinite(value.recommended_provider_mix.local)
            ? value.recommended_provider_mix.local
            : 0,
        cloud:
          typeof value.recommended_provider_mix.cloud === "number" &&
          Number.isFinite(value.recommended_provider_mix.cloud)
            ? value.recommended_provider_mix.cloud
            : 0,
      }
    : null;

  if (
    totalTasks === null &&
    dominantComplexity === null &&
    dominantLocalViability === null &&
    decompositionCandidates === null &&
    mix === null
  ) {
    return null;
  }

  return {
    total_tasks: totalTasks ?? 0,
    dominant_complexity_tier: dominantComplexity,
    dominant_local_viability: dominantLocalViability,
    decomposition_candidates: decompositionCandidates ?? 0,
    recommended_provider_mix: mix ?? {
      deterministic: 0,
      local: 0,
      cloud: 0,
    },
  };
}

export function parseExecutionOutcomeLine(
  line: string
): ExecutionOutcomeRecord | null {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isObject(parsed)) {
      return null;
    }

    const version = asNullableString(parsed.version);
    const outcomeId = asNullableString(parsed.outcome_id);
    const recordedAt = asNullableString(parsed.recorded_at);
    const sequence =
      typeof parsed.sequence === "number" && Number.isFinite(parsed.sequence)
        ? parsed.sequence
        : null;

    if (
      version !== "execution-outcome-v1" ||
      outcomeId === null ||
      recordedAt === null ||
      sequence === null
    ) {
      return null;
    }

    return {
      version,
      outcome_id: outcomeId,
      sequence,
      recorded_at: recordedAt,
      run_id: asNullableString(parsed.run_id),
      task_ids: asStringArray(parsed.task_ids),
      task_profile_summary: parseTaskProfileSummary(parsed.task_profile_summary),
      selected_provider_class: asNullableString(parsed.selected_provider_class),
      selected_target_id: asNullableString(parsed.selected_target_id),
      selected_adapter_id: asNullableString(parsed.selected_adapter_id),
      actual_provider_class: asNullableString(parsed.actual_provider_class),
      actual_target_id: asNullableString(parsed.actual_target_id),
      actual_adapter_id: asNullableString(parsed.actual_adapter_id),
      preference_used:
        (asNullableString(parsed.preference_used) as ExecutionOutcomeRecord["preference_used"]) ??
        null,
      fallback_taken: asBoolean(parsed.fallback_taken),
      fallback_reason: asNullableString(parsed.fallback_reason),
      readiness_state: asNullableString(parsed.readiness_state),
      execution_path: asNullableString(parsed.execution_path),
      estimated_cost_usd_min: asNullableNumber(parsed.estimated_cost_usd_min),
      estimated_cost_usd_max: asNullableNumber(parsed.estimated_cost_usd_max),
      run_result_status: isExecutionOutcomeResultStatus(parsed.run_result_status)
        ? parsed.run_result_status
        : null,
      failure_reason: asNullableString(parsed.failure_reason),
      learnable: typeof parsed.learnable === "boolean" ? parsed.learnable : null,
      decomposition_recommended:
        typeof parsed.decomposition_recommended === "boolean"
          ? parsed.decomposition_recommended
          : null,
    };
  } catch {
    return null;
  }
}

export function readExecutionOutcomeLedger(filePath: string): {
  records: ExecutionOutcomeRecord[];
  malformed_lines: number;
} {
  if (!fs.existsSync(filePath)) {
    return { records: [], malformed_lines: 0 };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const records: ExecutionOutcomeRecord[] = [];
  let malformedLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    const parsed = parseExecutionOutcomeLine(trimmed);
    if (parsed) {
      records.push(parsed);
    } else {
      malformedLines += 1;
    }
  }

  return { records, malformed_lines: malformedLines };
}

function incrementCount(
  counts: Record<string, number>,
  key: string | null
): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => {
      const countDelta = right[1] - left[1];
      return countDelta !== 0 ? countDelta : left[0].localeCompare(right[0]);
    })
  );
}

function summarizeReasons(records: ExecutionOutcomeRecord[]): Array<{ reason: string; count: number }> {
  const reasonCounts: Record<string, number> = {};
  for (const record of records) {
    const reason = record.fallback_reason ?? record.failure_reason;
    if (!reason) continue;
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  return Object.entries(reasonCounts)
    .sort((left, right) => {
      const countDelta = right[1] - left[1];
      return countDelta !== 0 ? countDelta : left[0].localeCompare(right[0]);
    })
    .map(([reason, count]) => ({ reason, count }))
    .slice(0, 5);
}

function applySummaryFilters(
  records: ExecutionOutcomeRecord[],
  options: ExecutionOutcomeSummaryOptions = {}
): ExecutionOutcomeRecord[] {
  let filtered = records;

  if (options.provider_class) {
    filtered = filtered.filter(
      (record) =>
        record.selected_provider_class === options.provider_class ||
        record.actual_provider_class === options.provider_class
    );
  }

  if (options.status) {
    filtered = filtered.filter(
      (record) => record.run_result_status === options.status
    );
  }

  if (options.fallback_only) {
    filtered = filtered.filter((record) => record.fallback_taken);
  }

  if (options.blocked_only) {
    filtered = filtered.filter(
      (record) => record.run_result_status === "blocked"
    );
  }

  if (typeof options.last_n === "number" && options.last_n > 0) {
    filtered = filtered.slice(-options.last_n);
  }

  return filtered;
}

export function summarizeExecutionOutcomes(
  records: ExecutionOutcomeRecord[],
  malformedLines = 0,
  options: ExecutionOutcomeSummaryOptions = {}
): ExecutionOutcomeSummary {
  const filtered = applySummaryFilters(records, options);
  const selectedProviderCounts: Record<string, number> = {};
  const actualProviderCounts: Record<string, number> = {};
  const targetCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let fallbackCount = 0;
  let blockedCount = 0;
  let estimateCount = 0;
  let minUsdSum = 0;
  let maxUsdSum = 0;

  for (const record of filtered) {
    incrementCount(selectedProviderCounts, record.selected_provider_class);
    incrementCount(actualProviderCounts, record.actual_provider_class);
    incrementCount(
      targetCounts,
      record.actual_target_id ?? record.selected_target_id
    );
    incrementCount(statusCounts, record.run_result_status);

    if (record.fallback_taken) {
      fallbackCount += 1;
    }
    if (record.run_result_status === "blocked") {
      blockedCount += 1;
    }

    if (
      record.estimated_cost_usd_min !== null &&
      record.estimated_cost_usd_max !== null
    ) {
      estimateCount += 1;
      minUsdSum += record.estimated_cost_usd_min;
      maxUsdSum += record.estimated_cost_usd_max;
    }
  }

  return {
    total_records: filtered.length,
    malformed_lines: malformedLines,
    fallback_count: fallbackCount,
    blocked_count: blockedCount,
    selected_provider_counts: sortedCounts(selectedProviderCounts),
    actual_provider_counts: sortedCounts(actualProviderCounts),
    target_counts: sortedCounts(targetCounts),
    status_counts: sortedCounts(statusCounts),
    top_reasons: summarizeReasons(filtered),
    estimated_cost_exposure: {
      records_with_estimate: estimateCount,
      min_usd_sum: estimateCount > 0 ? Number(minUsdSum.toFixed(2)) : null,
      max_usd_sum: estimateCount > 0 ? Number(maxUsdSum.toFixed(2)) : null,
    },
  };
}

function renderCountSection(
  title: string,
  counts: Record<string, number>,
  emptyLabel: string
): string[] {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return [title, `  ${emptyLabel}`, ""];
  }

  return [
    title,
    ...entries.map(([label, count]) => `  ${label}: ${count}`),
    "",
  ];
}

export function renderExecutionOutcomeSummary(
  summary: ExecutionOutcomeSummary,
  options: ExecutionOutcomeSummaryOptions = {}
): string {
  const filterParts: string[] = [];
  if (options.last_n) filterParts.push(`last ${options.last_n}`);
  if (options.provider_class) filterParts.push(`provider=${options.provider_class}`);
  if (options.status) filterParts.push(`status=${options.status}`);
  if (options.fallback_only) filterParts.push("fallback-only");
  if (options.blocked_only) filterParts.push("blocked-only");

  const lines: string[] = [
    "Devory Routing Outcome Summary",
    "═══════════════════════════════════════════════════════════════",
    filterParts.length > 0 ? `Filters: ${filterParts.join(" · ")}` : "Filters: none",
    `Total records: ${summary.total_records}`,
    `Fallbacks: ${summary.fallback_count}`,
    `Blocked/prevented: ${summary.blocked_count}`,
    `Malformed lines skipped: ${summary.malformed_lines}`,
    "",
    ...renderCountSection(
      "Selected Provider Classes",
      summary.selected_provider_counts,
      "No selected provider data"
    ),
    ...renderCountSection(
      "Actual Provider Classes",
      summary.actual_provider_counts,
      "No actual provider data"
    ),
    ...renderCountSection(
      "Concrete Targets",
      summary.target_counts,
      "No concrete target data"
    ),
    ...renderCountSection(
      "Run Result Statuses",
      summary.status_counts,
      "No status data"
    ),
    "Top Fallback/Block Reasons",
    ...(summary.top_reasons.length > 0
      ? summary.top_reasons.map(
          ({ reason, count }) => `  ${count}x  ${reason}`
        )
      : ["  No fallback or failure reasons recorded"]),
    "",
  ];

  if (summary.estimated_cost_exposure.records_with_estimate > 0) {
    lines.push(
      "Estimated Cost Exposure",
      `  Records with estimate: ${summary.estimated_cost_exposure.records_with_estimate}`,
      `  Aggregate min/max range: $${summary.estimated_cost_exposure.min_usd_sum?.toFixed(2)} - $${summary.estimated_cost_exposure.max_usd_sum?.toFixed(2)}`,
      ""
    );
  }

  return lines.join("\n");
}
