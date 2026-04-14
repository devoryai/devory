import type { TaskMeta } from "./parse.ts";

export type DryRunSizeTier = "small" | "medium" | "large";
export type DryRunEstimateConfidence = "low" | "medium" | "high";

export interface DryRunPricingEntry {
  model_id: string;
  display_name: string;
  runner: string;
  input_usd_per_1k_tokens: number;
  output_usd_per_1k_tokens: number;
  notes: string;
}

export interface DryRunEstimateSuggestion {
  model_id: string;
  display_name: string;
  runner: string;
  estimated_cost_usd: {
    min: number;
    max: number;
  };
  reason: string;
}

export interface DryRunEstimateFactors {
  task_count: number;
  task_body_length: number;
  acceptance_criteria_length: number;
  verification_length: number;
  files_likely_affected_count: number;
  governance_context_likely_included: boolean;
  doctrine_context_likely_included: boolean;
}

export interface DryRunEstimate {
  estimate_label: "estimate";
  model_id: string | null;
  model_display_name: string;
  runner: string;
  context_tier: DryRunSizeTier;
  output_tier: DryRunSizeTier;
  estimated_input_tokens: { min: number; max: number };
  estimated_output_tokens: { min: number; max: number };
  estimated_total_tokens: { min: number; max: number };
  estimated_cost_usd: { min: number; max: number };
  confidence: DryRunEstimateConfidence;
  reasons: string[];
  factors: DryRunEstimateFactors;
  lower_cost_suggestion: DryRunEstimateSuggestion | null;
}

export interface DryRunEstimateOptions {
  selected_model_id?: string | null;
  selected_runner?: string | null;
  fallback_model_id?: string | null;
  fallback_runner?: string | null;
  available_model_ids?: string[];
  include_governance_context?: boolean;
  include_doctrine_context?: boolean;
}

export interface DryRunTaskSource {
  meta?: Partial<TaskMeta> | null;
  body?: string | null;
}

interface TaskSignals {
  task_body_length: number;
  acceptance_criteria_length: number;
  verification_length: number;
  files_likely_affected_count: number;
}

const UNKNOWN_MODEL_ID = "unknown-default-model";

/**
 * Static pricing map for dry-run estimation.
 * Values are USD per 1K tokens and intentionally coarse for planning visibility.
 */
export const DRY_RUN_MODEL_PRICING: Record<string, DryRunPricingEntry> = {
  "claude-sonnet-4-6": {
    model_id: "claude-sonnet-4-6",
    display_name: "Claude Sonnet 4.6",
    runner: "claude",
    input_usd_per_1k_tokens: 0.003,
    output_usd_per_1k_tokens: 0.015,
    notes: "Approximate Anthropic-tier pricing bucket.",
  },
  "gpt-5-mini": {
    model_id: "gpt-5-mini",
    display_name: "GPT-5 Mini",
    runner: "openai",
    input_usd_per_1k_tokens: 0.001,
    output_usd_per_1k_tokens: 0.004,
    notes: "Approximate OpenAI small-model pricing bucket.",
  },
  "github-copilot-cli": {
    model_id: "github-copilot-cli",
    display_name: "GitHub Copilot CLI",
    runner: "copilot",
    input_usd_per_1k_tokens: 0.001,
    output_usd_per_1k_tokens: 0.004,
    notes: "Estimated usage-equivalent cost for subscription-backed runner.",
  },
  "qwen2.5-coder:7b": {
    model_id: "qwen2.5-coder:7b",
    display_name: "Qwen 2.5 Coder 7B (Ollama)",
    runner: "ollama",
    input_usd_per_1k_tokens: 0,
    output_usd_per_1k_tokens: 0,
    notes: "Self-hosted local model; direct model usage cost treated as zero.",
  },
  "llama3.1:8b": {
    model_id: "llama3.1:8b",
    display_name: "Llama 3.1 8B (Ollama)",
    runner: "ollama",
    input_usd_per_1k_tokens: 0,
    output_usd_per_1k_tokens: 0,
    notes: "Self-hosted local model; direct model usage cost treated as zero.",
  },
  "factory-dry-run": {
    model_id: "factory-dry-run",
    display_name: "Factory Dry Run",
    runner: "dry-run",
    input_usd_per_1k_tokens: 0,
    output_usd_per_1k_tokens: 0,
    notes: "Internal dry-run execution mode with no provider usage billing.",
  },
  [UNKNOWN_MODEL_ID]: {
    model_id: UNKNOWN_MODEL_ID,
    display_name: "Workspace default model (unknown)",
    runner: "unknown-runner",
    input_usd_per_1k_tokens: 0.002,
    output_usd_per_1k_tokens: 0.008,
    notes: "Fallback estimate bucket when the exact model is not known.",
  },
};

const PREFERRED_LOW_COST_MODELS = [
  "factory-dry-run",
  "qwen2.5-coder:7b",
  "llama3.1:8b",
] as const;

function toSizeTier(score: number): DryRunSizeTier {
  if (score >= 18_000) return "large";
  if (score >= 8_000) return "medium";
  return "small";
}

function toOutputTier(score: number): DryRunSizeTier {
  if (score >= 2_400) return "large";
  if (score >= 900) return "medium";
  return "small";
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value;
}

function sectionContent(body: string, heading: string): string {
  const regex = new RegExp(`^##\\s+${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|$)`, "im");
  const match = body.match(regex);
  return match ? match[1].trim() : "";
}

function listLength(section: string): number {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .join("\n")
    .length;
}

function taskSignalsFromSource(source: DryRunTaskSource): TaskSignals {
  const body = typeof source.body === "string" ? source.body : "";
  const meta = source.meta ?? {};

  const acceptanceText = sectionContent(body, "Acceptance Criteria");
  const verificationText =
    sectionContent(body, "Verification") ||
    sectionContent(body, "Verification Steps") ||
    sectionContent(body, "Outputs / Verification");

  const verificationMeta = Array.isArray(meta.verification)
    ? meta.verification.filter((entry): entry is string => typeof entry === "string").join("\n")
    : "";

  const filesCount = Array.isArray(meta.files_likely_affected)
    ? meta.files_likely_affected.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .length
    : 0;

  return {
    task_body_length: body.length,
    acceptance_criteria_length: Math.max(acceptanceText.length, listLength(acceptanceText)),
    verification_length: Math.max(verificationText.length, verificationMeta.length, listLength(verificationText)),
    files_likely_affected_count: filesCount,
  };
}

function aggregateTaskSignals(sources: DryRunTaskSource[]): TaskSignals {
  return sources.reduce<TaskSignals>(
    (acc, source) => {
      const next = taskSignalsFromSource(source);
      return {
        task_body_length: acc.task_body_length + next.task_body_length,
        acceptance_criteria_length:
          acc.acceptance_criteria_length + next.acceptance_criteria_length,
        verification_length: acc.verification_length + next.verification_length,
        files_likely_affected_count:
          acc.files_likely_affected_count + next.files_likely_affected_count,
      };
    },
    {
      task_body_length: 0,
      acceptance_criteria_length: 0,
      verification_length: 0,
      files_likely_affected_count: 0,
    }
  );
}

function resolveModelPricing(options: DryRunEstimateOptions): DryRunPricingEntry {
  const preferred =
    typeof options.selected_model_id === "string" && options.selected_model_id.trim() !== ""
      ? options.selected_model_id.trim()
      : null;
  const fallback =
    typeof options.fallback_model_id === "string" && options.fallback_model_id.trim() !== ""
      ? options.fallback_model_id.trim()
      : null;

  if (preferred && DRY_RUN_MODEL_PRICING[preferred]) {
    return DRY_RUN_MODEL_PRICING[preferred];
  }
  if (fallback && DRY_RUN_MODEL_PRICING[fallback]) {
    return DRY_RUN_MODEL_PRICING[fallback];
  }
  return DRY_RUN_MODEL_PRICING[UNKNOWN_MODEL_ID];
}

function resolveRunnerLabel(pricing: DryRunPricingEntry, options: DryRunEstimateOptions): string {
  if (typeof options.selected_runner === "string" && options.selected_runner.trim() !== "") {
    return options.selected_runner.trim();
  }
  if (pricing.runner !== "unknown-runner") {
    return pricing.runner;
  }
  if (typeof options.fallback_runner === "string" && options.fallback_runner.trim() !== "") {
    return options.fallback_runner.trim();
  }
  return "workspace-default-runner";
}

function deriveConfidence(
  factors: DryRunEstimateFactors,
  modelKnown: boolean
): DryRunEstimateConfidence {
  const hasRichTaskSignals =
    factors.task_body_length > 0 &&
    (factors.acceptance_criteria_length > 0 || factors.verification_length > 0);

  if (!modelKnown) return "low";
  if (factors.task_count === 0) return "low";
  if (hasRichTaskSignals && factors.files_likely_affected_count > 0) return "high";
  return "medium";
}

function computeTokenEstimates(factors: DryRunEstimateFactors) {
  const structuralChars =
    factors.task_body_length +
    factors.acceptance_criteria_length * 1.4 +
    factors.verification_length * 1.2 +
    factors.files_likely_affected_count * 90;

  const contentTokens = Math.ceil(structuralChars / 4);
  const contextOverhead =
    1_200 +
    (factors.governance_context_likely_included ? 700 : 0) +
    (factors.doctrine_context_likely_included ? 900 : 0);

  const promptBase = contentTokens + contextOverhead;
  const inputMin = clampMin(Math.round(promptBase * 0.9), 450);
  const inputMax = clampMin(Math.round(promptBase * 1.9), 1_000);

  const outputScore =
    factors.acceptance_criteria_length * 0.9 +
    factors.verification_length * 0.7 +
    factors.files_likely_affected_count * 120 +
    factors.task_body_length * 0.18;

  const outputTier = toOutputTier(outputScore);
  if (outputTier === "small") {
    return {
      inputMin,
      inputMax,
      outputTier,
      outputMin: clampMin(280 + factors.files_likely_affected_count * 40, 280),
      outputMax: clampMin(1_100 + factors.files_likely_affected_count * 130, 1_100),
    };
  }

  if (outputTier === "medium") {
    return {
      inputMin,
      inputMax,
      outputTier,
      outputMin: clampMin(900 + factors.files_likely_affected_count * 80, 900),
      outputMax: clampMin(3_100 + factors.files_likely_affected_count * 220, 3_100),
    };
  }

  return {
    inputMin,
    inputMax,
    outputTier,
    outputMin: clampMin(2_000 + factors.files_likely_affected_count * 120, 2_000),
    outputMax: clampMin(7_000 + factors.files_likely_affected_count * 320, 7_000),
  };
}

function computeCostRange(
  pricing: DryRunPricingEntry,
  tokens: { inputMin: number; inputMax: number; outputMin: number; outputMax: number }
): { min: number; max: number } {
  const min =
    (tokens.inputMin / 1000) * pricing.input_usd_per_1k_tokens +
    (tokens.outputMin / 1000) * pricing.output_usd_per_1k_tokens;
  const max =
    (tokens.inputMax / 1000) * pricing.input_usd_per_1k_tokens +
    (tokens.outputMax / 1000) * pricing.output_usd_per_1k_tokens;

  return {
    min: roundUsd(min),
    max: roundUsd(max),
  };
}

function buildLowerCostSuggestion(
  pricing: DryRunPricingEntry,
  tokens: { inputMin: number; inputMax: number; outputMin: number; outputMax: number },
  availableModelIds: string[] | undefined
): DryRunEstimateSuggestion | null {
  if (pricing.input_usd_per_1k_tokens === 0 && pricing.output_usd_per_1k_tokens === 0) {
    return null;
  }

  const allowed =
    availableModelIds && availableModelIds.length > 0
      ? new Set(availableModelIds)
      : null;

  const candidateId = PREFERRED_LOW_COST_MODELS.find((id) => {
    if (!DRY_RUN_MODEL_PRICING[id]) return false;
    if (!allowed) return true;
    return allowed.has(id);
  });

  if (!candidateId) return null;
  const candidate = DRY_RUN_MODEL_PRICING[candidateId];
  const cost = computeCostRange(candidate, tokens);

  return {
    model_id: candidate.model_id,
    display_name: candidate.display_name,
    runner: candidate.runner,
    estimated_cost_usd: cost,
    reason:
      candidate.input_usd_per_1k_tokens === 0 && candidate.output_usd_per_1k_tokens === 0
        ? "Lower-cost option is likely available via self-hosted/dry-run execution."
        : "Lower-cost model option may reduce run spend for this task.",
  };
}

function buildReasons(
  factors: DryRunEstimateFactors,
  pricing: DryRunPricingEntry,
  modelKnown: boolean,
  confidence: DryRunEstimateConfidence
): string[] {
  const reasons: string[] = [
    `${factors.task_count} task(s) considered for this estimate.`,
    `Task content signal uses body (${factors.task_body_length} chars), acceptance criteria (${factors.acceptance_criteria_length} chars), verification (${factors.verification_length} chars), and files likely affected (${factors.files_likely_affected_count}).`,
  ];

  if (factors.governance_context_likely_included || factors.doctrine_context_likely_included) {
    reasons.push("Factory governance and doctrine context overhead is included as a planning heuristic.");
  }

  reasons.push(
    modelKnown
      ? `Pricing uses static local model map for ${pricing.display_name}.`
      : "Exact model was not available; fallback pricing bucket was used."
  );

  if (confidence === "low") {
    reasons.push("Confidence is low because model/task metadata is incomplete.");
  }

  return reasons;
}

export function estimateDryRunForTaskSources(
  sources: DryRunTaskSource[],
  options: DryRunEstimateOptions = {}
): DryRunEstimate {
  const aggregated = aggregateTaskSignals(sources);
  const factors: DryRunEstimateFactors = {
    task_count: sources.length,
    task_body_length: aggregated.task_body_length,
    acceptance_criteria_length: aggregated.acceptance_criteria_length,
    verification_length: aggregated.verification_length,
    files_likely_affected_count: aggregated.files_likely_affected_count,
    governance_context_likely_included: options.include_governance_context ?? true,
    doctrine_context_likely_included: options.include_doctrine_context ?? true,
  };

  const pricing = resolveModelPricing(options);
  const modelKnown = pricing.model_id !== UNKNOWN_MODEL_ID;

  if (sources.length === 0) {
    return {
      estimate_label: "estimate",
      model_id: modelKnown ? pricing.model_id : null,
      model_display_name: pricing.display_name,
      runner: resolveRunnerLabel(pricing, options),
      context_tier: "small",
      output_tier: "small",
      estimated_input_tokens: { min: 0, max: 0 },
      estimated_output_tokens: { min: 0, max: 0 },
      estimated_total_tokens: { min: 0, max: 0 },
      estimated_cost_usd: { min: 0, max: 0 },
      confidence: "low",
      reasons: [
        "No ready task data was available for estimation.",
        modelKnown
          ? `Pricing model is set to ${pricing.display_name}.`
          : "Exact model was not available; fallback pricing bucket was selected.",
      ],
      factors,
      lower_cost_suggestion: null,
    };
  }

  const confidence = deriveConfidence(factors, modelKnown);
  const tokenEstimates = computeTokenEstimates(factors);

  const contextTier = toSizeTier(tokenEstimates.inputMax);
  const cost = computeCostRange(pricing, tokenEstimates);

  const lowerCostSuggestion = buildLowerCostSuggestion(
    pricing,
    tokenEstimates,
    options.available_model_ids
  );

  return {
    estimate_label: "estimate",
    model_id: modelKnown ? pricing.model_id : null,
    model_display_name: pricing.display_name,
    runner: resolveRunnerLabel(pricing, options),
    context_tier: contextTier,
    output_tier: tokenEstimates.outputTier,
    estimated_input_tokens: { min: tokenEstimates.inputMin, max: tokenEstimates.inputMax },
    estimated_output_tokens: { min: tokenEstimates.outputMin, max: tokenEstimates.outputMax },
    estimated_total_tokens: {
      min: tokenEstimates.inputMin + tokenEstimates.outputMin,
      max: tokenEstimates.inputMax + tokenEstimates.outputMax,
    },
    estimated_cost_usd: cost,
    confidence,
    reasons: buildReasons(factors, pricing, modelKnown, confidence),
    factors,
    lower_cost_suggestion: lowerCostSuggestion,
  };
}

export function estimateDryRunForTask(
  task: DryRunTaskSource,
  options: DryRunEstimateOptions = {}
): DryRunEstimate {
  return estimateDryRunForTaskSources([task], options);
}
