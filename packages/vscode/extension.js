"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../core/src/parse.ts
function parseInlineArray(value) {
  const inlineArrayMatch = value.match(/^\[(.*)\]$/);
  if (!inlineArrayMatch) {
    return null;
  }
  const rawItems = inlineArrayMatch[1].trim();
  if (rawItems === "") {
    return [];
  }
  return rawItems.split(",").map((item) => item.trim().replace(/^['\"]|['\"]$/g, "")).filter((item) => item.length > 0);
}
function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { meta: {}, body: content };
  }
  const closeIdx = lines.indexOf("---", 1);
  if (closeIdx === -1) {
    return { meta: {}, body: content };
  }
  const yamlLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join("\n");
  const meta = {};
  let currentKey = "";
  for (const line of yamlLines) {
    const listMatch = line.match(/^\s+-\s+(.*)/);
    const kvMatch = line.match(/^([\w_][\w_-]*):\s*(.*)/);
    if (listMatch && currentKey) {
      const arr = meta[currentKey];
      if (Array.isArray(arr)) {
        arr.push(listMatch[1].trim());
      }
    } else if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "" || val === "[]") {
        meta[currentKey] = [];
      } else {
        const inlineArray = parseInlineArray(val);
        meta[currentKey] = inlineArray ?? val;
      }
    }
  }
  return { meta, body };
}
var init_parse = __esm({
  "../core/src/parse.ts"() {
    "use strict";
  }
});

// ../core/src/dry-run-estimate.ts
function toSizeTier(score) {
  if (score >= 18e3)
    return "large";
  if (score >= 8e3)
    return "medium";
  return "small";
}
function toOutputTier(score) {
  if (score >= 2400)
    return "large";
  if (score >= 900)
    return "medium";
  return "small";
}
function roundUsd(value) {
  return Math.round(value * 1e4) / 1e4;
}
function clampMin(value, min) {
  return value < min ? min : value;
}
function sectionContent(body, heading) {
  const regex = new RegExp(`^##\\s+${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|$)`, "im");
  const match = body.match(regex);
  return match ? match[1].trim() : "";
}
function listLength(section) {
  return section.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- ") || line.startsWith("* ")).join("\n").length;
}
function taskSignalsFromSource(source) {
  const body = typeof source.body === "string" ? source.body : "";
  const meta = source.meta ?? {};
  const acceptanceText = sectionContent(body, "Acceptance Criteria");
  const verificationText = sectionContent(body, "Verification") || sectionContent(body, "Verification Steps") || sectionContent(body, "Outputs / Verification");
  const verificationMeta = Array.isArray(meta.verification) ? meta.verification.filter((entry) => typeof entry === "string").join("\n") : "";
  const filesCount = Array.isArray(meta.files_likely_affected) ? meta.files_likely_affected.filter((entry) => typeof entry === "string" && entry.trim().length > 0).length : 0;
  return {
    task_body_length: body.length,
    acceptance_criteria_length: Math.max(acceptanceText.length, listLength(acceptanceText)),
    verification_length: Math.max(verificationText.length, verificationMeta.length, listLength(verificationText)),
    files_likely_affected_count: filesCount
  };
}
function aggregateTaskSignals(sources) {
  return sources.reduce(
    (acc, source) => {
      const next = taskSignalsFromSource(source);
      return {
        task_body_length: acc.task_body_length + next.task_body_length,
        acceptance_criteria_length: acc.acceptance_criteria_length + next.acceptance_criteria_length,
        verification_length: acc.verification_length + next.verification_length,
        files_likely_affected_count: acc.files_likely_affected_count + next.files_likely_affected_count
      };
    },
    {
      task_body_length: 0,
      acceptance_criteria_length: 0,
      verification_length: 0,
      files_likely_affected_count: 0
    }
  );
}
function resolveModelPricing(options) {
  const preferred = typeof options.selected_model_id === "string" && options.selected_model_id.trim() !== "" ? options.selected_model_id.trim() : null;
  const fallback = typeof options.fallback_model_id === "string" && options.fallback_model_id.trim() !== "" ? options.fallback_model_id.trim() : null;
  if (preferred && DRY_RUN_MODEL_PRICING[preferred]) {
    return DRY_RUN_MODEL_PRICING[preferred];
  }
  if (fallback && DRY_RUN_MODEL_PRICING[fallback]) {
    return DRY_RUN_MODEL_PRICING[fallback];
  }
  return DRY_RUN_MODEL_PRICING[UNKNOWN_MODEL_ID];
}
function resolveRunnerLabel(pricing, options) {
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
function deriveConfidence(factors, modelKnown) {
  const hasRichTaskSignals = factors.task_body_length > 0 && (factors.acceptance_criteria_length > 0 || factors.verification_length > 0);
  if (!modelKnown)
    return "low";
  if (factors.task_count === 0)
    return "low";
  if (hasRichTaskSignals && factors.files_likely_affected_count > 0)
    return "high";
  return "medium";
}
function computeTokenEstimates(factors) {
  const structuralChars = factors.task_body_length + factors.acceptance_criteria_length * 1.4 + factors.verification_length * 1.2 + factors.files_likely_affected_count * 90;
  const contentTokens = Math.ceil(structuralChars / 4);
  const contextOverhead = 1200 + (factors.governance_context_likely_included ? 700 : 0) + (factors.doctrine_context_likely_included ? 900 : 0);
  const promptBase = contentTokens + contextOverhead;
  const inputMin = clampMin(Math.round(promptBase * 0.9), 450);
  const inputMax = clampMin(Math.round(promptBase * 1.9), 1e3);
  const outputScore = factors.acceptance_criteria_length * 0.9 + factors.verification_length * 0.7 + factors.files_likely_affected_count * 120 + factors.task_body_length * 0.18;
  const outputTier = toOutputTier(outputScore);
  if (outputTier === "small") {
    return {
      inputMin,
      inputMax,
      outputTier,
      outputMin: clampMin(280 + factors.files_likely_affected_count * 40, 280),
      outputMax: clampMin(1100 + factors.files_likely_affected_count * 130, 1100)
    };
  }
  if (outputTier === "medium") {
    return {
      inputMin,
      inputMax,
      outputTier,
      outputMin: clampMin(900 + factors.files_likely_affected_count * 80, 900),
      outputMax: clampMin(3100 + factors.files_likely_affected_count * 220, 3100)
    };
  }
  return {
    inputMin,
    inputMax,
    outputTier,
    outputMin: clampMin(2e3 + factors.files_likely_affected_count * 120, 2e3),
    outputMax: clampMin(7e3 + factors.files_likely_affected_count * 320, 7e3)
  };
}
function computeCostRange(pricing, tokens) {
  const min = tokens.inputMin / 1e3 * pricing.input_usd_per_1k_tokens + tokens.outputMin / 1e3 * pricing.output_usd_per_1k_tokens;
  const max = tokens.inputMax / 1e3 * pricing.input_usd_per_1k_tokens + tokens.outputMax / 1e3 * pricing.output_usd_per_1k_tokens;
  return {
    min: roundUsd(min),
    max: roundUsd(max)
  };
}
function buildLowerCostSuggestion(pricing, tokens, availableModelIds) {
  if (pricing.input_usd_per_1k_tokens === 0 && pricing.output_usd_per_1k_tokens === 0) {
    return null;
  }
  const allowed = availableModelIds && availableModelIds.length > 0 ? new Set(availableModelIds) : null;
  const candidateId = PREFERRED_LOW_COST_MODELS.find((id) => {
    if (!DRY_RUN_MODEL_PRICING[id])
      return false;
    if (!allowed)
      return true;
    return allowed.has(id);
  });
  if (!candidateId)
    return null;
  const candidate = DRY_RUN_MODEL_PRICING[candidateId];
  const cost = computeCostRange(candidate, tokens);
  return {
    model_id: candidate.model_id,
    display_name: candidate.display_name,
    runner: candidate.runner,
    estimated_cost_usd: cost,
    reason: candidate.input_usd_per_1k_tokens === 0 && candidate.output_usd_per_1k_tokens === 0 ? "Lower-cost option is likely available via self-hosted/dry-run execution." : "Lower-cost model option may reduce run spend for this task."
  };
}
function buildReasons(factors, pricing, modelKnown, confidence) {
  const reasons = [
    `${factors.task_count} task(s) considered for this estimate.`,
    `Task content signal uses body (${factors.task_body_length} chars), acceptance criteria (${factors.acceptance_criteria_length} chars), verification (${factors.verification_length} chars), and files likely affected (${factors.files_likely_affected_count}).`
  ];
  if (factors.governance_context_likely_included || factors.doctrine_context_likely_included) {
    reasons.push("Factory governance and doctrine context overhead is included as a planning heuristic.");
  }
  reasons.push(
    modelKnown ? `Pricing uses static local model map for ${pricing.display_name}.` : "Exact model was not available; fallback pricing bucket was used."
  );
  if (confidence === "low") {
    reasons.push("Confidence is low because model/task metadata is incomplete.");
  }
  return reasons;
}
function estimateDryRunForTaskSources(sources, options = {}) {
  const aggregated = aggregateTaskSignals(sources);
  const factors = {
    task_count: sources.length,
    task_body_length: aggregated.task_body_length,
    acceptance_criteria_length: aggregated.acceptance_criteria_length,
    verification_length: aggregated.verification_length,
    files_likely_affected_count: aggregated.files_likely_affected_count,
    governance_context_likely_included: options.include_governance_context ?? true,
    doctrine_context_likely_included: options.include_doctrine_context ?? true
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
        modelKnown ? `Pricing model is set to ${pricing.display_name}.` : "Exact model was not available; fallback pricing bucket was selected."
      ],
      factors,
      lower_cost_suggestion: null
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
      max: tokenEstimates.inputMax + tokenEstimates.outputMax
    },
    estimated_cost_usd: cost,
    confidence,
    reasons: buildReasons(factors, pricing, modelKnown, confidence),
    factors,
    lower_cost_suggestion: lowerCostSuggestion
  };
}
function estimateDryRunForTask(task, options = {}) {
  return estimateDryRunForTaskSources([task], options);
}
var UNKNOWN_MODEL_ID, DRY_RUN_MODEL_PRICING, PREFERRED_LOW_COST_MODELS;
var init_dry_run_estimate = __esm({
  "../core/src/dry-run-estimate.ts"() {
    "use strict";
    UNKNOWN_MODEL_ID = "unknown-default-model";
    DRY_RUN_MODEL_PRICING = {
      "claude-sonnet-4-6": {
        model_id: "claude-sonnet-4-6",
        display_name: "Claude Sonnet 4.6",
        runner: "claude",
        input_usd_per_1k_tokens: 3e-3,
        output_usd_per_1k_tokens: 0.015,
        notes: "Approximate Anthropic-tier pricing bucket."
      },
      "gpt-5-mini": {
        model_id: "gpt-5-mini",
        display_name: "GPT-5 Mini",
        runner: "openai",
        input_usd_per_1k_tokens: 1e-3,
        output_usd_per_1k_tokens: 4e-3,
        notes: "Approximate OpenAI small-model pricing bucket."
      },
      "github-copilot-cli": {
        model_id: "github-copilot-cli",
        display_name: "GitHub Copilot CLI",
        runner: "copilot",
        input_usd_per_1k_tokens: 1e-3,
        output_usd_per_1k_tokens: 4e-3,
        notes: "Estimated usage-equivalent cost for subscription-backed runner."
      },
      "qwen2.5-coder:7b": {
        model_id: "qwen2.5-coder:7b",
        display_name: "Qwen 2.5 Coder 7B (Ollama)",
        runner: "ollama",
        input_usd_per_1k_tokens: 0,
        output_usd_per_1k_tokens: 0,
        notes: "Self-hosted local model; direct model usage cost treated as zero."
      },
      "llama3.1:8b": {
        model_id: "llama3.1:8b",
        display_name: "Llama 3.1 8B (Ollama)",
        runner: "ollama",
        input_usd_per_1k_tokens: 0,
        output_usd_per_1k_tokens: 0,
        notes: "Self-hosted local model; direct model usage cost treated as zero."
      },
      "factory-dry-run": {
        model_id: "factory-dry-run",
        display_name: "Factory Dry Run",
        runner: "dry-run",
        input_usd_per_1k_tokens: 0,
        output_usd_per_1k_tokens: 0,
        notes: "Internal dry-run execution mode with no provider usage billing."
      },
      [UNKNOWN_MODEL_ID]: {
        model_id: UNKNOWN_MODEL_ID,
        display_name: "Workspace default model (unknown)",
        runner: "unknown-runner",
        input_usd_per_1k_tokens: 2e-3,
        output_usd_per_1k_tokens: 8e-3,
        notes: "Fallback estimate bucket when the exact model is not known."
      }
    };
    PREFERRED_LOW_COST_MODELS = [
      "factory-dry-run",
      "qwen2.5-coder:7b",
      "llama3.1:8b"
    ];
  }
});

// ../core/src/external-work-item.ts
var init_external_work_item = __esm({
  "../core/src/external-work-item.ts"() {
    "use strict";
  }
});

// ../core/src/engineering-profile.ts
var init_engineering_profile = __esm({
  "../core/src/engineering-profile.ts"() {
    "use strict";
  }
});

// ../core/src/profile-presets.ts
var init_profile_presets = __esm({
  "../core/src/profile-presets.ts"() {
    "use strict";
  }
});

// ../core/src/active-state.ts
var init_active_state = __esm({
  "../core/src/active-state.ts"() {
    "use strict";
    init_profile_presets();
  }
});

// ../core/src/workspace.ts
var init_workspace = __esm({
  "../core/src/workspace.ts"() {
    "use strict";
  }
});

// ../core/src/sync-manifest.ts
var init_sync_manifest = __esm({
  "../core/src/sync-manifest.ts"() {
    "use strict";
  }
});

// ../core/src/work-context.ts
var init_work_context = __esm({
  "../core/src/work-context.ts"() {
    "use strict";
  }
});

// ../core/src/target-readiness.ts
function trimEnv(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
function inferTargetProviderClass(targetId) {
  if (targetId.startsWith("deterministic:"))
    return "deterministic";
  if (targetId.startsWith("ollama:"))
    return "local_ollama";
  if (targetId.startsWith("cloud:"))
    return "cloud_premium";
  return null;
}
function inferCloudCredentialKind(modelId) {
  const normalized = (modelId ?? "").toLowerCase();
  if (normalized.startsWith("claude"))
    return "anthropic";
  if (normalized.startsWith("gpt") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
    return "openai";
  }
  return "generic";
}
function hasAnthropicCredential(env2) {
  return Boolean(
    trimEnv(env2.ANTHROPIC_API_KEY) ?? trimEnv(env2.CLAUDE_CODE_OAUTH_TOKEN) ?? trimEnv(env2.ANTHROPIC_AUTH_TOKEN)
  );
}
function hasOpenAICredential(env2) {
  return Boolean(trimEnv(env2.OPENAI_API_KEY));
}
function cloudCredentialReadiness(env2, modelId) {
  const kind = inferCloudCredentialKind(modelId);
  if (kind === "anthropic") {
    return hasAnthropicCredential(env2) ? {
      state: "configured_but_unverified",
      detail: "Anthropic credentials detected; API reachability not probed."
    } : {
      state: "unavailable",
      detail: "Anthropic credentials missing. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or ANTHROPIC_AUTH_TOKEN."
    };
  }
  if (kind === "openai") {
    return hasOpenAICredential(env2) ? {
      state: "configured_but_unverified",
      detail: "OpenAI credentials detected; API reachability not probed."
    } : {
      state: "unavailable",
      detail: "OpenAI credentials missing. Set OPENAI_API_KEY."
    };
  }
  if (hasAnthropicCredential(env2) || hasOpenAICredential(env2)) {
    return {
      state: "configured_but_unverified",
      detail: "Cloud credentials detected; model-specific reachability not probed."
    };
  }
  return {
    state: "unavailable",
    detail: "No supported cloud credentials detected for this target."
  };
}
function isCloudBlockedByPolicy(policy) {
  return Boolean(policy && (policy.local_only || !policy.cloud_allowed));
}
function buildBlockedRecord(detail) {
  return { state: "blocked_by_policy", detail };
}
function buildOllamaProviderReadiness(env2, probe) {
  if (probe) {
    if (probe.reachable) {
      return {
        state: "ready",
        detail: probe.models !== null ? `Ollama reachable at ${probe.base_url}; inventory loaded.` : `Ollama reachable at ${probe.base_url}.`
      };
    }
    return {
      state: "unavailable",
      detail: probe.detail ?? `Ollama probe failed for ${probe.base_url}.`
    };
  }
  if (trimEnv(env2.FACTORY_DEFAULT_ENGINE) === "ollama" || trimEnv(env2.OLLAMA_BASE_URL) || trimEnv(env2.OLLAMA_HOST)) {
    return {
      state: "configured_but_unverified",
      detail: "Ollama endpoint configured but not probed in this flow."
    };
  }
  return {
    state: "unknown",
    detail: "Ollama endpoint not configured and readiness was not probed."
  };
}
function buildLocalTargetReadiness(targetId, configured, providerReadiness, probe) {
  if (!configured) {
    return {
      state: "unavailable",
      detail: "Target not configured for this workspace."
    };
  }
  if (providerReadiness.state === "blocked_by_policy")
    return providerReadiness;
  if (providerReadiness.state === "unknown") {
    return {
      state: "configured_but_unverified",
      detail: "Model is configured but current Ollama readiness is unknown."
    };
  }
  if (probe?.reachable && Array.isArray(probe.models)) {
    const modelId = targetId.slice("ollama:".length);
    const present = probe.models.includes(modelId);
    return present ? {
      state: "ready",
      detail: `Model present in Ollama inventory at ${probe.base_url}.`
    } : {
      state: "unavailable",
      detail: `Model ${modelId} not found in Ollama inventory at ${probe.base_url}.`
    };
  }
  if (providerReadiness.state === "ready") {
    return {
      state: "configured_but_unverified",
      detail: "Ollama is reachable, but model inventory could not be confirmed."
    };
  }
  if (providerReadiness.state === "configured_but_unverified") {
    return {
      state: "configured_but_unverified",
      detail: "Ollama is configured, but model presence was not verified."
    };
  }
  return providerReadiness;
}
function isReadinessSelectable(state) {
  return state === "ready" || state === "configured_but_unverified";
}
function resolveOllamaBaseUrl(env2 = process.env) {
  const explicitBaseUrl = trimEnv(env2.OLLAMA_BASE_URL);
  if (explicitBaseUrl)
    return explicitBaseUrl.replace(/\/$/, "");
  const host = trimEnv(env2.OLLAMA_HOST);
  if (host) {
    if (/^https?:\/\//.test(host)) {
      return host.replace(/\/$/, "");
    }
    return `http://${host.replace(/\/$/, "")}`;
  }
  return OLLAMA_DEFAULT_BASE_URL;
}
async function probeOllamaReadiness(options = {}) {
  const env2 = options.env ?? process.env;
  const baseUrl = (options.base_url ?? resolveOllamaBaseUrl(env2)).replace(/\/$/, "");
  const timeoutMs = options.timeout_ms ?? 1200;
  const fetchFn = options.fetch_fn ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    return {
      base_url: baseUrl,
      reachable: false,
      status: null,
      models: null,
      detail: "Fetch API is not available for Ollama probing."
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        base_url: baseUrl,
        reachable: false,
        status: response.status,
        models: null,
        detail: `Ollama probe returned HTTP ${response.status}.`
      };
    }
    const payload = await response.json();
    const models = Array.isArray(payload.models) ? payload.models.map((entry) => {
      if (typeof entry.name === "string")
        return entry.name.trim();
      if (typeof entry.model === "string")
        return entry.model.trim();
      return "";
    }).filter((entry) => entry.length > 0) : null;
    return {
      base_url: baseUrl,
      reachable: true,
      status: response.status,
      models,
      detail: models !== null ? `Loaded ${models.length} Ollama model tag${models.length === 1 ? "" : "s"}.` : "Ollama reachable but model inventory response was incomplete."
    };
  } catch (error) {
    const detail = error instanceof Error ? error.name === "AbortError" ? `Ollama probe timed out after ${timeoutMs}ms.` : error.message : "Unknown Ollama probe failure.";
    return {
      base_url: baseUrl,
      reachable: false,
      status: null,
      models: null,
      detail
    };
  } finally {
    clearTimeout(timeout);
  }
}
function detectTargetReadiness(options = {}) {
  const env2 = options.env ?? process.env;
  const policy = options.policy;
  const targetIds = Array.from(new Set(options.target_ids ?? []));
  const configuredTargetIds = new Set(options.configured_target_ids ?? []);
  const probe = options.ollama_probe;
  const providerClasses = {
    deterministic: {
      state: "ready",
      detail: "Deterministic execution is available without provider probing."
    }
  };
  providerClasses.local_ollama = buildOllamaProviderReadiness(env2, probe);
  providerClasses.cloud_premium = isCloudBlockedByPolicy(policy) ? buildBlockedRecord(
    policy?.local_only ? "Cloud execution is blocked by local-only policy." : "Cloud execution is blocked by routing policy."
  ) : cloudCredentialReadiness(env2, null);
  const targets = {};
  const disabledTargets = new Set(policy?.disabled_targets ?? []);
  for (const targetId of targetIds) {
    const providerClass = inferTargetProviderClass(targetId);
    if (!providerClass)
      continue;
    if (disabledTargets.has(targetId)) {
      targets[targetId] = buildBlockedRecord("Target disabled by routing policy.");
      continue;
    }
    const configured = providerClass === "deterministic" || configuredTargetIds.has(targetId);
    if (!configured) {
      targets[targetId] = {
        state: "unavailable",
        detail: "Target not configured for this workspace."
      };
      continue;
    }
    if (providerClass === "deterministic") {
      targets[targetId] = {
        state: "ready",
        detail: "Deterministic execution requires no external runtime."
      };
      continue;
    }
    if (providerClass === "cloud_premium" && isCloudBlockedByPolicy(policy)) {
      targets[targetId] = buildBlockedRecord(
        policy?.local_only ? "Cloud target blocked by local-only policy." : "Cloud target blocked because cloud execution is disabled."
      );
      continue;
    }
    if (providerClass === "local_ollama") {
      targets[targetId] = buildLocalTargetReadiness(
        targetId,
        true,
        providerClasses.local_ollama ?? { state: "unknown", detail: null },
        probe
      );
      continue;
    }
    const modelId = targetId.startsWith("cloud:") ? targetId.slice("cloud:".length) : null;
    targets[targetId] = cloudCredentialReadiness(env2, modelId);
  }
  return {
    provider_classes: providerClasses,
    targets
  };
}
var OLLAMA_DEFAULT_BASE_URL;
var init_target_readiness = __esm({
  "../core/src/target-readiness.ts"() {
    "use strict";
    OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
  }
});

// ../core/src/license.ts
var path2, LICENSE_FILE, LICENSE_CACHE_FILE, KEY_CACHE_FILE, LOCAL_JWK_FILE;
var init_license = __esm({
  "../core/src/license.ts"() {
    "use strict";
    path2 = __toESM(require("path"));
    LICENSE_FILE = path2.join(".devory", "license");
    LICENSE_CACHE_FILE = path2.join(".devory", "license-cache.json");
    KEY_CACHE_FILE = path2.join(".devory", "key-cache.json");
    LOCAL_JWK_FILE = path2.join(".devory", "license.jwk");
  }
});

// ../../node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence))
    return sequence;
  else if (isNothing(sequence))
    return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark)
    return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer)
    return null;
  if (!options.maxLength)
    options.maxLength = 79;
  if (typeof options.indent !== "number")
    options.indent = 1;
  if (typeof options.linesBefore !== "number")
    options.linesBefore = 3;
  if (typeof options.linesAfter !== "number")
    options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0)
    foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0)
      break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length)
      break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
function resolveYamlNull(data) {
  if (data === null)
    return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
function resolveYamlBoolean(data) {
  if (data === null)
    return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null)
    return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max)
    return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max)
      return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_")
          continue;
        if (ch !== "0" && ch !== "1")
          return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_")
          continue;
        if (!isHexCode(data.charCodeAt(index)))
          return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_")
          continue;
        if (!isOctCode(data.charCodeAt(index)))
          return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_")
    return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_")
      continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_")
    return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-")
      sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0")
    return 0;
  if (ch === "0") {
    if (value[1] === "b")
      return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x")
      return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o")
      return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
function resolveYamlFloat(data) {
  if (data === null)
    return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
function resolveYamlTimestamp(data) {
  if (data === null)
    return false;
  if (YAML_DATE_REGEXP.exec(data) !== null)
    return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null)
    return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null)
    match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null)
    throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-")
      delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta)
    date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
function resolveYamlBinary(data) {
  if (data === null)
    return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64)
      continue;
    if (code < 0)
      return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
function resolveYamlOmap(data) {
  if (data === null)
    return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]")
      return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey)
          pairHasKey = true;
        else
          return false;
      }
    }
    if (!pairHasKey)
      return false;
    if (objectKeys.indexOf(pairKey) === -1)
      objectKeys.push(pairKey);
    else
      return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
function resolveYamlPairs(data) {
  if (data === null)
    return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]")
      return false;
    keys = Object.keys(pair);
    if (keys.length !== 1)
      return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null)
    return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
function resolveYamlSet(data) {
  if (data === null)
    return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null)
        return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1)
    return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1)
    return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33)
    return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38)
    return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42)
    return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch))
        break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0)
      readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null)
    return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n")
      result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  }();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  }();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ")
    return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536)
        result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "")
        _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "")
      pairBuffer += ", ";
    if (state.condenseFlow)
      pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024)
      pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid)
        return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs)
    getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true))
    return state.dump + "\n";
  return "";
}
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var isNothing_1, isObject_1, toArray_1, repeat_1, isNegativeZero_1, extend_1, common, exception, snippet, TYPE_CONSTRUCTOR_OPTIONS, YAML_NODE_KINDS, type, schema, str, seq, map, failsafe, _null, bool, int, YAML_FLOAT_PATTERN, SCIENTIFIC_WITHOUT_DOT, float, json, core, YAML_DATE_REGEXP, YAML_TIMESTAMP_REGEXP, timestamp, merge, BASE64_MAP, binary, _hasOwnProperty$3, _toString$2, omap, _toString$1, pairs, _hasOwnProperty$2, set, _default, _hasOwnProperty$1, CONTEXT_FLOW_IN, CONTEXT_FLOW_OUT, CONTEXT_BLOCK_IN, CONTEXT_BLOCK_OUT, CHOMPING_CLIP, CHOMPING_STRIP, CHOMPING_KEEP, PATTERN_NON_PRINTABLE, PATTERN_NON_ASCII_LINE_BREAKS, PATTERN_FLOW_INDICATORS, PATTERN_TAG_HANDLE, PATTERN_TAG_URI, simpleEscapeCheck, simpleEscapeMap, i, directiveHandlers, loadAll_1, load_1, loader, _toString, _hasOwnProperty, CHAR_BOM, CHAR_TAB, CHAR_LINE_FEED, CHAR_CARRIAGE_RETURN, CHAR_SPACE, CHAR_EXCLAMATION, CHAR_DOUBLE_QUOTE, CHAR_SHARP, CHAR_PERCENT, CHAR_AMPERSAND, CHAR_SINGLE_QUOTE, CHAR_ASTERISK, CHAR_COMMA, CHAR_MINUS, CHAR_COLON, CHAR_EQUALS, CHAR_GREATER_THAN, CHAR_QUESTION, CHAR_COMMERCIAL_AT, CHAR_LEFT_SQUARE_BRACKET, CHAR_RIGHT_SQUARE_BRACKET, CHAR_GRAVE_ACCENT, CHAR_LEFT_CURLY_BRACKET, CHAR_VERTICAL_LINE, CHAR_RIGHT_CURLY_BRACKET, ESCAPE_SEQUENCES, DEPRECATED_BOOLEANS_SYNTAX, DEPRECATED_BASE60_SYNTAX, QUOTING_TYPE_SINGLE, QUOTING_TYPE_DOUBLE, STYLE_PLAIN, STYLE_SINGLE, STYLE_LITERAL, STYLE_FOLDED, STYLE_DOUBLE, dump_1, dumper, load, loadAll, dump, safeLoad, safeLoadAll, safeDump;
var init_js_yaml = __esm({
  "../../node_modules/js-yaml/dist/js-yaml.mjs"() {
    isNothing_1 = isNothing;
    isObject_1 = isObject;
    toArray_1 = toArray;
    repeat_1 = repeat;
    isNegativeZero_1 = isNegativeZero;
    extend_1 = extend;
    common = {
      isNothing: isNothing_1,
      isObject: isObject_1,
      toArray: toArray_1,
      repeat: repeat_1,
      isNegativeZero: isNegativeZero_1,
      extend: extend_1
    };
    YAMLException$1.prototype = Object.create(Error.prototype);
    YAMLException$1.prototype.constructor = YAMLException$1;
    YAMLException$1.prototype.toString = function toString(compact) {
      return this.name + ": " + formatError(this, compact);
    };
    exception = YAMLException$1;
    snippet = makeSnippet;
    TYPE_CONSTRUCTOR_OPTIONS = [
      "kind",
      "multi",
      "resolve",
      "construct",
      "instanceOf",
      "predicate",
      "represent",
      "representName",
      "defaultStyle",
      "styleAliases"
    ];
    YAML_NODE_KINDS = [
      "scalar",
      "sequence",
      "mapping"
    ];
    type = Type$1;
    Schema$1.prototype.extend = function extend2(definition) {
      var implicit = [];
      var explicit = [];
      if (definition instanceof type) {
        explicit.push(definition);
      } else if (Array.isArray(definition)) {
        explicit = explicit.concat(definition);
      } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
        if (definition.implicit)
          implicit = implicit.concat(definition.implicit);
        if (definition.explicit)
          explicit = explicit.concat(definition.explicit);
      } else {
        throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
      }
      implicit.forEach(function(type$1) {
        if (!(type$1 instanceof type)) {
          throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
        if (type$1.loadKind && type$1.loadKind !== "scalar") {
          throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
        }
        if (type$1.multi) {
          throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
        }
      });
      explicit.forEach(function(type$1) {
        if (!(type$1 instanceof type)) {
          throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
      });
      var result = Object.create(Schema$1.prototype);
      result.implicit = (this.implicit || []).concat(implicit);
      result.explicit = (this.explicit || []).concat(explicit);
      result.compiledImplicit = compileList(result, "implicit");
      result.compiledExplicit = compileList(result, "explicit");
      result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
      return result;
    };
    schema = Schema$1;
    str = new type("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function(data) {
        return data !== null ? data : "";
      }
    });
    seq = new type("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function(data) {
        return data !== null ? data : [];
      }
    });
    map = new type("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function(data) {
        return data !== null ? data : {};
      }
    });
    failsafe = new schema({
      explicit: [
        str,
        seq,
        map
      ]
    });
    _null = new type("tag:yaml.org,2002:null", {
      kind: "scalar",
      resolve: resolveYamlNull,
      construct: constructYamlNull,
      predicate: isNull,
      represent: {
        canonical: function() {
          return "~";
        },
        lowercase: function() {
          return "null";
        },
        uppercase: function() {
          return "NULL";
        },
        camelcase: function() {
          return "Null";
        },
        empty: function() {
          return "";
        }
      },
      defaultStyle: "lowercase"
    });
    bool = new type("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: resolveYamlBoolean,
      construct: constructYamlBoolean,
      predicate: isBoolean,
      represent: {
        lowercase: function(object) {
          return object ? "true" : "false";
        },
        uppercase: function(object) {
          return object ? "TRUE" : "FALSE";
        },
        camelcase: function(object) {
          return object ? "True" : "False";
        }
      },
      defaultStyle: "lowercase"
    });
    int = new type("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: resolveYamlInteger,
      construct: constructYamlInteger,
      predicate: isInteger,
      represent: {
        binary: function(obj) {
          return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
        },
        octal: function(obj) {
          return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
        },
        decimal: function(obj) {
          return obj.toString(10);
        },
        /* eslint-disable max-len */
        hexadecimal: function(obj) {
          return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
        }
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"]
      }
    });
    YAML_FLOAT_PATTERN = new RegExp(
      // 2.5e4, 2.5 and integers
      "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
    );
    SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
    float = new type("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: resolveYamlFloat,
      construct: constructYamlFloat,
      predicate: isFloat,
      represent: representYamlFloat,
      defaultStyle: "lowercase"
    });
    json = failsafe.extend({
      implicit: [
        _null,
        bool,
        int,
        float
      ]
    });
    core = json;
    YAML_DATE_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
    );
    YAML_TIMESTAMP_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
    );
    timestamp = new type("tag:yaml.org,2002:timestamp", {
      kind: "scalar",
      resolve: resolveYamlTimestamp,
      construct: constructYamlTimestamp,
      instanceOf: Date,
      represent: representYamlTimestamp
    });
    merge = new type("tag:yaml.org,2002:merge", {
      kind: "scalar",
      resolve: resolveYamlMerge
    });
    BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
    binary = new type("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: resolveYamlBinary,
      construct: constructYamlBinary,
      predicate: isBinary,
      represent: representYamlBinary
    });
    _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
    _toString$2 = Object.prototype.toString;
    omap = new type("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: resolveYamlOmap,
      construct: constructYamlOmap
    });
    _toString$1 = Object.prototype.toString;
    pairs = new type("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: resolveYamlPairs,
      construct: constructYamlPairs
    });
    _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
    set = new type("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: resolveYamlSet,
      construct: constructYamlSet
    });
    _default = core.extend({
      implicit: [
        timestamp,
        merge
      ],
      explicit: [
        binary,
        omap,
        pairs,
        set
      ]
    });
    _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
    CONTEXT_FLOW_IN = 1;
    CONTEXT_FLOW_OUT = 2;
    CONTEXT_BLOCK_IN = 3;
    CONTEXT_BLOCK_OUT = 4;
    CHOMPING_CLIP = 1;
    CHOMPING_STRIP = 2;
    CHOMPING_KEEP = 3;
    PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
    PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
    PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
    PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
    simpleEscapeCheck = new Array(256);
    simpleEscapeMap = new Array(256);
    for (i = 0; i < 256; i++) {
      simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
      simpleEscapeMap[i] = simpleEscapeSequence(i);
    }
    directiveHandlers = {
      YAML: function handleYamlDirective(state, name, args) {
        var match, major, minor;
        if (state.version !== null) {
          throwError(state, "duplication of %YAML directive");
        }
        if (args.length !== 1) {
          throwError(state, "YAML directive accepts exactly one argument");
        }
        match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
        if (match === null) {
          throwError(state, "ill-formed argument of the YAML directive");
        }
        major = parseInt(match[1], 10);
        minor = parseInt(match[2], 10);
        if (major !== 1) {
          throwError(state, "unacceptable YAML version of the document");
        }
        state.version = args[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
          throwWarning(state, "unsupported YAML version of the document");
        }
      },
      TAG: function handleTagDirective(state, name, args) {
        var handle, prefix;
        if (args.length !== 2) {
          throwError(state, "TAG directive accepts exactly two arguments");
        }
        handle = args[0];
        prefix = args[1];
        if (!PATTERN_TAG_HANDLE.test(handle)) {
          throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
        }
        if (_hasOwnProperty$1.call(state.tagMap, handle)) {
          throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
          throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
        }
        try {
          prefix = decodeURIComponent(prefix);
        } catch (err) {
          throwError(state, "tag prefix is malformed: " + prefix);
        }
        state.tagMap[handle] = prefix;
      }
    };
    loadAll_1 = loadAll$1;
    load_1 = load$1;
    loader = {
      loadAll: loadAll_1,
      load: load_1
    };
    _toString = Object.prototype.toString;
    _hasOwnProperty = Object.prototype.hasOwnProperty;
    CHAR_BOM = 65279;
    CHAR_TAB = 9;
    CHAR_LINE_FEED = 10;
    CHAR_CARRIAGE_RETURN = 13;
    CHAR_SPACE = 32;
    CHAR_EXCLAMATION = 33;
    CHAR_DOUBLE_QUOTE = 34;
    CHAR_SHARP = 35;
    CHAR_PERCENT = 37;
    CHAR_AMPERSAND = 38;
    CHAR_SINGLE_QUOTE = 39;
    CHAR_ASTERISK = 42;
    CHAR_COMMA = 44;
    CHAR_MINUS = 45;
    CHAR_COLON = 58;
    CHAR_EQUALS = 61;
    CHAR_GREATER_THAN = 62;
    CHAR_QUESTION = 63;
    CHAR_COMMERCIAL_AT = 64;
    CHAR_LEFT_SQUARE_BRACKET = 91;
    CHAR_RIGHT_SQUARE_BRACKET = 93;
    CHAR_GRAVE_ACCENT = 96;
    CHAR_LEFT_CURLY_BRACKET = 123;
    CHAR_VERTICAL_LINE = 124;
    CHAR_RIGHT_CURLY_BRACKET = 125;
    ESCAPE_SEQUENCES = {};
    ESCAPE_SEQUENCES[0] = "\\0";
    ESCAPE_SEQUENCES[7] = "\\a";
    ESCAPE_SEQUENCES[8] = "\\b";
    ESCAPE_SEQUENCES[9] = "\\t";
    ESCAPE_SEQUENCES[10] = "\\n";
    ESCAPE_SEQUENCES[11] = "\\v";
    ESCAPE_SEQUENCES[12] = "\\f";
    ESCAPE_SEQUENCES[13] = "\\r";
    ESCAPE_SEQUENCES[27] = "\\e";
    ESCAPE_SEQUENCES[34] = '\\"';
    ESCAPE_SEQUENCES[92] = "\\\\";
    ESCAPE_SEQUENCES[133] = "\\N";
    ESCAPE_SEQUENCES[160] = "\\_";
    ESCAPE_SEQUENCES[8232] = "\\L";
    ESCAPE_SEQUENCES[8233] = "\\P";
    DEPRECATED_BOOLEANS_SYNTAX = [
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "on",
      "On",
      "ON",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "off",
      "Off",
      "OFF"
    ];
    DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
    QUOTING_TYPE_SINGLE = 1;
    QUOTING_TYPE_DOUBLE = 2;
    STYLE_PLAIN = 1;
    STYLE_SINGLE = 2;
    STYLE_LITERAL = 3;
    STYLE_FOLDED = 4;
    STYLE_DOUBLE = 5;
    dump_1 = dump$1;
    dumper = {
      dump: dump_1
    };
    load = loader.load;
    loadAll = loader.loadAll;
    dump = dumper.dump;
    safeLoad = renamed("safeLoad", "load");
    safeLoadAll = renamed("safeLoadAll", "loadAll");
    safeDump = renamed("safeDump", "dump");
  }
});

// ../core/src/defaults-path.ts
function resolveCoreDefaultsDir(moduleDir) {
  const candidates = [
    path3.join(moduleDir, "defaults"),
    path3.join(moduleDir, "..", "src", "defaults")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}
var fs, path3;
var init_defaults_path = __esm({
  "../core/src/defaults-path.ts"() {
    "use strict";
    fs = __toESM(require("fs"));
    path3 = __toESM(require("path"));
  }
});

// ../core/src/standards.ts
var DEFAULTS_DIR;
var init_standards = __esm({
  "../core/src/standards.ts"() {
    "use strict";
    init_js_yaml();
    init_defaults_path();
    DEFAULTS_DIR = resolveCoreDefaultsDir(__dirname);
  }
});

// ../core/src/skill-validator.ts
var init_skill_validator = __esm({
  "../core/src/skill-validator.ts"() {
    "use strict";
  }
});

// ../core/src/factory-environment.ts
function trimEnv2(value) {
  if (typeof value !== "string")
    return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function findFactoryContextDir(startDir) {
  let current = path4.resolve(startDir);
  while (true) {
    if (fs2.existsSync(path4.join(current, FACTORY_MARKER))) {
      return current;
    }
    const parent = path4.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
function hasFactoryStructure(dir) {
  const markerHits = FACTORY_STRUCTURE_MARKERS.filter(
    (marker) => fs2.existsSync(path4.join(dir, marker))
  ).length;
  if (markerHits >= 2) {
    return true;
  }
  const packageJsonPath = path4.join(dir, "package.json");
  if (!fs2.existsSync(packageJsonPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs2.readFileSync(packageJsonPath, "utf-8"));
    const workspaceEntries = Array.isArray(parsed.workspaces) ? parsed.workspaces.filter((entry) => typeof entry === "string") : [];
    return parsed.name === "ai-dev-factory" || workspaceEntries.includes("apps/*") || workspaceEntries.includes("packages/*");
  } catch {
    return false;
  }
}
function findFactoryCandidateDir(startDir) {
  let current = path4.resolve(startDir);
  while (true) {
    if (hasFactoryStructure(current)) {
      return current;
    }
    const parent = path4.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
function resolveFactoryRoot(startDir = process.cwd()) {
  const explicit = trimEnv2(process.env.DEVORY_FACTORY_ROOT);
  if (explicit) {
    return { root: explicit, source: "env:DEVORY_FACTORY_ROOT" };
  }
  const legacy = trimEnv2(process.env.FACTORY_ROOT);
  if (legacy) {
    return { root: legacy, source: "env:FACTORY_ROOT" };
  }
  const walked = findFactoryContextDir(startDir);
  if (walked) {
    return { root: walked, source: "git-walk" };
  }
  const candidate = findFactoryCandidateDir(startDir);
  if (candidate) {
    return { root: candidate, source: "git-walk" };
  }
  return { root: path4.resolve(startDir), source: "cwd" };
}
var fs2, path4, FACTORY_MARKER, FACTORY_STRUCTURE_MARKERS;
var init_factory_environment = __esm({
  "../core/src/factory-environment.ts"() {
    "use strict";
    fs2 = __toESM(require("fs"));
    path4 = __toESM(require("path"));
    FACTORY_MARKER = "FACTORY_CONTEXT.md";
    FACTORY_STRUCTURE_MARKERS = [
      path4.join(".devory", "governance.json"),
      path4.join(".devory", "feature-flags.json"),
      "tasks",
      "artifacts",
      "runs"
    ];
  }
});

// ../core/src/local-run-control.ts
function buildState(partial = {}) {
  return {
    version: 1,
    run_id: partial.run_id ?? null,
    requested_action: partial.requested_action ?? null,
    acknowledged_action: partial.acknowledged_action ?? null,
    updated_at: partial.updated_at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function resolveLocalRunControlPath(factoryRoot) {
  return path5.join(factoryRoot, LOCAL_RUN_CONTROL_FILE);
}
function readLocalRunControl(factoryRoot) {
  const filePath = resolveLocalRunControlPath(factoryRoot);
  if (!fs3.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs3.readFileSync(filePath, "utf-8"));
    return buildState(parsed);
  } catch {
    return null;
  }
}
function writeLocalRunControl(factoryRoot, state) {
  const filePath = resolveLocalRunControlPath(factoryRoot);
  const nextState = buildState(state);
  fs3.mkdirSync(path5.dirname(filePath), { recursive: true });
  fs3.writeFileSync(filePath, JSON.stringify(nextState, null, 2) + "\n", "utf-8");
  return nextState;
}
function updateLocalRunControl(factoryRoot, update) {
  const current = readLocalRunControl(factoryRoot);
  return writeLocalRunControl(factoryRoot, {
    ...current ?? buildState(),
    ...update(current),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function clearLocalRunControl(factoryRoot) {
  return writeLocalRunControl(factoryRoot, {
    run_id: null,
    requested_action: null,
    acknowledged_action: null
  });
}
var fs3, path5, LOCAL_RUN_CONTROL_FILE;
var init_local_run_control = __esm({
  "../core/src/local-run-control.ts"() {
    "use strict";
    fs3 = __toESM(require("fs"));
    path5 = __toESM(require("path"));
    LOCAL_RUN_CONTROL_FILE = path5.join(".devory", "local-run-control.json");
  }
});

// ../core/src/execution-adapter-resolution.ts
function buildUnsupportedReason(target, readinessState) {
  if (readinessState === "blocked_by_policy") {
    return `Concrete target "${target.id}" is blocked by policy.`;
  }
  if (readinessState === "unavailable") {
    return `Concrete target "${target.id}" is not runnable in the current workspace.`;
  }
  return `No execution adapter binding is implemented for concrete target "${target.id}".`;
}
function resolveExecutionAdapter(options) {
  const target = options.target;
  if (target === null)
    return null;
  const readinessState = options.readiness_state ?? target.readiness_state;
  const mapped = TARGET_ADAPTERS[target.id];
  if (!mapped) {
    return {
      target_id: target.id,
      target_model_id: target.model_id,
      provider_adapter_id: target.adapter_id,
      adapter_id: target.provider_class === "deterministic" ? "deterministic" : target.provider_class === "local_ollama" ? "ollama" : target.model_id?.startsWith("claude") ? "claude" : "openai",
      adapter_label: target.provider_class === "deterministic" ? "Deterministic runner" : target.provider_class === "local_ollama" ? "Local Ollama runner" : "Cloud runner",
      invocation_mode: target.provider_class === "deterministic" ? "dry-run" : target.provider_class === "local_ollama" ? "ollama" : target.model_id?.startsWith("claude") ? "claude" : "openai",
      execution_path: target.provider_class === "deterministic" ? "packaged_runner:dry-run" : target.provider_class === "local_ollama" ? "packaged_runner:ollama" : target.model_id?.startsWith("claude") ? "packaged_runner:claude" : "packaged_runner:openai",
      configured: target.configured,
      available: false,
      reason: buildUnsupportedReason(target, readinessState),
      note: null
    };
  }
  const blockedByPolicy = readinessState === "blocked_by_policy" || target.provider_class === "cloud_premium" && Boolean(options.policy && (options.policy.local_only || !options.policy.cloud_allowed));
  return {
    target_id: target.id,
    target_model_id: target.model_id,
    provider_adapter_id: target.adapter_id,
    adapter_id: mapped.adapter_id,
    adapter_label: mapped.adapter_label,
    invocation_mode: mapped.invocation_mode,
    execution_path: mapped.execution_path,
    configured: target.configured,
    available: !blockedByPolicy,
    reason: blockedByPolicy ? `Execution adapter for "${target.id}" is blocked by policy.` : null,
    note: mapped.note
  };
}
var TARGET_ADAPTERS;
var init_execution_adapter_resolution = __esm({
  "../core/src/execution-adapter-resolution.ts"() {
    "use strict";
    TARGET_ADAPTERS = {
      "deterministic:factory-default": {
        adapter_id: "deterministic",
        adapter_label: "Deterministic runner",
        invocation_mode: "dry-run",
        execution_path: "packaged_runner:dry-run",
        note: "Resolved onto the packaged dry-run lane."
      },
      "ollama:qwen2.5-coder:14b": {
        adapter_id: "ollama",
        adapter_label: "Local Ollama runner",
        invocation_mode: "ollama",
        execution_path: "packaged_runner:ollama",
        note: "Resolved onto the packaged Ollama lane."
      },
      "ollama:deepseek-coder:6.7b": {
        adapter_id: "ollama",
        adapter_label: "Local Ollama runner",
        invocation_mode: "ollama",
        execution_path: "packaged_runner:ollama",
        note: "Resolved onto the packaged Ollama lane."
      },
      "cloud:claude-sonnet-4-6": {
        adapter_id: "claude",
        adapter_label: "Claude cloud runner",
        invocation_mode: "claude",
        execution_path: "packaged_runner:claude",
        note: "Resolved onto the packaged Claude lane."
      },
      "cloud:gpt-5-mini": {
        adapter_id: "openai",
        adapter_label: "OpenAI cloud runner",
        invocation_mode: "openai",
        execution_path: "packaged_runner:openai",
        note: "Resolved onto the packaged OpenAI lane."
      }
    };
  }
});

// ../core/src/unattended-execution.ts
function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNullableString(value) {
  return typeof value === "string" ? value : null;
}
function asNullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function normalizeProgressCategory(value) {
  return typeof value === "string" && PROGRESS_EVENT_CATEGORIES.includes(value) ? value : null;
}
function normalizeUnattendedStatus(value) {
  return typeof value === "string" && UNATTENDED_RUN_STATUSES.includes(value) ? value : "starting";
}
function normalizeWorkerHealth(value) {
  return typeof value === "string" && WORKER_HEALTH_STATUSES.includes(value) ? value : "healthy";
}
function normalizeEscalationReason(value) {
  return typeof value === "string" && ESCALATION_REASONS.includes(value) ? value : null;
}
function normalizeHeartbeat(value) {
  const record = asObject(value);
  return {
    captured_at: asNullableString(record?.captured_at),
    age_ms: asNullableNumber(record?.age_ms),
    progress_sequence: asNullableNumber(record?.progress_sequence),
    active_task_id: asNullableString(record?.active_task_id),
    lane_id: asNullableString(record?.lane_id),
    tool_name: asNullableString(record?.tool_name),
    adapter_session_id: asNullableString(record?.adapter_session_id)
  };
}
function normalizeProgressPointer(value) {
  const record = asObject(value);
  return {
    latest_event_id: asNullableString(record?.latest_event_id),
    latest_event_at: asNullableString(record?.latest_event_at),
    sequence: asNullableNumber(record?.sequence),
    category: normalizeProgressCategory(record?.category),
    summary: asNullableString(record?.summary)
  };
}
function normalizeCheckpoint(value) {
  const record = asObject(value);
  return {
    artifact_path: asNullableString(record?.artifact_path),
    checkpoint_id: asNullableString(record?.checkpoint_id),
    captured_at: asNullableString(record?.captured_at),
    source_run_id: asNullableString(record?.source_run_id),
    resumed_from_run_id: asNullableString(record?.resumed_from_run_id)
  };
}
function normalizeRecovery(value) {
  const record = asObject(value);
  const state = record?.state === "not_attempted" || record?.state === "succeeded" || record?.state === "failed" ? record.state : "not_attempted";
  return {
    state,
    attempts: asNumber(record?.attempts, 0),
    last_attempt_at: asNullableString(record?.last_attempt_at),
    resumed_run_id: asNullableString(record?.resumed_run_id),
    failover_run_id: asNullableString(record?.failover_run_id),
    reason: asNullableString(record?.reason)
  };
}
function normalizeEscalation(value) {
  const record = asObject(value);
  return {
    required: asBoolean(record?.required),
    reason: normalizeEscalationReason(record?.reason),
    summary: asNullableString(record?.summary),
    triggered_at: asNullableString(record?.triggered_at)
  };
}
function normalizeUnattendedExecutionSnapshot(value) {
  const record = asObject(value);
  if (!record)
    return null;
  const runId = asString(record.run_id);
  if (!runId)
    return null;
  const durableSource = record.durable_source === "artifact" ? "artifact" : "run_record";
  return {
    version: UNATTENDED_EXECUTION_CONTRACT_VERSION,
    run_id: runId,
    status: normalizeUnattendedStatus(record.status),
    worker_health: normalizeWorkerHealth(record.worker_health),
    durable_source: durableSource,
    transient_adapter_state: asNullableString(record.transient_adapter_state),
    heartbeat: normalizeHeartbeat(record.heartbeat),
    progress: normalizeProgressPointer(record.progress),
    checkpoint: normalizeCheckpoint(record.checkpoint),
    recovery: normalizeRecovery(record.recovery),
    escalation: normalizeEscalation(record.escalation)
  };
}
var UNATTENDED_EXECUTION_CONTRACT_VERSION, UNATTENDED_RUN_STATUSES, WORKER_HEALTH_STATUSES, PROGRESS_EVENT_CATEGORIES, ESCALATION_REASONS;
var init_unattended_execution = __esm({
  "../core/src/unattended-execution.ts"() {
    "use strict";
    UNATTENDED_EXECUTION_CONTRACT_VERSION = "unattended-execution-v1";
    UNATTENDED_RUN_STATUSES = [
      "starting",
      "active",
      "waiting_on_tool",
      "waiting_on_model",
      "checkpointing",
      "stalled",
      "blocked_on_human",
      "failed",
      "completed",
      "cancelled"
    ];
    WORKER_HEALTH_STATUSES = [
      "healthy",
      "lagging",
      "stalled",
      "recovering",
      "offline"
    ];
    PROGRESS_EVENT_CATEGORIES = [
      "session_started",
      "tool_activity",
      "file_mutation",
      "test_activity",
      "checkpoint_write",
      "compaction",
      "retry",
      "failover",
      "escalation",
      "status"
    ];
    ESCALATION_REASONS = [
      "policy_blocked",
      "checkpoint_unavailable",
      "retry_exhausted",
      "stall_detected",
      "human_required",
      "fatal_error"
    ];
  }
});

// ../core/src/run-ledger.ts
function asObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function asString2(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNullableString2(value) {
  return typeof value === "string" ? value : null;
}
function asStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
function asBoolean2(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function asNullableNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asNumber2(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function normalizeFailureRecord(value) {
  const record = asObject2(value);
  if (!record)
    return null;
  const taskId = asString2(record.task_id);
  const reason = asString2(record.reason);
  const timestamp2 = asString2(record.timestamp);
  if (!taskId || !reason || !timestamp2)
    return null;
  return {
    task_id: taskId,
    reason,
    timestamp: timestamp2
  };
}
function normalizeCostEventRecord(value) {
  const record = asObject2(value);
  if (!record)
    return null;
  const status = record.status === "warn" || record.status === "block" ? record.status : null;
  const taskId = asString2(record.task_id);
  const timestamp2 = asString2(record.timestamp);
  if (!status || !taskId || !timestamp2)
    return null;
  return {
    task_id: taskId,
    model_id: asNullableString2(record.model_id),
    status,
    reasons: asStringArray(record.reasons),
    spend_units: asNumber2(record.spend_units, 0),
    timestamp: timestamp2
  };
}
function normalizeProgressEventRecord(value) {
  const record = asObject2(value);
  if (!record)
    return null;
  const eventId = asString2(record.event_id);
  const sequence = asNumber2(record.sequence, Number.NaN);
  const createdAt = asString2(record.created_at);
  const summary = asString2(record.summary);
  const category = typeof record.category === "string" && PROGRESS_EVENT_CATEGORIES.includes(record.category) ? record.category : null;
  const status = typeof record.status === "string" && UNATTENDED_RUN_STATUSES.includes(record.status) ? record.status : null;
  if (!eventId || !Number.isFinite(sequence) || !createdAt || !summary || !category) {
    return null;
  }
  return {
    event_id: eventId,
    sequence,
    category,
    status,
    task_id: asNullableString2(record.task_id),
    created_at: createdAt,
    summary,
    details: asStringArray(record.details)
  };
}
function normalizeTaskBlockState(value) {
  const record = asObject2(value);
  if (!record)
    return null;
  const kind = record.kind === "human-question" || record.kind === "execution-failure" || record.kind === "dependency-wait" ? record.kind : null;
  const interruptionLevel = record.interruption_level === "level_1" || record.interruption_level === "level_2" || record.interruption_level === "level_3" ? record.interruption_level : null;
  const fallbackBehavior = record.fallback_behavior === "continue-other-work" || record.fallback_behavior === "pause-affected-lane" || record.fallback_behavior === "halt-run" || record.fallback_behavior === "assume-default" || record.fallback_behavior === "skip-task" ? record.fallback_behavior : null;
  return {
    kind,
    question_id: asNullableString2(record.question_id),
    dependency_task_id: asNullableString2(record.dependency_task_id),
    reason: asNullableString2(record.reason),
    since: asNullableString2(record.since),
    interruption_level: interruptionLevel,
    fallback_behavior: fallbackBehavior
  };
}
function normalizeRunInterruptionState(value) {
  const record = asObject2(value);
  if (!record)
    return null;
  const interruptionLevel = record.interruption_level === "level_1" || record.interruption_level === "level_2" || record.interruption_level === "level_3" ? record.interruption_level : null;
  const fallbackBehavior = record.fallback_behavior === "continue-other-work" || record.fallback_behavior === "pause-affected-lane" || record.fallback_behavior === "halt-run" || record.fallback_behavior === "assume-default" || record.fallback_behavior === "skip-task" ? record.fallback_behavior : null;
  const runDisposition = record.run_disposition === "continue" || record.run_disposition === "pause" || record.run_disposition === "halt" ? record.run_disposition : null;
  const laneState = record.lane_state === "running" || record.lane_state === "paused" ? record.lane_state : null;
  return {
    active: asBoolean2(record.active),
    question_id: asNullableString2(record.question_id),
    blocking_task_id: asNullableString2(record.blocking_task_id),
    lane_id: asNullableString2(record.lane_id),
    interruption_level: interruptionLevel,
    fallback_behavior: fallbackBehavior,
    run_disposition: runDisposition,
    lane_state: laneState,
    updated_at: asNullableString2(record.updated_at)
  };
}
function buildRoutingEvidence(record) {
  const existing = asObject2(record.routing_evidence);
  const decision = asObject2(existing?.routing_decision);
  const selection = asObject2(existing?.selection);
  const fallback = asObject2(existing?.fallback);
  const retries = asObject2(existing?.retries);
  const timing = asObject2(existing?.timing);
  const usage = asObject2(existing?.usage);
  const outcome = asObject2(existing?.outcome);
  const inputSnapshot = asObject2(existing?.input_snapshot);
  const normalizedInput = inputSnapshot?.normalized_input && typeof inputSnapshot.normalized_input === "object" ? inputSnapshot.normalized_input : null;
  const routingDecision = decision && typeof decision === "object" ? decision : null;
  const selectedEngine = asNullableString2(selection?.selected_engine) ?? asString2(record.engine);
  const selectedModel = asNullableString2(selection?.selected_model) ?? asNullableString2(record.model_id);
  const fallbackTaken = asBoolean2(fallback?.taken, asBoolean2(record.fallback_taken));
  const spendUnits = asNullableNumber2(usage?.spend_units) ?? asNullableNumber2(record.spend_units);
  const costTier = asNullableString2(usage?.cost_tier) ?? asNullableString2(record.cost_tier);
  const outcomeLabel = asNullableString2(outcome?.outcome_label) ?? asString2(record.outcome);
  return {
    routing_decision: routingDecision,
    requested_role: asNullableString2(existing?.requested_role),
    input_snapshot: {
      routing_decision_id: asNullableString2(inputSnapshot?.routing_decision_id) ?? asNullableString2(asObject2(routingDecision?.linkage)?.decision_id),
      related_routing_decision_ids: asStringArray(inputSnapshot?.related_routing_decision_ids),
      requested_role: asNullableString2(inputSnapshot?.requested_role),
      requested_engine: asNullableString2(inputSnapshot?.requested_engine),
      requested_pipeline: asNullableString2(inputSnapshot?.requested_pipeline),
      task_branch: asNullableString2(inputSnapshot?.task_branch),
      normalized_summary: asNullableString2(inputSnapshot?.normalized_summary),
      normalized_input: normalizedInput
    },
    selection: {
      selected_engine: selectedEngine || asNullableString2(routingDecision?.engine) || null,
      selected_provider: asNullableString2(selection?.selected_provider) ?? asNullableString2(routingDecision?.provider),
      selected_model: selectedModel ?? asNullableString2(routingDecision?.model_id),
      rationale: asStringArray(selection?.rationale).length > 0 ? asStringArray(selection?.rationale) : asStringArray(routingDecision?.rationale)
    },
    fallback: {
      taken: fallbackTaken,
      reason: asNullableString2(fallback?.reason) ?? (asStringArray(asObject2(routingDecision?.fallback_path)?.reasons)[0] ?? null),
      attempted_path: asStringArray(fallback?.attempted_path).length > 0 ? asStringArray(fallback?.attempted_path) : asStringArray(asObject2(routingDecision?.fallback_path)?.candidate_model_ids)
    },
    retries: {
      attempts: asNumber2(retries?.attempts, 0),
      resumed_from_run_id: asNullableString2(retries?.resumed_from_run_id),
      history: asStringArray(retries?.history)
    },
    timing: {
      queued_at: asNullableString2(timing?.queued_at),
      routing_started_at: asNullableString2(timing?.routing_started_at),
      routing_completed_at: asNullableString2(timing?.routing_completed_at),
      execution_started_at: asNullableString2(timing?.execution_started_at) ?? asString2(record.start_time),
      execution_completed_at: asNullableString2(timing?.execution_completed_at) ?? asString2(record.end_time)
    },
    usage: {
      prompt_tokens: asNullableNumber2(usage?.prompt_tokens),
      completion_tokens: asNullableNumber2(usage?.completion_tokens),
      total_tokens: asNullableNumber2(usage?.total_tokens),
      spend_units: spendUnits,
      estimated_cost_usd: asNullableNumber2(usage?.estimated_cost_usd),
      cost_tier: costTier
    },
    outcome: {
      final_stage: asNullableString2(outcome?.final_stage),
      verification_state: asNullableString2(outcome?.verification_state),
      outcome_label: outcomeLabel || null,
      operator_summary: asNullableString2(outcome?.operator_summary),
      evaluation: outcome?.evaluation && typeof outcome.evaluation === "object" ? outcome.evaluation : null
    }
  };
}
function normalizeTaskRecord(value) {
  const record = asObject2(value);
  if (!record)
    return null;
  const taskId = asString2(record.task_id);
  const outcome = asString2(record.outcome);
  const engine = asString2(record.engine);
  const startTime = asString2(record.start_time);
  const endTime = asString2(record.end_time);
  if (!taskId || !outcome || !engine || !startTime || !endTime) {
    return null;
  }
  return {
    task_id: taskId,
    outcome,
    engine,
    fallback_taken: asBoolean2(record.fallback_taken),
    start_time: startTime,
    end_time: endTime,
    notes: asStringArray(record.notes),
    model_id: asNullableString2(record.model_id),
    cost_tier: asNullableString2(record.cost_tier),
    spend_units: asNullableNumber2(record.spend_units),
    cost_guardrail_status: record.cost_guardrail_status === "allow" || record.cost_guardrail_status === "warn" || record.cost_guardrail_status === "block" ? record.cost_guardrail_status : null,
    cost_guardrail_notes: asStringArray(record.cost_guardrail_notes),
    routing_evidence: buildRoutingEvidence(record),
    block_state: normalizeTaskBlockState(record.block_state)
  };
}
function buildRunLedgerSummary(taskQueue, tasksExecuted, spendUnitsConsumed) {
  const fallbackCount = tasksExecuted.filter((task) => task.routing_evidence.fallback.taken).length;
  const retryCount = tasksExecuted.reduce(
    (sum, task) => sum + task.routing_evidence.retries.attempts,
    0
  );
  const providers = new Set(
    tasksExecuted.map((task) => task.routing_evidence.selection.selected_provider).filter((value) => typeof value === "string" && value !== "")
  );
  const models = new Set(
    tasksExecuted.map((task) => task.routing_evidence.selection.selected_model).filter((value) => typeof value === "string" && value !== "")
  );
  const promptTokens = tasksExecuted.reduce((sum, task) => {
    const value = task.routing_evidence.usage.prompt_tokens;
    return value === null ? sum : (sum ?? 0) + value;
  }, null);
  const completionTokens = tasksExecuted.reduce((sum, task) => {
    const value = task.routing_evidence.usage.completion_tokens;
    return value === null ? sum : (sum ?? 0) + value;
  }, null);
  const totalTokens = tasksExecuted.reduce((sum, task) => {
    const value = task.routing_evidence.usage.total_tokens;
    return value === null ? sum : (sum ?? 0) + value;
  }, null);
  return {
    total_tasks: taskQueue.length,
    tasks_executed_count: tasksExecuted.length,
    tasks_remaining_count: Math.max(taskQueue.length - tasksExecuted.length, 0),
    success_count: tasksExecuted.filter((task) => task.outcome === "success").length,
    failure_count: tasksExecuted.filter((task) => task.outcome === "failure").length,
    review_count: tasksExecuted.filter((task) => task.outcome === "skipped_for_review").length,
    fallback_count: fallbackCount,
    retry_count: retryCount,
    engines_used: [...new Set(tasksExecuted.map((task) => task.engine))],
    providers_used: [...providers],
    models_used: [...models],
    spend_units_consumed: spendUnitsConsumed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens
  };
}
function normalizeRunRecord(value, options = {}) {
  const record = asObject2(value);
  if (!record)
    return null;
  const runId = asString2(record.run_id);
  const status = asString2(record.status);
  const startTime = asString2(record.start_time);
  if (!runId || !status || !startTime) {
    return null;
  }
  const taskQueue = asStringArray(record.task_queue);
  const tasksExecuted = Array.isArray(record.tasks_executed) ? record.tasks_executed.map((task) => normalizeTaskRecord(task)).filter((task) => task !== null) : [];
  const spendUnitsConsumed = asNumber2(record.spend_units_consumed, 0);
  const existingLedger = asObject2(record.routing_ledger);
  const existingSummary = asObject2(existingLedger?.run_summary);
  const compatibilityMode = options.compatibilityMode ?? (asString2(existingLedger?.version) === RUN_LEDGER_VERSION ? "native" : "legacy-normalized");
  return {
    run_id: runId,
    status,
    task_queue: taskQueue,
    tasks_executed: tasksExecuted,
    failure: normalizeFailureRecord(record.failure),
    spend_units_consumed: spendUnitsConsumed,
    cost_events: Array.isArray(record.cost_events) ? record.cost_events.map((event) => normalizeCostEventRecord(event)).filter((event) => event !== null) : [],
    start_time: startTime,
    end_time: asNullableString2(record.end_time),
    unattended_execution: normalizeUnattendedExecutionSnapshot(record.unattended_execution),
    progress_events: Array.isArray(record.progress_events) ? record.progress_events.map((event) => normalizeProgressEventRecord(event)).filter((event) => event !== null) : [],
    interruption_state: normalizeRunInterruptionState(record.interruption_state),
    routing_ledger: {
      version: RUN_LEDGER_VERSION,
      compatibility_mode: compatibilityMode,
      run_summary: {
        ...buildRunLedgerSummary(taskQueue, tasksExecuted, spendUnitsConsumed),
        total_tasks: asNumber2(existingSummary?.total_tasks, taskQueue.length),
        tasks_executed_count: asNumber2(existingSummary?.tasks_executed_count, tasksExecuted.length),
        tasks_remaining_count: asNumber2(
          existingSummary?.tasks_remaining_count,
          Math.max(taskQueue.length - tasksExecuted.length, 0)
        ),
        success_count: asNumber2(
          existingSummary?.success_count,
          tasksExecuted.filter((task) => task.outcome === "success").length
        ),
        failure_count: asNumber2(
          existingSummary?.failure_count,
          tasksExecuted.filter((task) => task.outcome === "failure").length
        ),
        review_count: asNumber2(
          existingSummary?.review_count,
          tasksExecuted.filter((task) => task.outcome === "skipped_for_review").length
        ),
        fallback_count: asNumber2(
          existingSummary?.fallback_count,
          tasksExecuted.filter((task) => task.routing_evidence.fallback.taken).length
        ),
        retry_count: asNumber2(
          existingSummary?.retry_count,
          tasksExecuted.reduce((sum, task) => sum + task.routing_evidence.retries.attempts, 0)
        ),
        engines_used: asStringArray(existingSummary?.engines_used).length > 0 ? asStringArray(existingSummary?.engines_used) : [...new Set(tasksExecuted.map((task) => task.engine))],
        providers_used: asStringArray(existingSummary?.providers_used),
        models_used: asStringArray(existingSummary?.models_used),
        spend_units_consumed: asNullableNumber2(existingSummary?.spend_units_consumed) ?? spendUnitsConsumed,
        prompt_tokens: asNullableNumber2(existingSummary?.prompt_tokens),
        completion_tokens: asNullableNumber2(existingSummary?.completion_tokens),
        total_tokens: asNullableNumber2(existingSummary?.total_tokens)
      },
      outcome_placeholders: {
        requested_by: asNullableString2(asObject2(existingLedger?.outcome_placeholders)?.requested_by),
        operator_summary: asNullableString2(
          asObject2(existingLedger?.outcome_placeholders)?.operator_summary
        ),
        post_run_review: asNullableString2(
          asObject2(existingLedger?.outcome_placeholders)?.post_run_review
        )
      }
    }
  };
}
var RUN_LEDGER_VERSION, RESUMABLE_RUN_STATUSES;
var init_run_ledger = __esm({
  "../core/src/run-ledger.ts"() {
    "use strict";
    init_unattended_execution();
    RUN_LEDGER_VERSION = "routing-evidence-v1";
    RESUMABLE_RUN_STATUSES = [
      "failed",
      "paused_for_review"
    ];
  }
});

// ../core/src/execution-policy.ts
var path6, EXECUTION_POLICY_FILENAME, EXECUTION_POLICY_WORKSPACE_PATH, DEFAULTS_PATH;
var init_execution_policy = __esm({
  "../core/src/execution-policy.ts"() {
    "use strict";
    path6 = __toESM(require("path"));
    init_defaults_path();
    EXECUTION_POLICY_FILENAME = "execution-policy.json";
    EXECUTION_POLICY_WORKSPACE_PATH = path6.join(
      "config",
      EXECUTION_POLICY_FILENAME
    );
    DEFAULTS_PATH = path6.join(
      resolveCoreDefaultsDir(__dirname),
      EXECUTION_POLICY_FILENAME
    );
  }
});

// ../core/src/task-markdown-renderer.ts
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function buildTaskDraftTargetPath(taskId, title, stage) {
  return `tasks/${stage}/${taskId}-${slugify(title)}.md`;
}
function pushOptionalFrontmatter(lines, key, value) {
  if (value)
    lines.push(`${key}: ${value}`);
}
function pushArrayField(lines, key, values) {
  if (values.length === 0) {
    lines.push(`${key}: []`);
    return;
  }
  lines.push(`${key}:`);
  for (const value of values)
    lines.push(`  - ${value}`);
}
function pushSection(lines, heading, entries) {
  lines.push(heading, "");
  if (entries.length === 0) {
    lines.push("- (none)");
  } else {
    for (const entry of entries)
      lines.push(`- ${entry}`);
  }
  lines.push("");
}
function pushReviewerChecklist(lines, entries) {
  lines.push("## Reviewer Checklist", "");
  for (const entry of entries)
    lines.push(`- ${entry}`);
  lines.push("");
}
function renderTaskDraftTarget(draft) {
  const targetStage = draft.commit.target_stage ?? draft.status;
  const committedTaskId = draft.commit.committed_task_id ?? draft.draft_id;
  const targetPath = draft.commit.target_path ?? buildTaskDraftTargetPath(committedTaskId, draft.title, targetStage);
  const lines = [
    "---",
    `id: ${committedTaskId}`,
    `title: ${draft.title}`,
    `project: ${draft.project}`,
    `repo: ${draft.repo}`,
    `branch: ${draft.branch}`,
    `type: ${draft.type}`,
    `priority: ${draft.priority}`,
    `status: ${targetStage}`,
    `agent: ${draft.agent}`
  ];
  pushOptionalFrontmatter(lines, "external_source", draft.external_source);
  pushOptionalFrontmatter(lines, "external_key", draft.external_key);
  pushOptionalFrontmatter(lines, "external_url", draft.external_url);
  pushOptionalFrontmatter(lines, "lane", draft.lane);
  pushOptionalFrontmatter(lines, "repo_area", draft.repo_area);
  pushOptionalFrontmatter(lines, "bundle_id", draft.bundle_id);
  pushOptionalFrontmatter(lines, "bundle_title", draft.bundle_title);
  pushOptionalFrontmatter(lines, "bundle_phase", draft.bundle_phase);
  pushArrayField(lines, "depends_on", draft.depends_on);
  pushArrayField(lines, "files_likely_affected", draft.files_likely_affected);
  pushArrayField(lines, "verification", draft.verification);
  lines.push("---", "", "## Goal", "", draft.goal, "");
  pushSection(lines, "## Context", draft.context);
  pushSection(lines, "## Acceptance Criteria", draft.acceptance_criteria);
  pushSection(lines, "## Expected Artifacts", draft.expected_artifacts);
  pushSection(lines, "## Failure Conditions", draft.failure_conditions);
  pushReviewerChecklist(lines, draft.reviewer_checklist);
  return {
    target_stage: targetStage,
    target_path: targetPath,
    markdown: lines.join("\n").trimEnd() + "\n"
  };
}
var init_task_markdown_renderer = __esm({
  "../core/src/task-markdown-renderer.ts"() {
    "use strict";
  }
});

// ../core/src/planning-draft.ts
function buildPlanningDraftStorageRelativePath(kind, draftId) {
  return `planning-drafts/${kind}/${draftId}.json`;
}
function buildPlanningDraftArtifactPath(kind, draftId) {
  return `artifacts/${buildPlanningDraftStorageRelativePath(kind, draftId)}`;
}
function buildTaskPlanningDraftFixture(overrides = {}) {
  const taskId = overrides.commit?.committed_task_id ?? overrides.draft_id ?? "factory-181";
  const title = overrides.title ?? "Define the structured planning draft model for epics and tasks";
  const status = overrides.status ?? "backlog";
  const externalSource = overrides.external_source;
  const externalKey = overrides.external_key;
  const externalUrl = overrides.external_url;
  const artifactPath = overrides.storage?.artifact_path ?? buildPlanningDraftArtifactPath("task", taskId);
  const targetPath = overrides.commit?.target_path ?? buildTaskDraftTargetPath(taskId, title, status);
  return {
    version: PLANNING_DRAFT_CONTRACT_VERSION,
    draft_id: overrides.draft_id ?? taskId,
    kind: "task",
    created_at: overrides.created_at ?? "2026-03-29T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-03-29T00:00:00.000Z",
    title,
    project: overrides.project ?? "ai-dev-factory",
    repo: overrides.repo ?? ".",
    branch: overrides.branch ?? `task/${taskId}-planning-draft-contract`,
    type: overrides.type ?? "feature",
    priority: overrides.priority ?? "high",
    status,
    agent: overrides.agent ?? "backend-builder",
    ...externalSource ? { external_source: externalSource } : {},
    ...externalKey ? { external_key: externalKey } : {},
    ...externalUrl ? { external_url: externalUrl } : {},
    depends_on: overrides.depends_on ?? [],
    files_likely_affected: overrides.files_likely_affected ?? [
      "docs/adr/",
      "packages/core/src/"
    ],
    verification: overrides.verification ?? [
      "npm run validate:task -- tasks/backlog/factory-181.md",
      "npm run test"
    ],
    lane: overrides.lane,
    repo_area: overrides.repo_area,
    bundle_id: overrides.bundle_id,
    bundle_title: overrides.bundle_title,
    bundle_phase: overrides.bundle_phase,
    goal: overrides.goal ?? "Define a shared draft contract for epic and task authoring before markdown commit time.",
    context: overrides.context ?? [
      "Markdown task storage already exists and remains authoritative after commit.",
      "Planning flows need a durable structure above raw markdown."
    ],
    acceptance_criteria: overrides.acceptance_criteria ?? [
      "A shared planning draft contract exists for epics and tasks.",
      "Task drafts render to markdown compatible with the current validator."
    ],
    expected_artifacts: overrides.expected_artifacts ?? [
      "Planning draft ADR",
      "Shared planning draft types",
      "Planning draft contract tests"
    ],
    failure_conditions: overrides.failure_conditions ?? [
      "Draft storage semantics are left ambiguous",
      "Rendered task markdown diverges from the current protocol"
    ],
    reviewer_checklist: overrides.reviewer_checklist ?? [
      "[ ] Contract covers epic and task drafts",
      "[ ] Draft storage remains distinct from lifecycle folders",
      "[ ] Rendered task target stays validator-compatible"
    ],
    notes: overrides.notes ?? ["Canonical fixture for planning draft tests."],
    storage: overrides.storage ?? {
      authority: "planning-draft",
      persistence_mode: "artifact",
      artifact_path: artifactPath
    },
    commit: overrides.commit ?? {
      state: "ready_to_commit",
      target_stage: status,
      target_path: targetPath,
      committed_task_id: taskId
    },
    validation: overrides.validation ?? {
      status: "valid",
      errors: [],
      warnings: []
    }
  };
}
var PLANNING_DRAFT_CONTRACT_VERSION;
var init_planning_draft = __esm({
  "../core/src/planning-draft.ts"() {
    "use strict";
    init_task_markdown_renderer();
    PLANNING_DRAFT_CONTRACT_VERSION = "planning-draft-v1";
  }
});

// ../core/src/task-draft.ts
function buildRichTaskDraftFixture(overrides = {}) {
  return buildTaskPlanningDraftFixture({
    draft_id: overrides.draft_id ?? "factory-184-rich",
    title: overrides.title ?? "Define rich task draft contract with optional metadata",
    project: overrides.project ?? "ai-dev-factory",
    repo: overrides.repo ?? ".",
    branch: overrides.branch ?? "task/factory-184-rich-task-draft-contract",
    type: overrides.type ?? "feature",
    priority: overrides.priority ?? "high",
    status: overrides.status ?? "backlog",
    agent: overrides.agent ?? "backend-builder",
    external_source: overrides.external_source,
    external_key: overrides.external_key,
    external_url: overrides.external_url,
    lane: overrides.lane ?? "planning",
    repo_area: overrides.repo_area ?? "authoring",
    bundle_id: overrides.bundle_id ?? "epic-planning-authoring",
    bundle_title: overrides.bundle_title ?? "Planning & Task Authoring",
    bundle_phase: overrides.bundle_phase ?? "contract",
    depends_on: overrides.depends_on ?? ["factory-181"],
    files_likely_affected: overrides.files_likely_affected ?? [
      "packages/core/src/",
      "templates/"
    ],
    verification: overrides.verification ?? [
      "npm run validate:task -- tasks/backlog/factory-184.md",
      "npm run test"
    ],
    goal: overrides.goal ?? "Define the rich structured task draft contract including optional metadata and render ordering.",
    context: overrides.context ?? [
      "Task drafts must support workflow metadata such as dependencies and bundle linkage.",
      "Rendered markdown must remain compatible with existing readers and validators."
    ],
    acceptance_criteria: overrides.acceptance_criteria ?? [
      "Optional metadata renders deterministically.",
      "Required sections preserve the existing heading order."
    ],
    expected_artifacts: overrides.expected_artifacts ?? [
      "Task draft contract module",
      "Task render contract fixture",
      "Task draft tests"
    ],
    failure_conditions: overrides.failure_conditions ?? [
      "Optional metadata ordering drifts across renderers",
      "Rendered markdown breaks current task readers"
    ],
    reviewer_checklist: overrides.reviewer_checklist ?? [
      "[ ] Rich draft covers optional metadata",
      "[ ] Markdown ordering is explicit and deterministic"
    ]
  });
}
function renderTaskDraftTarget2(draft) {
  return renderTaskDraftTarget(draft);
}
var init_task_draft = __esm({
  "../core/src/task-draft.ts"() {
    "use strict";
    init_planning_draft();
    init_task_markdown_renderer();
  }
});

// ../core/src/task-validation.ts
function validateTaskCapabilityMetadata(meta) {
  const errors = [];
  if (meta.required_tier !== void 0 && typeof meta.required_tier === "string" && meta.required_tier.trim() === "") {
    errors.push('Task capability metadata "required_tier" cannot be empty');
  }
  if (!Array.isArray(meta.required_features)) {
    return errors;
  }
  for (const [index, feature] of meta.required_features.entries()) {
    if (typeof feature !== "string" || feature.trim() === "") {
      errors.push(
        `Task capability metadata "required_features" entry ${index + 1} must be a non-empty string`
      );
    }
  }
  return errors;
}
function validateTaskSkillsMetadata(meta, options) {
  const errors = [];
  const warnings = [];
  if (meta.skills === void 0) {
    return { errors, warnings };
  }
  if (!Array.isArray(meta.skills)) {
    errors.push('Task metadata "skills" must be an array of non-empty skill names');
    return { errors, warnings };
  }
  const declaredSkills = [];
  for (const [index, skillName] of meta.skills.entries()) {
    if (typeof skillName !== "string" || skillName.trim() === "") {
      errors.push(
        `Task metadata "skills" entry ${index + 1} must be a non-empty string`
      );
      continue;
    }
    declaredSkills.push(skillName.trim());
  }
  if (errors.length > 0 || declaredSkills.length === 0) {
    return { errors, warnings };
  }
  const resolvedFactoryRoot = options.factoryRoot ?? resolveFactoryRoot().root;
  const skillsRoot = path7.join(resolvedFactoryRoot, "skills");
  if (!fs4.existsSync(skillsRoot) || !fs4.statSync(skillsRoot).isDirectory()) {
    return { errors, warnings };
  }
  for (const skillName of declaredSkills) {
    const skillDirectory = path7.join(skillsRoot, skillName);
    if (!fs4.existsSync(skillDirectory) || !fs4.statSync(skillDirectory).isDirectory()) {
      warnings.push(
        `Task metadata "skills" references unknown skill "${skillName}" (expected directory: skills/${skillName})`
      );
    }
  }
  return { errors, warnings };
}
function validateTask(meta, expectedStatus, options = {}) {
  const errors = [];
  const warnings = [];
  for (const field of REQUIRED_FIELDS) {
    const value = meta[field];
    if (value === void 0 || value === null || String(value).trim() === "") {
      errors.push(`Missing required field: "${field}"`);
    }
  }
  if (meta.status && meta.status !== expectedStatus) {
    errors.push(`Expected status "${expectedStatus}", got "${meta.status}"`);
  }
  errors.push(...validateTaskCapabilityMetadata(meta));
  const skillsValidation = validateTaskSkillsMetadata(meta, options);
  errors.push(...skillsValidation.errors);
  warnings.push(...skillsValidation.warnings);
  return { valid: errors.length === 0, errors, warnings };
}
function extractSectionContent(body, heading) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1)
    return [];
  const content = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ") || line.startsWith("# "))
      break;
    if (line.trim())
      content.push(line.trim());
  }
  return content;
}
function validateTaskBody(body) {
  const errors = [];
  const warnings = [];
  for (const section of REQUIRED_BODY_SECTIONS) {
    if (!body.includes(section)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }
  const criteriaContent = extractSectionContent(body, "## Acceptance Criteria");
  const criteriaItems = criteriaContent.filter((line) => line.startsWith("- "));
  if (criteriaItems.length === 0 && body.includes("## Acceptance Criteria")) {
    errors.push(`"## Acceptance Criteria" has no items \u2014 add at least one "- " line`);
  }
  if (!body.includes("## Reviewer Checklist")) {
    warnings.push(`"## Reviewer Checklist" section is missing \u2014 consider adding one`);
  } else {
    const checklistContent = extractSectionContent(body, "## Reviewer Checklist");
    const checklistItems = checklistContent.filter((line) => line.startsWith("- "));
    if (checklistItems.length === 0) {
      warnings.push(`"## Reviewer Checklist" has no items`);
    }
  }
  return { errors, warnings };
}
function validateTaskMarkdown(markdown, expectedStatus, options = {}) {
  const { meta, body } = parseFrontmatter(markdown);
  const statusToCheck = expectedStatus ?? meta.status ?? "";
  const frontmatterResult = validateTask(meta, statusToCheck, options);
  const bodyResult = validateTaskBody(body);
  const errors = [...frontmatterResult.errors, ...bodyResult.errors];
  const warnings = [...frontmatterResult.warnings, ...bodyResult.warnings];
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
function validateTaskDraft(draft, expectedStatus) {
  const rendered = renderTaskDraftTarget(draft);
  const targetStage = expectedStatus ?? rendered.target_stage;
  const validation = validateTaskMarkdown(rendered.markdown, targetStage);
  return {
    ...validation,
    draft_id: draft.draft_id,
    target_stage: targetStage,
    target_path: rendered.target_path
  };
}
function toPlanningDraftValidationRecord(result) {
  return {
    status: result.errors.length === 0 ? "valid" : "invalid",
    errors: [...result.errors],
    warnings: [...result.warnings]
  };
}
function applyTaskDraftValidation(draft, expectedStatus) {
  const result = validateTaskDraft(draft, expectedStatus);
  return {
    ...draft,
    validation: toPlanningDraftValidationRecord(result)
  };
}
var fs4, path7, REQUIRED_FIELDS, REQUIRED_BODY_SECTIONS;
var init_task_validation = __esm({
  "../core/src/task-validation.ts"() {
    "use strict";
    fs4 = __toESM(require("fs"));
    path7 = __toESM(require("path"));
    init_parse();
    init_factory_environment();
    init_task_markdown_renderer();
    REQUIRED_FIELDS = [
      "id",
      "title",
      "project",
      "status",
      "agent"
    ];
    REQUIRED_BODY_SECTIONS = [
      "## Goal",
      "## Context",
      "## Acceptance Criteria",
      "## Expected Artifacts",
      "## Failure Conditions"
    ];
  }
});

// ../core/src/unattended-checkpoint.ts
var init_unattended_checkpoint = __esm({
  "../core/src/unattended-checkpoint.ts"() {
    "use strict";
  }
});

// ../core/src/review-control.ts
var TASK_REVIEW_ACTIONS, REVIEW_CONTROL_ACTIONS, TASK_REVIEW_ACTION_STAGE_MAP;
var init_review_control = __esm({
  "../core/src/review-control.ts"() {
    "use strict";
    init_run_ledger();
    TASK_REVIEW_ACTIONS = ["approve", "send-back", "block"];
    REVIEW_CONTROL_ACTIONS = [
      ...TASK_REVIEW_ACTIONS,
      "resume-run"
    ];
    TASK_REVIEW_ACTION_STAGE_MAP = {
      approve: "done",
      "send-back": "doing",
      block: "blocked"
    };
  }
});

// ../core/src/unattended-stall-policy.ts
var path8, UNATTENDED_STALL_POLICY_FILENAME, UNATTENDED_STALL_POLICY_WORKSPACE_PATH, DEFAULTS_PATH2;
var init_unattended_stall_policy = __esm({
  "../core/src/unattended-stall-policy.ts"() {
    "use strict";
    path8 = __toESM(require("path"));
    init_defaults_path();
    UNATTENDED_STALL_POLICY_FILENAME = "unattended-stall-policy.json";
    UNATTENDED_STALL_POLICY_WORKSPACE_PATH = path8.join(
      "config",
      UNATTENDED_STALL_POLICY_FILENAME
    );
    DEFAULTS_PATH2 = path8.join(
      resolveCoreDefaultsDir(__dirname),
      UNATTENDED_STALL_POLICY_FILENAME
    );
  }
});

// ../core/src/routing-input.ts
var init_routing_input = __esm({
  "../core/src/routing-input.ts"() {
    "use strict";
  }
});

// ../core/src/routing-decision.ts
var init_routing_decision = __esm({
  "../core/src/routing-decision.ts"() {
    "use strict";
  }
});

// ../core/src/routing-evaluation.ts
var init_routing_evaluation = __esm({
  "../core/src/routing-evaluation.ts"() {
    "use strict";
  }
});

// ../core/src/human-question.ts
var init_human_question = __esm({
  "../core/src/human-question.ts"() {
    "use strict";
  }
});

// ../core/src/human-question-artifact.ts
var init_human_question_artifact = __esm({
  "../core/src/human-question-artifact.ts"() {
    "use strict";
  }
});

// ../core/src/human-question-event.ts
var init_human_question_event = __esm({
  "../core/src/human-question-event.ts"() {
    "use strict";
  }
});

// ../core/src/human-interruption-policy.ts
var path9, HUMAN_INTERRUPTION_POLICY_FILENAME, HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH, DEFAULTS_PATH3;
var init_human_interruption_policy = __esm({
  "../core/src/human-interruption-policy.ts"() {
    "use strict";
    path9 = __toESM(require("path"));
    init_defaults_path();
    HUMAN_INTERRUPTION_POLICY_FILENAME = "human-interruption-policy.json";
    HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH = path9.join(
      "config",
      HUMAN_INTERRUPTION_POLICY_FILENAME
    );
    DEFAULTS_PATH3 = path9.join(
      resolveCoreDefaultsDir(__dirname),
      HUMAN_INTERRUPTION_POLICY_FILENAME
    );
  }
});

// ../core/src/slack-notification.ts
var init_slack_notification = __esm({
  "../core/src/slack-notification.ts"() {
    "use strict";
  }
});

// ../core/src/feature-flags.ts
function readEnvFlag(envKey) {
  const raw = process.env[envKey];
  if (raw === void 0)
    return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1")
    return true;
  if (trimmed === "false" || trimmed === "0")
    return false;
  return null;
}
function resolveFromEnv() {
  const overrides = {};
  const govEnabled = readEnvFlag("DEVORY_GOVERNANCE_REPO_ENABLED");
  if (govEnabled !== null)
    overrides.governance_repo_enabled = govEnabled;
  return overrides;
}
function parseFlagsFile(filePath) {
  try {
    const raw = fs5.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed;
    const result = {};
    if (typeof obj.governance_repo_enabled === "boolean") {
      result.governance_repo_enabled = obj.governance_repo_enabled;
    }
    return result;
  } catch {
    return {};
  }
}
function loadFeatureFlags(factoryRoot) {
  const envOverrides = resolveFromEnv();
  const flagsFilePath = path10.join(factoryRoot, FLAGS_DIR, FLAGS_FILENAME);
  let fileFlags = {};
  let fileExists = false;
  try {
    fileExists = fs5.existsSync(flagsFilePath);
    if (fileExists) {
      fileFlags = parseFlagsFile(flagsFilePath);
    }
  } catch {
  }
  const merged = {
    ...DEFAULTS,
    ...fileFlags,
    ...envOverrides
    // env vars always win
  };
  const hasEnvOverrides = Object.keys(envOverrides).length > 0;
  const source = hasEnvOverrides ? "env-var" : fileExists ? "config-file" : "default";
  return {
    flags: merged,
    source,
    file_path: fileExists ? flagsFilePath : void 0
  };
}
var fs5, path10, FLAGS_FILENAME, FLAGS_DIR, DEFAULTS;
var init_feature_flags = __esm({
  "../core/src/feature-flags.ts"() {
    "use strict";
    fs5 = __toESM(require("fs"));
    path10 = __toESM(require("path"));
    FLAGS_FILENAME = "feature-flags.json";
    FLAGS_DIR = ".devory";
    DEFAULTS = {
      governance_repo_enabled: false
    };
  }
});

// ../core/src/command-channel.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isIsoTimestamp(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}
function hasStringField(payload, field, errors) {
  const value = payload[field];
  if (typeof value === "string" && value.trim() !== "") {
    return true;
  }
  errors.push(`payload.${field} must be a non-empty string`);
  return false;
}
function validatePayload(commandType, payload, errors) {
  switch (commandType) {
    case "pause-run":
    case "resume-run":
      return;
    case "requeue-task":
      hasStringField(payload, "task_id", errors);
      return;
    case "approve-task":
      hasStringField(payload, "task_id", errors);
      return;
    case "send-back-task":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "reason", errors);
      return;
    case "block-task":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "blocker_description", errors);
      return;
    case "assign-reviewer":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "reviewer_user_id", errors);
      return;
    case "override-model":
      hasStringField(payload, "task_id", errors);
      hasStringField(payload, "requested_model", errors);
      hasStringField(payload, "justification", errors);
      return;
    case "override-profile":
      hasStringField(payload, "requested_profile_id", errors);
      hasStringField(payload, "justification", errors);
      return;
  }
}
function validateGovernanceCommandEnvelope(value) {
  const errors = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["command must be an object"] };
  }
  if (typeof value.command_id !== "string" || value.command_id.trim() === "") {
    errors.push("command_id must be a non-empty string");
  }
  if (typeof value.issued_by !== "string" || value.issued_by.trim() === "") {
    errors.push("issued_by must be a non-empty string");
  }
  if (!isIsoTimestamp(value.issued_at)) {
    errors.push("issued_at must be a valid ISO timestamp");
  }
  if (typeof value.workspace_id !== "string" || value.workspace_id.trim() === "") {
    errors.push("workspace_id must be a non-empty string");
  }
  if (!isIsoTimestamp(value.expires_at)) {
    errors.push("expires_at must be a valid ISO timestamp");
  }
  if (value.target_run_id !== void 0 && typeof value.target_run_id !== "string") {
    errors.push("target_run_id must be a string when present");
  }
  if (value.target_task_id !== void 0 && typeof value.target_task_id !== "string") {
    errors.push("target_task_id must be a string when present");
  }
  if (value.governance_repo_ref !== void 0 && typeof value.governance_repo_ref !== "string") {
    errors.push("governance_repo_ref must be a string when present");
  }
  const commandType = value.command_type;
  if (typeof commandType !== "string" || !GOVERNANCE_COMMAND_TYPES.includes(commandType)) {
    errors.push("command_type must be one of the supported governance command types");
  }
  if (!isRecord(value.payload)) {
    errors.push("payload must be an object");
  } else if (typeof commandType === "string" && GOVERNANCE_COMMAND_TYPES.includes(commandType)) {
    validatePayload(commandType, value.payload, errors);
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    errors: [],
    command: value
  };
}
var GOVERNANCE_COMMAND_TYPES;
var init_command_channel = __esm({
  "../core/src/command-channel.ts"() {
    "use strict";
    GOVERNANCE_COMMAND_TYPES = [
      "pause-run",
      "resume-run",
      "requeue-task",
      "approve-task",
      "send-back-task",
      "block-task",
      "assign-reviewer",
      "override-model",
      "override-profile"
    ];
  }
});

// ../core/src/governance-repo.ts
var init_governance_repo = __esm({
  "../core/src/governance-repo.ts"() {
    "use strict";
    init_command_channel();
  }
});

// ../core/src/command-transport.ts
function isLikelyValidHttpUrl(value) {
  if (!value)
    return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}
function evaluateGovernanceCommandTransport(options = {}) {
  const env2 = options.env ?? process.env;
  const runtimeReady = options.runtimeReady ?? true;
  const localQueueRelativePath = options.localQueueRelativePath ?? ".devory/commands";
  const supabaseUrl = (env2.NEXT_PUBLIC_SUPABASE_URL ?? env2.SUPABASE_URL ?? "").trim();
  const supabaseUrlValid = isLikelyValidHttpUrl(supabaseUrl);
  const serviceRoleKeyPresent = (env2.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() !== "";
  if (!runtimeReady) {
    return {
      mode: "not-ready",
      summary: "Cloud commands: NOT READY",
      supabaseUrl,
      supabaseUrlValid,
      serviceRoleKeyPresent,
      localQueueRelativePath,
      reason: "governance mode is not active"
    };
  }
  if (supabaseUrlValid && serviceRoleKeyPresent) {
    return {
      mode: "supabase",
      summary: "Cloud commands: READY (managed cloud backend)",
      supabaseUrl,
      supabaseUrlValid,
      serviceRoleKeyPresent,
      localQueueRelativePath
    };
  }
  return {
    mode: "local-fallback",
    summary: `Cloud commands: LOCAL FALLBACK (${localQueueRelativePath})`,
    supabaseUrl,
    supabaseUrlValid,
    serviceRoleKeyPresent,
    localQueueRelativePath
  };
}
var init_command_transport = __esm({
  "../core/src/command-transport.ts"() {
    "use strict";
  }
});

// ../core/src/task-profiler.ts
function deriveComplexityTier(signals, contextSizeTier, outputSizeTier) {
  if (signals.task_type === "epic")
    return "high";
  if (signals.context_intensity_hint === "high")
    return "high";
  if (contextSizeTier === "large")
    return "high";
  if (signals.files_likely_affected_count > 5)
    return "high";
  if (signals.context_intensity_hint === "medium")
    return "medium";
  if (contextSizeTier === "medium")
    return "medium";
  if (outputSizeTier === "large")
    return "medium";
  if (signals.files_likely_affected_count >= 2)
    return "medium";
  if (signals.acceptance_criteria_length > 400)
    return "medium";
  if (signals.body_length > 1500)
    return "medium";
  return "low";
}
function deriveLocalViability(complexityTier, contextSizeTier, signals) {
  if (complexityTier === "high")
    return "poor";
  if (contextSizeTier === "large")
    return "poor";
  if (signals.context_intensity_hint === "high")
    return "poor";
  if (complexityTier === "low" && contextSizeTier === "small")
    return "good";
  return "marginal";
}
function deriveRecommendedProviderClass(localViability, signals, outputSizeTier) {
  if (localViability === "poor")
    return "cloud";
  if (outputSizeTier === "small" && signals.body_length < 300 && signals.files_likely_affected_count === 0 && signals.acceptance_criteria_length < 50) {
    return "deterministic";
  }
  return "local";
}
function buildProfileReasons(signals, complexityTier, contextSizeTier, localViability, decompositionCandidate) {
  const reasons = [];
  if (signals.task_type === "epic") {
    reasons.push(
      "Task type is 'epic'; treated as high complexity and decomposition required."
    );
  }
  if (signals.context_intensity_hint === "high") {
    reasons.push(
      "Task metadata sets context_intensity=high; cloud execution preferred."
    );
  } else if (signals.context_intensity_hint === "medium") {
    reasons.push(
      "Task metadata sets context_intensity=medium; medium complexity signal."
    );
  }
  if (signals.files_likely_affected_count > 5) {
    reasons.push(
      `High file count (${signals.files_likely_affected_count} files) indicates cross-cutting scope.`
    );
  } else if (signals.files_likely_affected_count >= 2) {
    reasons.push(
      `File count (${signals.files_likely_affected_count} files affected) suggests moderate scope.`
    );
  } else if (signals.files_likely_affected_count === 0) {
    reasons.push("No specific files listed; scope appears narrow or is unknown.");
  }
  if (contextSizeTier === "large") {
    reasons.push("Large context size estimated; may exceed local model context limits.");
  } else if (contextSizeTier === "medium") {
    reasons.push("Medium context size estimated; within local model capacity with care.");
  } else {
    reasons.push("Small context size estimated; well within local model capacity.");
  }
  if (complexityTier === "high") {
    reasons.push("High complexity: cloud execution recommended.");
  } else if (complexityTier === "medium") {
    reasons.push("Medium complexity: local execution viable with a capable local model.");
  } else {
    reasons.push("Low complexity: strong local candidate.");
  }
  if (decompositionCandidate) {
    reasons.push(
      "Task appears too broad for efficient local execution; consider splitting first."
    );
  }
  if (localViability === "poor") {
    reasons.push(
      "Local model viability is poor; cloud execution recommended."
    );
  } else if (localViability === "marginal") {
    reasons.push(
      "Local model viability is marginal; quality may vary depending on local model capability."
    );
  } else {
    reasons.push("Task is a good local candidate.");
  }
  return reasons;
}
function profileTask(source) {
  const estimate = estimateDryRunForTask(source);
  const factors = estimate.factors;
  const meta = source.meta ?? {};
  const signals = {
    body_length: factors.task_body_length,
    acceptance_criteria_length: factors.acceptance_criteria_length,
    verification_length: factors.verification_length,
    files_likely_affected_count: factors.files_likely_affected_count,
    dependency_count: Array.isArray(meta.depends_on) ? meta.depends_on.length : 0,
    task_type: typeof meta.type === "string" && meta.type.trim() !== "" ? meta.type.trim().toLowerCase() : null,
    context_intensity_hint: typeof meta.context_intensity === "string" && meta.context_intensity.trim() !== "" ? meta.context_intensity.trim().toLowerCase() : null,
    has_preferred_models: Array.isArray(meta.preferred_models) && meta.preferred_models.length > 0,
    has_disallowed_models: Array.isArray(meta.disallowed_models) && meta.disallowed_models.length > 0
  };
  const complexityTier = deriveComplexityTier(
    signals,
    estimate.context_tier,
    estimate.output_tier
  );
  const localViability = deriveLocalViability(
    complexityTier,
    estimate.context_tier,
    signals
  );
  const decompositionCandidate = signals.task_type === "epic" || complexityTier === "high" && (signals.files_likely_affected_count > 5 || estimate.context_tier === "large");
  const recommendedProviderClass = deriveRecommendedProviderClass(
    localViability,
    signals,
    estimate.output_tier
  );
  const reasons = buildProfileReasons(
    signals,
    complexityTier,
    estimate.context_tier,
    localViability,
    decompositionCandidate
  );
  return {
    complexity_tier: complexityTier,
    context_size_tier: estimate.context_tier,
    output_size_tier: estimate.output_tier,
    local_viability: localViability,
    decomposition_candidate: decompositionCandidate,
    recommended_provider_class: recommendedProviderClass,
    signals,
    reasons
  };
}
var init_task_profiler = __esm({
  "../core/src/task-profiler.ts"() {
    "use strict";
    init_dry_run_estimate();
  }
});

// ../core/src/provider-registry.ts
function getProviderById(id) {
  return PROVIDER_REGISTRY.find((p) => p.id === id) ?? null;
}
function getFallbackProvider(currentId, registry = PROVIDER_REGISTRY) {
  const currentIndex = registry.findIndex((p) => p.id === currentId);
  if (currentIndex === -1)
    return null;
  for (let i = currentIndex + 1; i < registry.length; i++) {
    if (registry[i].available)
      return registry[i];
  }
  return null;
}
function detectOllamaConfigured(env2 = process.env) {
  if (env2.FACTORY_DEFAULT_ENGINE === "ollama")
    return true;
  if (env2.OLLAMA_BASE_URL)
    return true;
  if (env2.OLLAMA_HOST)
    return true;
  return false;
}
function buildRegistryFromEnvironment(env2 = process.env, cloudAllowed = true, readiness) {
  const ollamaConfigured = detectOllamaConfigured(env2);
  const ollamaReadiness = readiness?.provider_classes.local_ollama;
  const cloudReadiness = readiness?.provider_classes.cloud_premium;
  return PROVIDER_REGISTRY.map((entry) => {
    if (entry.id === "local_ollama") {
      return {
        ...entry,
        available: ollamaReadiness ? isReadinessSelectable(ollamaReadiness.state) : ollamaConfigured,
        availability_note: ollamaReadiness?.detail ?? (ollamaConfigured ? null : "Ollama is not configured in the current environment. Set FACTORY_DEFAULT_ENGINE=ollama, OLLAMA_BASE_URL, or OLLAMA_HOST to enable local model execution.")
      };
    }
    if (entry.id === "cloud_premium") {
      const availableByReadiness = cloudReadiness ? isReadinessSelectable(cloudReadiness.state) : cloudAllowed;
      return {
        ...entry,
        available: cloudAllowed && availableByReadiness,
        availability_note: cloudReadiness?.detail ?? (cloudAllowed ? null : "Cloud execution is disabled by routing policy (cloud_allowed=false).")
      };
    }
    return entry;
  });
}
var PROVIDER_REGISTRY;
var init_provider_registry = __esm({
  "../core/src/provider-registry.ts"() {
    "use strict";
    init_target_readiness();
    PROVIDER_REGISTRY = [
      {
        id: "deterministic",
        label: "Deterministic (no model)",
        locality: "local",
        cost_profile: "free",
        capability_tier: "basic",
        suitable_task_patterns: [
          "dry-run",
          "validation",
          "simple-script",
          "lint"
        ],
        available: true,
        availability_note: null
      },
      {
        id: "local_ollama",
        label: "Local model (Ollama)",
        locality: "local",
        cost_profile: "free",
        capability_tier: "standard",
        suitable_task_patterns: [
          "feature",
          "bugfix",
          "refactor",
          "test",
          "documentation",
          "subtask"
        ],
        available: false,
        availability_note: "Requires Ollama running locally with a compatible model. Start Ollama and configure OLLAMA_HOST or use the default (localhost:11434)."
      },
      {
        id: "cloud_premium",
        label: "Cloud model (premium API)",
        locality: "cloud",
        cost_profile: "high",
        capability_tier: "premium",
        suitable_task_patterns: [
          "feature",
          "epic",
          "refactor",
          "architecture",
          "review",
          "bugfix",
          "test",
          "documentation"
        ],
        available: true,
        availability_note: null
      }
    ];
  }
});

// ../core/src/provider-target-resolver.ts
function splitCsv(value) {
  if (!value)
    return [];
  return value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
function titleCaseModelId(value) {
  return value.split(/[:/-]+/).filter((part) => part.length > 0).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function buildDynamicTarget(id, providerClass, adapterId) {
  const modelId = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const defaultLabel = providerClass === "local_ollama" ? `${titleCaseModelId(modelId)} (Ollama)` : providerClass === "cloud_premium" ? titleCaseModelId(modelId) : "Deterministic execution";
  return {
    id,
    provider_class: providerClass,
    adapter_id: adapterId,
    model_id: providerClass === "deterministic" ? null : modelId,
    label: defaultLabel,
    configured: true,
    available: true,
    adapter_available: true,
    relative_cost: providerClass === "cloud_premium" ? "medium" : "free",
    capability_hint: providerClass === "cloud_premium" ? "balanced" : "coding",
    suitable_task_patterns: [],
    availability_note: null,
    readiness_state: "configured_but_unverified",
    readiness_detail: null
  };
}
function collectConfiguredTargetIds(providerClass, policy, env2) {
  const configured = /* @__PURE__ */ new Set();
  const enabledTargets = policy?.enabled_targets ?? [];
  for (const entry of enabledTargets)
    configured.add(entry);
  if (providerClass === "local_ollama") {
    for (const entry of policy?.preferred_local_targets ?? [])
      configured.add(entry);
    for (const model of splitCsv(env2.DEVORY_LOCAL_MODEL_IDS)) {
      configured.add(model.startsWith("ollama:") ? model : `ollama:${model}`);
    }
    if (env2.OLLAMA_MODEL) {
      configured.add(
        env2.OLLAMA_MODEL.startsWith("ollama:") ? env2.OLLAMA_MODEL : `ollama:${env2.OLLAMA_MODEL}`
      );
    }
  }
  if (providerClass === "cloud_premium") {
    for (const entry of policy?.preferred_cloud_targets ?? [])
      configured.add(entry);
    for (const model of splitCsv(env2.DEVORY_CLOUD_MODEL_IDS)) {
      configured.add(model.startsWith("cloud:") ? model : `cloud:${model}`);
    }
    if (env2.DEVORY_CLOUD_MODEL) {
      configured.add(
        env2.DEVORY_CLOUD_MODEL.startsWith("cloud:") ? env2.DEVORY_CLOUD_MODEL : `cloud:${env2.DEVORY_CLOUD_MODEL}`
      );
    }
  }
  return Array.from(configured);
}
function isCloudBlockedByPolicy2(policy) {
  return Boolean(policy && (policy.local_only || !policy.cloud_allowed));
}
function inferFallbackReadiness(targetId, providerClass, configured, provider, policy) {
  if (providerClass === "deterministic") {
    return {
      state: "ready",
      detail: "Deterministic execution requires no external runtime."
    };
  }
  if (providerClass === "cloud_premium" && isCloudBlockedByPolicy2(policy) || (policy?.disabled_targets ?? []).includes(targetId)) {
    return {
      state: "blocked_by_policy",
      detail: (policy?.disabled_targets ?? []).includes(targetId) ? "Target disabled by routing policy." : provider?.availability_note ?? "Cloud execution is blocked by routing policy."
    };
  }
  if (!configured) {
    return {
      state: "unavailable",
      detail: "Target not configured for this workspace."
    };
  }
  if (provider && !provider.available) {
    return {
      state: "unavailable",
      detail: provider.availability_note ?? "Provider class unavailable."
    };
  }
  return {
    state: "configured_but_unverified",
    detail: providerClass === "local_ollama" ? "Ollama target is configured but current readiness was not verified." : "Cloud target is configured but current readiness was not verified."
  };
}
function resolveTargetReadiness(targetId, providerClass, configured, provider, options) {
  const snapshotTarget = options.readiness?.targets[targetId];
  if (snapshotTarget)
    return snapshotTarget;
  return inferFallbackReadiness(
    targetId,
    providerClass,
    configured,
    provider,
    options.policy
  );
}
function readinessAvailability(record) {
  return {
    available: isReadinessSelectable(record.state),
    adapter_available: isReadinessSelectable(record.state)
  };
}
function buildProviderTargetRegistry(options = {}) {
  const providerRegistry = options.provider_registry ?? [];
  const policy = options.policy;
  const env2 = options.env ?? process.env;
  const disabled = new Set(policy?.disabled_targets ?? []);
  const entries = [];
  const providerAvailability = /* @__PURE__ */ new Map();
  for (const provider of providerRegistry) {
    providerAvailability.set(provider.id, provider);
  }
  for (const base of BASE_PROVIDER_TARGETS) {
    const provider = providerAvailability.get(base.provider_class);
    const configured = base.provider_class === "deterministic" || collectConfiguredTargetIds(base.provider_class, policy, env2).includes(base.id);
    const readiness = resolveTargetReadiness(
      base.id,
      base.provider_class,
      configured,
      provider,
      options
    );
    const availability = readinessAvailability(readiness);
    entries.push({
      ...base,
      configured,
      available: availability.available,
      adapter_available: availability.adapter_available,
      availability_note: readiness.detail,
      readiness_state: readiness.state,
      readiness_detail: readiness.detail
    });
  }
  for (const providerClass of ["local_ollama", "cloud_premium"]) {
    for (const configuredId of collectConfiguredTargetIds(providerClass, policy, env2)) {
      if (entries.some((entry) => entry.id === configuredId))
        continue;
      if (disabled.has(configuredId))
        continue;
      const provider = providerAvailability.get(providerClass);
      const adapterId = providerClass === "local_ollama" ? "ollama" : "cloud_api";
      const dynamic = buildDynamicTarget(configuredId, providerClass, adapterId);
      const readiness = resolveTargetReadiness(
        configuredId,
        providerClass,
        true,
        provider,
        options
      );
      const availability = readinessAvailability(readiness);
      entries.push({
        ...dynamic,
        available: availability.available,
        adapter_available: availability.adapter_available,
        availability_note: readiness.detail,
        readiness_state: readiness.state,
        readiness_detail: readiness.detail
      });
    }
  }
  return entries;
}
function preferredTargetIdsForClass(providerClass, policy) {
  if (providerClass === "local_ollama") {
    return policy?.preferred_local_targets ?? [];
  }
  if (providerClass === "cloud_premium") {
    return policy?.preferred_cloud_targets ?? [];
  }
  return [];
}
function isPreferredByTaskHints(target, taskMeta) {
  const preferredModels = Array.isArray(taskMeta?.preferred_models) ? taskMeta.preferred_models.filter(
    (entry) => typeof entry === "string"
  ) : [];
  return preferredModels.some(
    (entry) => entry === target.id || entry === target.model_id
  );
}
function isDisallowedByTaskHints(target, taskMeta) {
  const disallowedModels = Array.isArray(taskMeta?.disallowed_models) ? taskMeta.disallowed_models.filter(
    (entry) => typeof entry === "string"
  ) : [];
  return disallowedModels.some(
    (entry) => entry === target.id || entry === target.model_id
  );
}
function scoreTarget(target, options, includeAvailability) {
  const profile = options.task_profile;
  const taskMeta = options.task_meta;
  const policy = options.policy;
  let score = 0;
  if (includeAvailability) {
    if (target.readiness_state === "ready")
      score += 140;
    else if (target.readiness_state === "configured_but_unverified")
      score += 110;
    else if (target.readiness_state === "unknown")
      score += 20;
  }
  if (target.configured)
    score += 20;
  const preferredIds = preferredTargetIdsForClass(target.provider_class, policy);
  const preferredIndex = preferredIds.indexOf(target.id);
  if (preferredIndex !== -1) {
    score += 60 - preferredIndex * 5;
  }
  if (isPreferredByTaskHints(target, taskMeta)) {
    score += 70;
  }
  if (profile) {
    if (profile.complexity_tier === "high" || profile.context_size_tier === "large" || profile.decomposition_candidate) {
      if (target.provider_class === "local_ollama" && target.model_id === "qwen2.5-coder:14b") {
        score += 25;
      }
      if (target.provider_class === "cloud_premium" && target.model_id === "claude-sonnet-4-6") {
        score += 25;
      }
    } else if (profile.complexity_tier === "low") {
      if (target.provider_class === "local_ollama" && target.model_id === "deepseek-coder:6.7b") {
        score += 20;
      }
      if (target.provider_class === "cloud_premium" && target.model_id === "gpt-5-mini") {
        score += 15;
      }
    }
    if (profile.output_size_tier === "large" && target.capability_hint === "planning") {
      score += 10;
    }
  }
  if (target.relative_cost === "free")
    score += 4;
  if (target.relative_cost === "high")
    score -= 2;
  return score;
}
function formatSummaryLabel(providerClass, target) {
  if (!target)
    return providerClass;
  return `${providerClass} -> ${target.model_id ?? target.id}`;
}
function resolveProviderTarget(providerClass, options = {}) {
  const registry = buildProviderTargetRegistry(options).filter(
    (entry) => entry.provider_class === providerClass
  );
  const taskMeta = options.task_meta;
  const warnings = [];
  const resolutionNotes = [];
  const filtered = registry.filter((entry) => !isDisallowedByTaskHints(entry, taskMeta));
  const preferredSorted = [...filtered].sort((left, right) => {
    const scoreDiff = scoreTarget(right, options, false) - scoreTarget(left, options, false);
    if (scoreDiff !== 0)
      return scoreDiff;
    return left.id.localeCompare(right.id);
  });
  const actualSorted = [...filtered].sort((left, right) => {
    const scoreDiff = scoreTarget(right, options, true) - scoreTarget(left, options, true);
    if (scoreDiff !== 0)
      return scoreDiff;
    return left.id.localeCompare(right.id);
  });
  const preferredTarget = preferredSorted[0] ?? null;
  const actualTarget = actualSorted.find(
    (entry) => entry.available && entry.adapter_available
  ) ?? null;
  const preferredTargetUnavailable = !!(preferredTarget && actualTarget && preferredTarget.id !== actualTarget.id);
  const fallbackTaken = preferredTargetUnavailable;
  if (preferredTarget) {
    resolutionNotes.push(`Preferred target candidate: ${preferredTarget.id}.`);
    resolutionNotes.push(
      `Preferred target readiness: ${preferredTarget.readiness_state}` + (preferredTarget.readiness_detail ? ` (${preferredTarget.readiness_detail})` : ".")
    );
  }
  if (actualTarget) {
    resolutionNotes.push(`Resolved concrete target: ${actualTarget.id}.`);
    resolutionNotes.push(
      `Actual target readiness: ${actualTarget.readiness_state}` + (actualTarget.readiness_detail ? ` (${actualTarget.readiness_detail})` : ".")
    );
  }
  if (preferredTarget && !actualTarget) {
    warnings.push(
      preferredTarget.readiness_detail ?? "No concrete target is currently executable for the selected provider class."
    );
  } else if (preferredTargetUnavailable && actualTarget) {
    warnings.push(
      `Preferred target ${preferredTarget.id} is ${preferredTarget.readiness_state}; using ${actualTarget.model_id ?? actualTarget.id} (${actualTarget.readiness_state}).`
    );
  } else if (actualTarget && actualTarget.readiness_state === "configured_but_unverified") {
    warnings.push(
      actualTarget.readiness_detail ?? "Concrete target is configured but readiness could not be verified."
    );
  }
  return {
    provider_class: providerClass,
    preferred_target: preferredTarget,
    actual_target: actualTarget,
    adapter_id: actualTarget?.adapter_id ?? null,
    preferred_target_unavailable: preferredTargetUnavailable,
    fallback_taken: fallbackTaken,
    resolution_notes: resolutionNotes,
    warnings,
    summary_label: formatSummaryLabel(providerClass, actualTarget ?? preferredTarget),
    readiness_state: actualTarget?.readiness_state ?? preferredTarget?.readiness_state ?? "unknown",
    readiness_detail: actualTarget?.readiness_detail ?? preferredTarget?.readiness_detail ?? null
  };
}
var BASE_PROVIDER_TARGETS;
var init_provider_target_resolver = __esm({
  "../core/src/provider-target-resolver.ts"() {
    "use strict";
    init_target_readiness();
    BASE_PROVIDER_TARGETS = [
      {
        id: "deterministic:factory-default",
        provider_class: "deterministic",
        adapter_id: "deterministic",
        model_id: null,
        label: "Deterministic execution",
        relative_cost: "free",
        capability_hint: "basic",
        suitable_task_patterns: ["dry-run", "validation", "simple-script", "lint"]
      },
      {
        id: "ollama:qwen2.5-coder:14b",
        provider_class: "local_ollama",
        adapter_id: "ollama",
        model_id: "qwen2.5-coder:14b",
        label: "Qwen 2.5 Coder 14B (Ollama)",
        relative_cost: "free",
        capability_hint: "coding",
        suitable_task_patterns: ["feature", "bugfix", "refactor", "test"]
      },
      {
        id: "ollama:deepseek-coder:6.7b",
        provider_class: "local_ollama",
        adapter_id: "ollama",
        model_id: "deepseek-coder:6.7b",
        label: "DeepSeek Coder 6.7B (Ollama)",
        relative_cost: "free",
        capability_hint: "coding",
        suitable_task_patterns: ["bugfix", "test", "documentation"]
      },
      {
        id: "cloud:claude-sonnet-4-6",
        provider_class: "cloud_premium",
        adapter_id: "cloud_api",
        model_id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        relative_cost: "high",
        capability_hint: "planning",
        suitable_task_patterns: ["feature", "architecture", "review", "epic"]
      },
      {
        id: "cloud:gpt-5-mini",
        provider_class: "cloud_premium",
        adapter_id: "cloud_api",
        model_id: "gpt-5-mini",
        label: "GPT-5 Mini",
        relative_cost: "medium",
        capability_hint: "balanced",
        suitable_task_patterns: ["feature", "bugfix", "test", "documentation"]
      }
    ];
  }
});

// ../core/src/routing-policy.ts
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asBoolean3(value) {
  return typeof value === "boolean" ? value : void 0;
}
function asNullablePositiveNumber(value) {
  if (value === null)
    return null;
  if (typeof value === "number" && isFinite(value) && value >= 0)
    return value;
  return void 0;
}
function asStringArray2(value) {
  if (!Array.isArray(value))
    return void 0;
  return value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
function normalizePreference(value) {
  if (typeof value === "string" && VALID_ROUTING_POLICY_PREFERENCES.includes(value)) {
    return value;
  }
  return void 0;
}
function normalizeProviderClass(value) {
  if (value === null)
    return null;
  if (typeof value === "string" && VALID_ROUTING_POLICY_PROVIDER_CLASSES.includes(value)) {
    return value;
  }
  return void 0;
}
function normalizeRoutingPolicyOverrides(value) {
  if (!isRecord2(value)) {
    throw new Error("devory: routing policy config must be a JSON object");
  }
  const overrides = {};
  const defaultPreference = normalizePreference(value.default_preference);
  if (defaultPreference !== void 0) {
    overrides.default_preference = defaultPreference;
  }
  const cloudAllowed = asBoolean3(value.cloud_allowed);
  if (cloudAllowed !== void 0)
    overrides.cloud_allowed = cloudAllowed;
  const localOnly = asBoolean3(value.local_only);
  if (localOnly !== void 0)
    overrides.local_only = localOnly;
  const requireConfirmation = asBoolean3(value.require_cloud_confirmation);
  if (requireConfirmation !== void 0) {
    overrides.require_cloud_confirmation = requireConfirmation;
  }
  const maxCost = asNullablePositiveNumber(value.max_estimated_cloud_cost_usd);
  if (maxCost !== void 0)
    overrides.max_estimated_cloud_cost_usd = maxCost;
  const preferredLocal = normalizeProviderClass(value.preferred_local_provider);
  if (preferredLocal !== void 0) {
    overrides.preferred_local_provider = preferredLocal;
  }
  const preferredCloud = normalizeProviderClass(value.preferred_cloud_provider);
  if (preferredCloud !== void 0) {
    overrides.preferred_cloud_provider = preferredCloud;
  }
  const preferredLocalTargets = asStringArray2(value.preferred_local_targets);
  if (preferredLocalTargets !== void 0) {
    overrides.preferred_local_targets = preferredLocalTargets;
  }
  const preferredCloudTargets = asStringArray2(value.preferred_cloud_targets);
  if (preferredCloudTargets !== void 0) {
    overrides.preferred_cloud_targets = preferredCloudTargets;
  }
  const enabledTargets = asStringArray2(value.enabled_targets);
  if (enabledTargets !== void 0) {
    overrides.enabled_targets = enabledTargets;
  }
  const disabledTargets = asStringArray2(value.disabled_targets);
  if (disabledTargets !== void 0) {
    overrides.disabled_targets = disabledTargets;
  }
  const sensitiveMode = asBoolean3(value.sensitive_workspace_mode);
  if (sensitiveMode !== void 0) {
    overrides.sensitive_workspace_mode = sensitiveMode;
  }
  const allowFallback = asBoolean3(value.allow_fallback_to_cloud);
  if (allowFallback !== void 0) {
    overrides.allow_fallback_to_cloud = allowFallback;
  }
  return overrides;
}
function applyRoutingPolicyOverrides(base, overrides) {
  return { ...base, ...overrides };
}
function loadDefaultRoutingPolicy() {
  try {
    const raw = fs6.readFileSync(DEFAULTS_PATH4, "utf-8");
    const parsed = JSON.parse(raw);
    const overrides = normalizeRoutingPolicyOverrides(parsed);
    return applyRoutingPolicyOverrides(DEFAULT_ROUTING_POLICY, overrides);
  } catch {
    return { ...DEFAULT_ROUTING_POLICY };
  }
}
function loadWorkspaceRoutingPolicy(factoryRoot) {
  const configPath = path11.join(factoryRoot, ROUTING_POLICY_WORKSPACE_PATH);
  if (!fs6.existsSync(configPath))
    return null;
  let parsed;
  try {
    parsed = JSON.parse(fs6.readFileSync(configPath, "utf-8"));
  } catch (error) {
    throw new Error(
      `devory: failed to parse ${ROUTING_POLICY_WORKSPACE_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return normalizeRoutingPolicyOverrides(parsed);
}
function resolveRoutingPolicy(factoryRoot) {
  let policy = loadDefaultRoutingPolicy();
  const appliedLayers = [
    "shipped-defaults"
  ];
  const workspaceConfigPath = path11.join(
    factoryRoot,
    ROUTING_POLICY_WORKSPACE_PATH
  );
  const workspaceOverrides = loadWorkspaceRoutingPolicy(factoryRoot);
  if (workspaceOverrides && Object.keys(workspaceOverrides).length > 0) {
    policy = applyRoutingPolicyOverrides(policy, workspaceOverrides);
    appliedLayers.push("workspace-config");
  }
  if (policy.local_only) {
    policy = { ...policy, cloud_allowed: false, allow_fallback_to_cloud: false };
  }
  return {
    policy,
    applied_layers: appliedLayers,
    workspace_config_path: fs6.existsSync(workspaceConfigPath) ? workspaceConfigPath : null
  };
}
function formatRoutingPolicySummary(policy) {
  const parts = [];
  if (policy.local_only) {
    parts.push("local-only mode");
  } else {
    if (policy.cloud_allowed !== DEFAULT_ROUTING_POLICY.cloud_allowed) {
      parts.push("cloud=disabled");
    }
    if (policy.allow_fallback_to_cloud !== DEFAULT_ROUTING_POLICY.allow_fallback_to_cloud) {
      parts.push("no-cloud-fallback");
    }
    if (policy.require_cloud_confirmation !== DEFAULT_ROUTING_POLICY.require_cloud_confirmation) {
      parts.push(
        policy.require_cloud_confirmation ? "cloud-confirmation-required" : "cloud-confirmation-disabled"
      );
    }
    if (policy.default_preference !== DEFAULT_ROUTING_POLICY.default_preference) {
      parts.push(`default=${policy.default_preference}`);
    }
    if (policy.max_estimated_cloud_cost_usd !== null) {
      parts.push(`max-cost=$${policy.max_estimated_cloud_cost_usd.toFixed(2)}`);
    }
    if (policy.preferred_local_targets.length > 0) {
      parts.push(`local-target=${policy.preferred_local_targets[0]}`);
    }
    if (policy.preferred_cloud_targets.length > 0) {
      parts.push(`cloud-target=${policy.preferred_cloud_targets[0]}`);
    }
    if (policy.sensitive_workspace_mode)
      parts.push("sensitive-workspace");
  }
  return parts.join(" | ");
}
var fs6, path11, ROUTING_POLICY_FILENAME, ROUTING_POLICY_WORKSPACE_PATH, VALID_ROUTING_POLICY_PREFERENCES, VALID_ROUTING_POLICY_PROVIDER_CLASSES, DEFAULT_ROUTING_POLICY, DEFAULTS_PATH4;
var init_routing_policy = __esm({
  "../core/src/routing-policy.ts"() {
    "use strict";
    fs6 = __toESM(require("fs"));
    path11 = __toESM(require("path"));
    init_defaults_path();
    ROUTING_POLICY_FILENAME = "routing-policy.json";
    ROUTING_POLICY_WORKSPACE_PATH = path11.join(
      "config",
      ROUTING_POLICY_FILENAME
    );
    VALID_ROUTING_POLICY_PREFERENCES = [
      "auto",
      "prefer_local",
      "force_local",
      "allow_cloud",
      "force_cloud",
      "deterministic_only"
    ];
    VALID_ROUTING_POLICY_PROVIDER_CLASSES = [
      "deterministic",
      "local_ollama",
      "cloud_premium"
    ];
    DEFAULT_ROUTING_POLICY = {
      default_preference: "auto",
      cloud_allowed: true,
      local_only: false,
      require_cloud_confirmation: true,
      max_estimated_cloud_cost_usd: null,
      preferred_local_provider: null,
      preferred_cloud_provider: null,
      preferred_local_targets: [],
      preferred_cloud_targets: [],
      enabled_targets: [],
      disabled_targets: [],
      sensitive_workspace_mode: false,
      allow_fallback_to_cloud: true
    };
    DEFAULTS_PATH4 = path11.join(
      resolveCoreDefaultsDir(__dirname),
      ROUTING_POLICY_FILENAME
    );
  }
});

// ../core/src/execution-router.ts
function formatCostImpact(provider, dryRunEstimate) {
  if (provider.locality === "local") {
    return "$0.00 (local model, no API billing)";
  }
  if (provider.id === "deterministic") {
    return "$0.00 (no model)";
  }
  if (dryRunEstimate && dryRunEstimate.estimated_cost_usd.max > 0) {
    const min = dryRunEstimate.estimated_cost_usd.min.toFixed(3);
    const max = dryRunEstimate.estimated_cost_usd.max.toFixed(3);
    return `$${min}\u2013$${max} est. (${dryRunEstimate.confidence} confidence)`;
  }
  return "cost unknown (cloud model \u2014 estimate unavailable)";
}
function deriveConfidence2(provider, profile, fallbackTaken) {
  if (!provider.available)
    return "low";
  if (fallbackTaken)
    return "medium";
  if (profile.local_viability === "poor" && provider.locality === "local")
    return "low";
  if (profile.complexity_tier === "low" && provider.locality === "local")
    return "high";
  if (profile.complexity_tier === "high" && provider.capability_tier === "premium")
    return "high";
  return "medium";
}
function selectTargetProviderId(preference, profile) {
  switch (preference) {
    case "force_cloud":
      return "cloud_premium";
    case "deterministic_only":
      return "deterministic";
    case "force_local":
    case "prefer_local":
      return "local_ollama";
    case "auto":
    case "allow_cloud":
    default:
      switch (profile.recommended_provider_class) {
        case "deterministic":
          return "deterministic";
        case "cloud":
          return "cloud_premium";
        case "local":
        default:
          return "local_ollama";
      }
  }
}
function buildRouteMode(preference, selectedId, fallbackTaken, unavailableId) {
  if (preference === "force_cloud")
    return "forced-cloud";
  if (preference === "force_local")
    return "forced-local";
  if (preference === "deterministic_only")
    return "deterministic-selected";
  if (fallbackTaken && unavailableId === "local_ollama") {
    return "local-unavailable-fallback";
  }
  if (fallbackTaken)
    return "fallback-selected";
  if (selectedId === "cloud_premium")
    return "cloud-selected";
  if (selectedId === "deterministic")
    return "deterministic-selected";
  return "local-first";
}
function buildExplanationBullets(provider, profile, preference, fallbackTaken, unavailableId) {
  const bullets = [];
  if (preference === "force_cloud") {
    bullets.push("Cloud provider forced by user preference.");
  } else if (preference === "force_local") {
    bullets.push("Local provider forced by user preference.");
  } else if (preference === "deterministic_only") {
    bullets.push("Deterministic-only mode selected by user preference.");
  } else if (preference === "prefer_local") {
    bullets.push("Local execution preferred by user; selecting local if available.");
  } else {
    bullets.push(
      `Routing policy: local-first. Recommended provider class: ${profile.recommended_provider_class}.`
    );
  }
  if (fallbackTaken && unavailableId === "local_ollama") {
    bullets.push(
      "Local model (Ollama) is not available; fell back to next viable provider."
    );
  } else if (fallbackTaken && unavailableId !== null) {
    bullets.push(
      `Provider '${unavailableId}' is not available; fell back to '${provider.id}'.`
    );
  }
  bullets.push(
    `Task complexity: ${profile.complexity_tier}. Context size: ${profile.context_size_tier}. Output size: ${profile.output_size_tier}.`
  );
  bullets.push(
    `Local model viability: ${profile.local_viability}.`
  );
  if (provider.locality === "local") {
    bullets.push(
      `Selected provider runs locally \u2014 no cloud API usage or billing.`
    );
  } else {
    bullets.push(
      `Selected provider uses a cloud API \u2014 usage cost applies.`
    );
  }
  return bullets;
}
function buildWarnings(provider, profile, preference) {
  const warnings = [];
  if (!provider.available && provider.availability_note) {
    warnings.push(`Provider not available: ${provider.availability_note}`);
  }
  if (preference === "force_local" && profile.local_viability === "poor") {
    warnings.push(
      "Local execution forced but task profile indicates poor local viability. Output quality may be reduced."
    );
  }
  if (preference === "deterministic_only" && profile.recommended_provider_class !== "deterministic") {
    warnings.push(
      "Deterministic-only mode selected, but this task is not a deterministic candidate. Execution may produce limited or no useful output."
    );
  }
  if (preference === "force_cloud" && provider.locality === "cloud" && provider.cost_profile !== "free") {
    warnings.push(
      "Cloud execution forced. Ensure cloud API access and budget are in order."
    );
  }
  return warnings;
}
function applyPolicyToRegistry(registry, policy) {
  const cloudHardBlocked = policy.local_only || !policy.cloud_allowed;
  if (!cloudHardBlocked)
    return registry;
  return registry.map((entry) => {
    if (entry.id === "cloud_premium") {
      return {
        ...entry,
        available: false,
        availability_note: policy.local_only ? "Cloud disabled \u2014 local-only mode is active." : "Cloud disabled by routing policy (cloud_allowed=false)."
      };
    }
    return entry;
  });
}
function blockCloudInFallbackRegistry(registry) {
  return registry.map((entry) => {
    if (entry.id === "cloud_premium") {
      return {
        ...entry,
        available: false,
        availability_note: "Cloud fallback disabled by routing policy (allow_fallback_to_cloud=false)."
      };
    }
    return entry;
  });
}
function collectPolicyEffects(policy, selectedProvider, dryRunEstimate) {
  const effects = [];
  if (policy.local_only) {
    effects.push("Local-only mode active \u2014 cloud execution is not permitted.");
  } else if (!policy.cloud_allowed) {
    effects.push("Cloud execution disallowed by policy (cloud_allowed=false).");
  }
  if (policy.allow_fallback_to_cloud !== true && !policy.local_only && policy.cloud_allowed) {
    effects.push("Cloud fallback disabled \u2014 local unavailability will not escalate to cloud.");
  }
  if (policy.sensitive_workspace_mode) {
    effects.push("Sensitive workspace mode active \u2014 cloud escalation is restricted.");
  }
  if (policy.require_cloud_confirmation && selectedProvider.locality === "cloud" && policy.require_cloud_confirmation !== DEFAULT_ROUTING_POLICY.require_cloud_confirmation) {
    effects.push("Cloud confirmation required before execution (require_cloud_confirmation=true).");
  }
  if (policy.max_estimated_cloud_cost_usd !== null && dryRunEstimate !== void 0 && selectedProvider.locality === "cloud") {
    const maxEstimate = dryRunEstimate.estimated_cost_usd.max;
    if (maxEstimate > policy.max_estimated_cloud_cost_usd) {
      effects.push(
        `Estimated cost $${maxEstimate.toFixed(3)} exceeds policy ceiling $${policy.max_estimated_cloud_cost_usd.toFixed(2)}.`
      );
    }
  }
  if (policy.default_preference !== "auto") {
    effects.push(
      `Policy default preference: ${policy.default_preference} (overrides auto-routing default).`
    );
  }
  return effects;
}
function routeExecution(profile, preference = "auto", options = {}) {
  const baseRegistry = options.registry ?? PROVIDER_REGISTRY;
  const dryRunEstimate = options.dryRunEstimate;
  const policy = options.policy;
  const registry = policy ? applyPolicyToRegistry(baseRegistry, policy) : baseRegistry;
  const effectivePreference = preference === "auto" && policy && policy.default_preference !== "auto" ? policy.default_preference : preference;
  const targetId = selectTargetProviderId(effectivePreference, profile);
  const targetEntry = registry.find((p) => p.id === targetId) ?? null;
  let selectedProvider;
  let fallbackTaken = false;
  let unavailableId = null;
  if (targetEntry && targetEntry.available) {
    selectedProvider = targetEntry;
  } else {
    unavailableId = targetId;
    const isLocalTarget = targetId === "local_ollama" || targetId === "deterministic";
    const fallbackRegistry = policy && !policy.allow_fallback_to_cloud && isLocalTarget ? blockCloudInFallbackRegistry(registry) : registry;
    const fallback = getFallbackProvider(targetId, fallbackRegistry) ?? // Last resort: cloud_premium if available and not blocked
    fallbackRegistry.find((p) => p.id === "cloud_premium" && p.available) ?? // Absolute last resort: any available provider
    fallbackRegistry.find((p) => p.available) ?? null;
    if (fallback) {
      selectedProvider = fallback;
      fallbackTaken = true;
    } else {
      selectedProvider = registry.find((p) => p.id === "deterministic") ?? getProviderById("deterministic") ?? registry[0];
      fallbackTaken = true;
    }
  }
  const routeMode = buildRouteMode(
    effectivePreference,
    selectedProvider.id,
    fallbackTaken,
    unavailableId
  );
  const confidence = deriveConfidence2(selectedProvider, profile, fallbackTaken);
  const explanationBullets = buildExplanationBullets(
    selectedProvider,
    profile,
    effectivePreference,
    fallbackTaken,
    unavailableId
  );
  const estimatedCostImpact = formatCostImpact(selectedProvider, dryRunEstimate);
  const decompositionRecommended = profile.decomposition_candidate;
  const decompositionNote = decompositionRecommended ? "This task may be better split into subtasks before execution. Use the Refine/Split feature to decompose it first." : null;
  const alternativeProvider = registry.find(
    (p) => p.available && p.id !== selectedProvider.id
  ) ?? null;
  const warnings = buildWarnings(selectedProvider, profile, effectivePreference);
  if (!selectedProvider.available && selectedProvider.availability_note) {
    if (!warnings.some((w) => w.includes("not available"))) {
      warnings.push(
        `Selected provider is not available: ${selectedProvider.availability_note}`
      );
    }
  }
  const policyEffects = policy ? collectPolicyEffects(policy, selectedProvider, dryRunEstimate) : [];
  const cloudConfirmationRequired = !!(policy && policy.require_cloud_confirmation && selectedProvider.locality === "cloud");
  for (const effect of policyEffects) {
    if ((effect.includes("exceeds") || effect.includes("confirmation required")) && !warnings.includes(effect)) {
      warnings.push(effect);
    }
  }
  if (cloudConfirmationRequired && !warnings.some((w) => w.includes("confirmation"))) {
    warnings.push(
      "Cloud execution selected \u2014 confirmation required by policy before proceeding."
    );
  }
  return {
    selected_provider: selectedProvider,
    preference_applied: effectivePreference,
    route_mode: routeMode,
    explanation_bullets: [...policyEffects, ...explanationBullets],
    confidence,
    estimated_cost_impact: estimatedCostImpact,
    decomposition_recommended: decompositionRecommended,
    decomposition_note: decompositionNote,
    alternative_provider: alternativeProvider,
    warnings,
    cloud_confirmation_required: cloudConfirmationRequired,
    policy_effects: policyEffects
  };
}
function formatRoutingDecisionSummary(decision) {
  const parts = [
    `Routing: ${decision.route_mode} \u2192 ${decision.selected_provider.label}`,
    `${decision.confidence} confidence`,
    decision.estimated_cost_impact
  ];
  if (decision.decomposition_recommended) {
    parts.push("decomposition suggested");
  }
  if (decision.warnings.length > 0) {
    parts.push(`${decision.warnings.length} warning(s)`);
  }
  return parts.join(" \xB7 ");
}
function summarizeRoutingDecisions(decisions) {
  const by_provider = {};
  let decomposition_candidates = 0;
  for (const d of decisions) {
    const id = d.selected_provider.id;
    by_provider[id] = (by_provider[id] ?? 0) + 1;
    if (d.decomposition_recommended)
      decomposition_candidates++;
  }
  const parts = [];
  const localCount = (by_provider["deterministic"] ?? 0) + (by_provider["local_ollama"] ?? 0);
  const cloudCount = by_provider["cloud_premium"] ?? 0;
  if (localCount > 0)
    parts.push(`${localCount} local`);
  if (cloudCount > 0)
    parts.push(`${cloudCount} cloud`);
  if (decomposition_candidates > 0)
    parts.push(`${decomposition_candidates} need decomposition`);
  const summary_line = decisions.length === 0 ? "No tasks to route." : `${decisions.length} task(s): ${parts.join(", ")}.`;
  return {
    total: decisions.length,
    by_provider,
    decomposition_candidates,
    summary_line
  };
}
var VALID_EXECUTION_PREFERENCES, EXECUTION_PREFERENCE_LABELS;
var init_execution_router = __esm({
  "../core/src/execution-router.ts"() {
    "use strict";
    init_provider_registry();
    init_routing_policy();
    VALID_EXECUTION_PREFERENCES = [
      "auto",
      "prefer_local",
      "force_local",
      "allow_cloud",
      "force_cloud",
      "deterministic_only"
    ];
    EXECUTION_PREFERENCE_LABELS = {
      auto: "Auto (local-first)",
      prefer_local: "Prefer local",
      force_local: "Force local",
      allow_cloud: "Allow cloud",
      force_cloud: "Force cloud",
      deterministic_only: "Deterministic only"
    };
  }
});

// ../core/src/execution-binding.ts
function isDecisionFallback(decision, preference) {
  if (decision.route_mode === "local-unavailable-fallback" || decision.route_mode === "fallback-selected") {
    return true;
  }
  if (preference === "force_local" && decision.route_mode === "forced-local" && decision.selected_provider.id !== "local_ollama") {
    return true;
  }
  return false;
}
function resolveOriginallyTargeted(decision, preference) {
  if (!isDecisionFallback(decision, preference))
    return null;
  if (preference === "force_local" || preference === "prefer_local") {
    return "local_ollama";
  }
  if (preference === "force_cloud") {
    return "cloud_premium";
  }
  if (preference === "deterministic_only") {
    return "deterministic";
  }
  if (decision.route_mode === "local-unavailable-fallback") {
    return "local_ollama";
  }
  return null;
}
function resolveExecutionPath(selectedId, taskFallbackTaken, originallyTargeted, preference) {
  if (preference === "force_local" && taskFallbackTaken && originallyTargeted === "local_ollama" && selectedId !== "local_ollama") {
    return "unavailable_stopped";
  }
  if (taskFallbackTaken && originallyTargeted !== null && originallyTargeted !== selectedId) {
    return "unavailable_fallback";
  }
  switch (selectedId) {
    case "cloud_premium":
      return "cloud_api";
    case "local_ollama":
      return "local_ollama";
    case "deterministic":
      return "deterministic";
    default:
      return "cloud_api";
  }
}
function dominantProviderClass(decisions) {
  if (decisions.length === 0)
    return "cloud_premium";
  const counts = {};
  for (const d of decisions) {
    const id = d.selected_provider.id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const order = ["deterministic", "local_ollama", "cloud_premium"];
  let maxCount = 0;
  let winner = decisions[0].selected_provider.id;
  for (const id of order) {
    const count = counts[id] ?? 0;
    if (count > maxCount) {
      maxCount = count;
      winner = id;
    }
  }
  return winner;
}
function buildBindingSummary(selectedClass, executionPath, preference, fallbackTaken, originallyTargeted, actualTargetId, actualAdapterId, actualExecutionPath, targetFallbackTaken, adapterFallbackTaken, decompositionRecommended, blockedByPolicy, cloudConfirmationRequired, targetReadinessState) {
  const pathLabel = {
    cloud_api: "cloud API",
    local_ollama: "local Ollama",
    deterministic: "deterministic (no model)",
    unavailable_fallback: "fallback (intended unavailable)",
    unavailable_stopped: "STOPPED (force_local violated \u2014 no local provider)"
  };
  const parts = [
    `selected=${selectedClass}`,
    `path=${pathLabel[executionPath]}`,
    `preference=${preference}`
  ];
  if (fallbackTaken && originallyTargeted) {
    parts.push(`fallback_from=${originallyTargeted}`);
  }
  if (actualTargetId) {
    parts.push(`target=${actualTargetId}`);
  }
  if (actualAdapterId) {
    parts.push(`adapter=${actualAdapterId}`);
  }
  if (actualExecutionPath) {
    parts.push(`lane=${actualExecutionPath}`);
  }
  parts.push(`target_readiness=${targetReadinessState}`);
  if (targetFallbackTaken) {
    parts.push("target_fallback=true");
  }
  if (adapterFallbackTaken) {
    parts.push("adapter_fallback=true");
  }
  if (blockedByPolicy) {
    parts.push("blocked_by_policy=true");
  }
  if (cloudConfirmationRequired) {
    parts.push("cloud_confirmation=required");
  }
  if (decompositionRecommended) {
    parts.push("decomposition=recommended");
  }
  return parts.join(" \xB7 ");
}
function bindExecution(decisions, preference, policyOrOptions, maybeTaskProfiles) {
  const options = policyOrOptions && ("policy" in policyOrOptions || "task_profiles" in policyOrOptions || "task_metas" in policyOrOptions) ? policyOrOptions : {
    policy: policyOrOptions,
    task_profiles: maybeTaskProfiles
  };
  const policy = options.policy;
  const perTaskBindings = decisions.map((d, i) => {
    const taskFallbackTaken = isDecisionFallback(d, preference);
    const originallyTargeted = resolveOriginallyTargeted(d, preference);
    const taskExecutionPath = resolveExecutionPath(
      d.selected_provider.id,
      taskFallbackTaken,
      originallyTargeted,
      preference
    );
    const targetResolution2 = resolveProviderTarget(d.selected_provider.id, {
      policy,
      task_profile: options.task_profiles?.[i],
      task_meta: options.task_metas?.[i],
      provider_registry: decisions.map((decision) => decision.selected_provider),
      readiness: options.readiness
    });
    const selectedAdapter2 = resolveExecutionAdapter({
      target: targetResolution2.preferred_target,
      readiness_state: targetResolution2.preferred_target?.readiness_state,
      policy
    });
    const actualAdapterCandidate2 = resolveExecutionAdapter({
      target: targetResolution2.actual_target,
      readiness_state: targetResolution2.readiness_state,
      policy
    });
    const actualAdapter2 = actualAdapterCandidate2 ?? (targetResolution2.actual_target === null && selectedAdapter2 !== null && selectedAdapter2.available ? selectedAdapter2 : null);
    const adapterFallbackTaken2 = selectedAdapter2 !== null && actualAdapter2 !== null && selectedAdapter2.adapter_id !== actualAdapter2.adapter_id;
    const adapterFallbackReason2 = actualAdapter2?.available === false ? actualAdapter2.reason : adapterFallbackTaken2 ? `Selected adapter "${selectedAdapter2?.adapter_id ?? "unknown"}" changed to "${actualAdapter2?.adapter_id ?? "unknown"}".` : null;
    return {
      task_index: i,
      selected_provider_class: d.selected_provider.id,
      execution_path: taskExecutionPath,
      fallback_taken: taskFallbackTaken,
      decomposition_recommended: d.decomposition_recommended,
      route_mode: d.route_mode,
      selected_target_id: targetResolution2.preferred_target?.id ?? null,
      actual_target_id: targetResolution2.actual_target?.id ?? null,
      selected_adapter_id: selectedAdapter2?.adapter_id ?? null,
      actual_adapter_id: actualAdapter2?.available ? actualAdapter2.adapter_id : null,
      adapter_id: actualAdapter2?.available ? actualAdapter2.adapter_id : null,
      selected_execution_path: selectedAdapter2?.execution_path ?? null,
      actual_execution_path: actualAdapter2?.available ? actualAdapter2.execution_path : null,
      adapter_fallback_taken: adapterFallbackTaken2,
      adapter_fallback_reason: adapterFallbackReason2,
      adapter_resolution_note: actualAdapter2?.note ?? selectedAdapter2?.note ?? null,
      target_fallback_taken: targetResolution2.fallback_taken,
      target_readiness_state: targetResolution2.readiness_state,
      target_readiness_detail: targetResolution2.readiness_detail,
      fallback_cause: taskFallbackTaken ? "readiness" : "none"
    };
  });
  const dominantClass = dominantProviderClass(decisions);
  const anyFallback = perTaskBindings.some((t) => t.fallback_taken);
  let runLevelOriginallyTargeted = null;
  if (anyFallback) {
    const firstFallbackTask = perTaskBindings.find((t) => t.fallback_taken);
    if (firstFallbackTask) {
      const firstFallbackDecision = decisions[firstFallbackTask.task_index] ?? decisions[0];
      runLevelOriginallyTargeted = resolveOriginallyTargeted(firstFallbackDecision, preference);
    }
  }
  const forceLocalViolated = preference === "force_local" && perTaskBindings.some(
    (t) => t.fallback_taken && t.selected_provider_class !== "local_ollama"
  );
  const runExecutionPath = resolveExecutionPath(
    dominantClass,
    anyFallback,
    runLevelOriginallyTargeted,
    preference
  );
  const anyDecomposition = decisions.some((d) => d.decomposition_recommended);
  const decompositionNote = anyDecomposition ? "One or more tasks appear broad for local execution. Consider splitting/refining before running locally." : null;
  const cloudConfirmationRequired = decisions.some(
    (d) => d.cloud_confirmation_required
  );
  const policyEffectsSet = /* @__PURE__ */ new Set();
  for (const d of decisions) {
    for (const e of d.policy_effects) {
      policyEffectsSet.add(e);
    }
  }
  const aggregatedPolicyEffects = Array.from(policyEffectsSet);
  let blockedByPolicy = false;
  let policyBlockReason = null;
  if (policy) {
    const cloudSelected = dominantClass === "cloud_premium";
    if (cloudSelected && (policy.local_only || !policy.cloud_allowed)) {
      blockedByPolicy = true;
      policyBlockReason = policy.local_only ? "Local-only mode is active \u2014 cloud execution is not permitted by policy." : "Cloud execution is disabled by policy (cloud_allowed=false).";
    } else if (anyFallback && runLevelOriginallyTargeted !== null && runLevelOriginallyTargeted !== "cloud_premium" && cloudSelected && !policy.allow_fallback_to_cloud) {
      blockedByPolicy = true;
      policyBlockReason = "Cloud fallback is disabled by policy (allow_fallback_to_cloud=false). Local provider is unavailable and cloud escalation is not permitted.";
    }
  }
  const warnings = [];
  if (forceLocalViolated) {
    warnings.push(
      "Force local was selected, but no local provider (Ollama) is available. The run cannot proceed on a local path. Start Ollama locally, or switch to a different execution preference."
    );
  } else if (blockedByPolicy && policyBlockReason) {
    warnings.push(`Blocked by routing policy: ${policyBlockReason}`);
  } else if (anyFallback && preference === "prefer_local") {
    const reason = "Local model (Ollama) is unavailable; routing fell back to cloud.";
    warnings.push(reason);
  } else if (anyFallback) {
    warnings.push(
      `Intended provider is unavailable; routing fell back to ${dominantClass}.`
    );
  }
  if (cloudConfirmationRequired) {
    warnings.push(
      "Cloud execution is selected and requires confirmation per routing policy (require_cloud_confirmation=true). Confirm before proceeding."
    );
  }
  if (anyDecomposition) {
    warnings.push(
      "One or more tasks are flagged as decomposition candidates. Consider splitting broad tasks before executing locally."
    );
  }
  for (const d of decisions) {
    for (const w of d.warnings) {
      if (!warnings.includes(w)) {
        warnings.push(w);
      }
    }
  }
  let fallbackReason = null;
  if (forceLocalViolated) {
    fallbackReason = "force_local preference active but local_ollama is not available";
  } else if (blockedByPolicy) {
    fallbackReason = policyBlockReason;
  } else if (anyFallback && runLevelOriginallyTargeted === "local_ollama") {
    fallbackReason = "Local model (Ollama) not available";
  } else if (anyFallback && runLevelOriginallyTargeted !== null) {
    fallbackReason = `Provider '${runLevelOriginallyTargeted}' not available`;
  }
  const dominantRouteMode = decisions[0]?.route_mode ?? "unbound";
  const dominantTaskIndex = decisions.findIndex(
    (decision) => decision.selected_provider.id === dominantClass
  );
  const targetResolution = decisions.length > 0 ? resolveProviderTarget(dominantClass, {
    policy,
    task_profile: dominantTaskIndex >= 0 ? options.task_profiles?.[dominantTaskIndex] : options.task_profiles?.[0],
    task_meta: dominantTaskIndex >= 0 ? options.task_metas?.[dominantTaskIndex] : options.task_metas?.[0],
    provider_registry: decisions.map((decision) => decision.selected_provider),
    readiness: options.readiness
  }) : null;
  const selectedAdapter = resolveExecutionAdapter({
    target: targetResolution?.preferred_target ?? null,
    readiness_state: targetResolution?.preferred_target?.readiness_state,
    policy
  });
  const actualAdapterCandidate = resolveExecutionAdapter({
    target: targetResolution?.actual_target ?? null,
    readiness_state: targetResolution?.readiness_state,
    policy
  });
  const actualAdapter = actualAdapterCandidate ?? (targetResolution?.actual_target === null && selectedAdapter !== null && selectedAdapter.available ? selectedAdapter : null);
  const adapterFallbackTaken = selectedAdapter !== null && actualAdapter !== null && selectedAdapter.adapter_id !== actualAdapter.adapter_id;
  const adapterTargetResolved = targetResolution?.actual_target != null || targetResolution?.preferred_target != null && selectedAdapter?.available === false;
  const adapterBlocked = adapterTargetResolved && (actualAdapter === null || actualAdapter.available === false);
  const adapterFallbackReason = adapterBlocked ? actualAdapter?.reason ?? "No runnable execution adapter path exists." : adapterFallbackTaken ? `Selected adapter "${selectedAdapter?.adapter_id ?? "unknown"}" changed to "${actualAdapter?.adapter_id ?? "unknown"}".` : null;
  if (targetResolution) {
    for (const warning of targetResolution.warnings) {
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    }
  }
  if (adapterFallbackReason && !warnings.includes(adapterFallbackReason)) {
    warnings.push(adapterFallbackReason);
  }
  const bindingSummary = buildBindingSummary(
    dominantClass,
    adapterBlocked ? "unavailable_stopped" : runExecutionPath,
    preference,
    anyFallback,
    runLevelOriginallyTargeted,
    targetResolution?.actual_target?.id ?? null,
    actualAdapter?.available ? actualAdapter.adapter_id : null,
    actualAdapter?.available ? actualAdapter.execution_path : null,
    targetResolution?.fallback_taken ?? false,
    adapterFallbackTaken,
    anyDecomposition,
    blockedByPolicy,
    cloudConfirmationRequired,
    targetResolution?.readiness_state ?? "unknown"
  );
  const targetFallbackCause = targetResolution?.fallback_taken ? targetResolution.preferred_target?.readiness_state === "blocked_by_policy" ? "policy" : targetResolution.preferred_target?.readiness_state === "unavailable" && targetResolution.preferred_target.configured ? "readiness" : "config" : "none";
  const fallbackCause = blockedByPolicy ? "policy" : anyFallback ? "readiness" : targetFallbackCause !== "none" ? targetFallbackCause : "none";
  return {
    selected_provider_class: dominantClass,
    execution_path: adapterBlocked ? "unavailable_stopped" : runExecutionPath,
    preference_applied: preference,
    fallback_taken: anyFallback,
    originally_targeted_class: runLevelOriginallyTargeted,
    fallback_reason: fallbackReason,
    force_local_violated: forceLocalViolated,
    warnings,
    decomposition_recommended: anyDecomposition,
    decomposition_note: decompositionNote,
    route_mode: dominantRouteMode,
    binding_summary: bindingSummary,
    per_task_bindings: perTaskBindings,
    cloud_confirmation_required: cloudConfirmationRequired,
    blocked_by_policy: blockedByPolicy,
    policy_block_reason: policyBlockReason,
    policy_effects: aggregatedPolicyEffects,
    selected_target_id: targetResolution?.preferred_target?.id ?? null,
    actual_target_id: targetResolution?.actual_target?.id ?? null,
    selected_adapter_id: selectedAdapter?.adapter_id ?? null,
    actual_adapter_id: actualAdapter?.available ? actualAdapter.adapter_id : null,
    adapter_id: actualAdapter?.available ? actualAdapter.adapter_id : null,
    selected_execution_path: selectedAdapter?.execution_path ?? null,
    actual_execution_path: actualAdapter?.available ? actualAdapter.execution_path : null,
    adapter_fallback_taken: adapterFallbackTaken,
    adapter_fallback_reason: adapterFallbackReason,
    adapter_resolution_note: actualAdapter?.note ?? selectedAdapter?.note ?? null,
    target_fallback_taken: targetResolution?.fallback_taken ?? false,
    target_fallback_reason: targetResolution?.fallback_taken && targetResolution.actual_target ? `Preferred target is ${targetResolution.preferred_target?.readiness_state ?? "unavailable"}; using ${targetResolution.actual_target.id}.` : null,
    target_resolution: targetResolution,
    target_readiness_state: targetResolution?.readiness_state ?? "unknown",
    target_readiness_detail: targetResolution?.readiness_detail ?? null,
    fallback_cause: fallbackCause,
    target_fallback_cause: targetFallbackCause
  };
}
function buildExecutionBindingEnv(binding) {
  return {
    DEVORY_PROVIDER_CLASS: binding.selected_provider_class,
    DEVORY_EXECUTION_PATH: binding.execution_path,
    DEVORY_ROUTE_MODE: binding.route_mode,
    DEVORY_PREFERENCE_APPLIED: binding.preference_applied,
    DEVORY_FALLBACK_TAKEN: binding.fallback_taken ? "true" : "false",
    DEVORY_ORIGINALLY_TARGETED: binding.originally_targeted_class ?? "",
    DEVORY_DECOMPOSITION_FLAG: binding.decomposition_recommended ? "true" : "false",
    DEVORY_FORCE_LOCAL_VIOLATED: binding.force_local_violated ? "true" : "false",
    DEVORY_CLOUD_CONFIRMATION_REQUIRED: binding.cloud_confirmation_required ? "true" : "false",
    DEVORY_BLOCKED_BY_POLICY: binding.blocked_by_policy ? "true" : "false",
    DEVORY_SELECTED_TARGET_ID: binding.selected_target_id ?? "",
    DEVORY_ACTUAL_TARGET_ID: binding.actual_target_id ?? "",
    DEVORY_SELECTED_ADAPTER_ID: binding.selected_adapter_id ?? "",
    DEVORY_ACTUAL_ADAPTER_ID: binding.actual_adapter_id ?? "",
    DEVORY_TARGET_ADAPTER: binding.adapter_id ?? "",
    DEVORY_SELECTED_EXECUTION_PATH: binding.selected_execution_path ?? "",
    DEVORY_ACTUAL_EXECUTION_PATH: binding.actual_execution_path ?? "",
    DEVORY_ADAPTER_INVOCATION_MODE: binding.actual_execution_path === "packaged_runner:dry-run" ? "dry-run" : binding.actual_execution_path === "packaged_runner:ollama" ? "ollama" : binding.actual_execution_path === "packaged_runner:claude" ? "claude" : binding.actual_execution_path === "packaged_runner:openai" ? "openai" : "",
    DEVORY_ADAPTER_FALLBACK_TAKEN: binding.adapter_fallback_taken ? "true" : "false",
    DEVORY_ADAPTER_FALLBACK_REASON: binding.adapter_fallback_reason ?? "",
    DEVORY_ADAPTER_RESOLUTION_NOTE: binding.adapter_resolution_note ?? "",
    DEVORY_TARGET_FALLBACK_TAKEN: binding.target_fallback_taken ? "true" : "false",
    DEVORY_TARGET_READINESS_STATE: binding.target_readiness_state,
    DEVORY_TARGET_READINESS_DETAIL: binding.target_readiness_detail ?? "",
    DEVORY_FALLBACK_CAUSE: binding.fallback_cause,
    DEVORY_TARGET_FALLBACK_CAUSE: binding.target_fallback_cause
  };
}
function formatBindingRecord(binding) {
  const pathLabel = {
    cloud_api: "cloud API",
    local_ollama: "local Ollama",
    deterministic: "deterministic (no model)",
    unavailable_fallback: "fallback (intended provider unavailable)",
    unavailable_stopped: "STOPPED \u2014 force_local violated"
  };
  const parts = [
    `selected=${binding.selected_provider_class}`,
    `path=${pathLabel[binding.execution_path]}`,
    `preference=${binding.preference_applied}`
  ];
  if (binding.actual_target_id) {
    parts.push(`target=${binding.actual_target_id}`);
  }
  if (binding.actual_adapter_id) {
    parts.push(`adapter=${binding.actual_adapter_id}`);
  }
  if (binding.actual_execution_path) {
    parts.push(`lane=${binding.actual_execution_path}`);
  }
  parts.push(`target_readiness=${binding.target_readiness_state}`);
  if (binding.fallback_taken && binding.originally_targeted_class) {
    parts.push(`fallback_from=${binding.originally_targeted_class}`);
    if (binding.fallback_reason) {
      parts.push(`reason="${binding.fallback_reason}"`);
    }
  } else {
    parts.push("no-fallback");
  }
  if (binding.target_fallback_taken && binding.selected_target_id) {
    parts.push(`preferred_target=${binding.selected_target_id}`);
    parts.push(`target_fallback_cause=${binding.target_fallback_cause}`);
  }
  if (binding.adapter_fallback_taken) {
    parts.push("adapter_fallback=true");
  }
  if (binding.adapter_fallback_reason) {
    parts.push(`adapter_reason="${binding.adapter_fallback_reason}"`);
  }
  if (binding.decomposition_recommended) {
    parts.push("decomposition=recommended");
  }
  return `Routing record: ${parts.join(" \xB7 ")}`;
}
var init_execution_binding = __esm({
  "../core/src/execution-binding.ts"() {
    "use strict";
    init_execution_adapter_resolution();
    init_provider_target_resolver();
  }
});

// ../core/src/index.ts
var init_src = __esm({
  "../core/src/index.ts"() {
    "use strict";
    init_parse();
    init_dry_run_estimate();
    init_external_work_item();
    init_engineering_profile();
    init_profile_presets();
    init_active_state();
    init_workspace();
    init_sync_manifest();
    init_work_context();
    init_target_readiness();
    init_license();
    init_standards();
    init_skill_validator();
    init_factory_environment();
    init_local_run_control();
    init_execution_adapter_resolution();
    init_run_ledger();
    init_execution_policy();
    init_task_draft();
    init_task_markdown_renderer();
    init_task_validation();
    init_planning_draft();
    init_unattended_execution();
    init_unattended_checkpoint();
    init_review_control();
    init_unattended_stall_policy();
    init_routing_input();
    init_routing_decision();
    init_routing_evaluation();
    init_human_question();
    init_human_question_artifact();
    init_human_question_event();
    init_human_interruption_policy();
    init_slack_notification();
    init_feature_flags();
    init_governance_repo();
    init_command_channel();
    init_command_transport();
    init_task_profiler();
    init_provider_registry();
    init_provider_target_resolver();
    init_execution_router();
    init_execution_binding();
    init_routing_policy();
  }
});

// src/lib/task-reader.ts
var task_reader_exports = {};
__export(task_reader_exports, {
  LIFECYCLE_STAGES: () => LIFECYCLE_STAGES,
  findTaskByFile: () => findTaskByFile,
  findTaskById: () => findTaskById,
  findTaskFile: () => findTaskFile,
  listAllTasks: () => listAllTasks,
  listTasksInStage: () => listTasksInStage
});
function listTasksInStage(tasksDir, stage) {
  const dir = path12.join(tasksDir, stage);
  if (!fs7.existsSync(dir))
    return [];
  return fs7.readdirSync(dir).filter((f) => f.endsWith(".md")).map((filename) => {
    const filepath = path12.join(dir, filename);
    const content = fs7.readFileSync(filepath, "utf-8");
    const stats = fs7.statSync(filepath);
    const { meta } = parseFrontmatter(content);
    return {
      id: String(meta.id ?? filename.replace(".md", "")),
      title: String(meta.title ?? "(untitled)"),
      project: String(meta.project ?? ""),
      status: String(meta.status ?? stage),
      priority: String(meta.priority ?? ""),
      filename,
      filepath,
      stage,
      bundle_id: typeof meta.bundle_id === "string" ? meta.bundle_id : void 0,
      modifiedAt: stats.mtimeMs
    };
  }).sort(
    (a, b) => stage === "done" ? b.modifiedAt - a.modifiedAt || b.id.localeCompare(a.id) : a.id.localeCompare(b.id)
  );
}
function listAllTasks(tasksDir) {
  const result = {};
  for (const stage of LIFECYCLE_STAGES) {
    result[stage] = listTasksInStage(tasksDir, stage);
  }
  return result;
}
function findTaskById(tasksDir, id) {
  for (const stage of LIFECYCLE_STAGES) {
    const dir = path12.join(tasksDir, stage);
    if (!fs7.existsSync(dir))
      continue;
    for (const filename of fs7.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const filepath = path12.join(dir, filename);
      const content = fs7.readFileSync(filepath, "utf-8");
      const stats = fs7.statSync(filepath);
      const { meta, body } = parseFrontmatter(content);
      const effectiveId = String(meta.id ?? filename.replace(".md", ""));
      if (effectiveId === id) {
        return {
          id: effectiveId,
          title: String(meta.title ?? "(untitled)"),
          project: String(meta.project ?? ""),
          status: String(meta.status ?? stage),
          priority: String(meta.priority ?? ""),
          filename,
          filepath,
          stage,
          modifiedAt: stats.mtimeMs,
          meta,
          body
        };
      }
    }
  }
  return null;
}
function findTaskFile(tasksDir, id) {
  return findTaskById(tasksDir, id)?.filepath ?? null;
}
function findTaskByFile(tasksDir, filepath) {
  const normalized = path12.resolve(filepath);
  for (const stage of LIFECYCLE_STAGES) {
    const task = listTasksInStage(tasksDir, stage).find(
      (entry) => path12.resolve(entry.filepath) === normalized
    );
    if (task)
      return task;
  }
  return null;
}
var fs7, path12, LIFECYCLE_STAGES;
var init_task_reader = __esm({
  "src/lib/task-reader.ts"() {
    "use strict";
    fs7 = __toESM(require("fs"));
    path12 = __toESM(require("path"));
    init_src();
    LIFECYCLE_STAGES = [
      "backlog",
      "ready",
      "doing",
      "review",
      "blocked",
      "done",
      "archived"
    ];
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode34 = __toESM(require("vscode"));

// src/config.ts
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
var CONFIG_KEY = "devory.factoryRoot";
function getFactoryRoot() {
  const cfg = vscode.workspace.getConfiguration().get(CONFIG_KEY, "").trim();
  if (cfg)
    return cfg;
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return "";
}
function getFactoryPaths(factoryRoot) {
  return {
    tasksDir: path.join(factoryRoot, "tasks"),
    runsDir: path.join(factoryRoot, "runs"),
    artifactsDir: path.join(factoryRoot, "artifacts")
  };
}
function getExtensionRuntimeRoot(extensionPath) {
  return path.join(extensionPath, "runtime");
}

// src/providers/task-tree.ts
var vscode2 = __toESM(require("vscode"));
init_task_reader();
var StageItem = class extends vscode2.TreeItem {
  constructor(stage, count) {
    const isEmptyBacklog = stage === "backlog" && count === 0;
    super(
      `${stage}  (${count})`,
      count > 0 ? vscode2.TreeItemCollapsibleState.Collapsed : isEmptyBacklog ? vscode2.TreeItemCollapsibleState.Expanded : vscode2.TreeItemCollapsibleState.None
    );
    this.stage = stage;
    this.count = count;
    this.contextValue = `stage.${stage}`;
    this.iconPath = new vscode2.ThemeIcon(stage === "archived" ? "archive" : "folder");
  }
};
var PlaceholderItem = class extends vscode2.TreeItem {
  constructor(label, commandId) {
    super(label, vscode2.TreeItemCollapsibleState.None);
    this.contextValue = "placeholder";
    this.iconPath = new vscode2.ThemeIcon("add");
    this.command = {
      command: commandId,
      title: label
    };
  }
};
var TaskItem = class extends vscode2.TreeItem {
  constructor(task) {
    super(
      `${task.id}  ${task.title}`,
      vscode2.TreeItemCollapsibleState.None
    );
    this.task = task;
    this.contextValue = `task.${task.stage}`;
    this.tooltip = `${task.title}
Project: ${task.project}
Status: ${task.status}
Priority: ${task.priority}`;
    this.description = task.priority || void 0;
    this.iconPath = new vscode2.ThemeIcon("file");
    this.command = {
      command: "vscode.open",
      title: "Open Task",
      arguments: [vscode2.Uri.file(task.filepath)]
    };
  }
};
var TaskTreeProvider = class {
  constructor(tasksDir) {
    this.tasksDir = tasksDir;
  }
  _onDidChangeTreeData = new vscode2.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  /** Update the tasks directory (e.g. when settings change) and refresh. */
  setTasksDir(tasksDir) {
    this.tasksDir = tasksDir;
    this.refresh();
  }
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!this.tasksDir) {
      return Promise.resolve([]);
    }
    if (!element) {
      return Promise.resolve(
        LIFECYCLE_STAGES.map((stage) => {
          const tasks = listTasksInStage(this.tasksDir, stage);
          return new StageItem(stage, tasks.length);
        })
      );
    }
    if (element instanceof StageItem) {
      const tasks = listTasksInStage(this.tasksDir, element.stage);
      if (tasks.length === 0 && element.stage === "backlog") {
        return Promise.resolve([new PlaceholderItem("Create Task \u2192", "devory.taskCreate")]);
      }
      return Promise.resolve(tasks.map((t) => new TaskItem(t)));
    }
    return Promise.resolve([]);
  }
};

// src/providers/factory-tree.ts
var vscode3 = __toESM(require("vscode"));
var fs8 = __toESM(require("fs"));
var path13 = __toESM(require("path"));
var GroupItem = class extends vscode3.TreeItem {
  constructor(groupId, label, count) {
    super(
      `${label}  (${count})`,
      count > 0 ? vscode3.TreeItemCollapsibleState.Expanded : vscode3.TreeItemCollapsibleState.Collapsed
    );
    this.groupId = groupId;
    this.contextValue = `devoryGroup.${groupId}`;
    this.iconPath = new vscode3.ThemeIcon(
      groupId === "doctrine" ? "law" : groupId === "agents" ? "robot" : "library"
    );
  }
};
var PlaceholderItem2 = class extends vscode3.TreeItem {
  constructor(label, commandId) {
    super(label, vscode3.TreeItemCollapsibleState.None);
    this.contextValue = "placeholder";
    this.iconPath = new vscode3.ThemeIcon("add", new vscode3.ThemeColor("descriptionForeground"));
    this.command = {
      command: commandId,
      title: label
    };
  }
};
var DoctrineFileItem = class extends vscode3.TreeItem {
  constructor(filePath, filename) {
    super(filename, vscode3.TreeItemCollapsibleState.None);
    this.filePath = filePath;
    this.contextValue = "devoryDoctrineFile";
    this.tooltip = filePath;
    this.iconPath = new vscode3.ThemeIcon("book");
    this.command = {
      command: "vscode.open",
      title: "Open Doctrine File",
      arguments: [vscode3.Uri.file(filePath)]
    };
  }
};
var SkillItem = class extends vscode3.TreeItem {
  constructor(skillMdPath, skillName) {
    super(skillName, vscode3.TreeItemCollapsibleState.None);
    this.skillMdPath = skillMdPath;
    this.contextValue = "devorySkill";
    this.tooltip = skillMdPath;
    this.iconPath = new vscode3.ThemeIcon("circuit-board");
    this.command = {
      command: "vscode.open",
      title: "Open Skill",
      arguments: [vscode3.Uri.file(skillMdPath)]
    };
  }
};
var AgentItem = class extends vscode3.TreeItem {
  constructor(filePath, agentName) {
    super(agentName, vscode3.TreeItemCollapsibleState.None);
    this.filePath = filePath;
    this.contextValue = "devoryAgent";
    this.tooltip = filePath;
    this.iconPath = new vscode3.ThemeIcon("robot");
    this.command = {
      command: "vscode.open",
      title: "Open Agent",
      arguments: [vscode3.Uri.file(filePath)]
    };
  }
};
var FactoryTreeProvider = class {
  constructor(factoryRoot) {
    this.factoryRoot = factoryRoot;
  }
  _onDidChangeTreeData = new vscode3.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  setFactoryRoot(factoryRoot) {
    this.factoryRoot = factoryRoot;
    this.refresh();
  }
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!this.factoryRoot)
      return Promise.resolve([]);
    if (!element) {
      return Promise.resolve([
        new GroupItem("doctrine", "Doctrine", this.listDoctrineFiles().length),
        new GroupItem("skills", "Skills", this.listSkills().length),
        new GroupItem("agents", "Agents", this.listAgents().length)
      ]);
    }
    if (element instanceof GroupItem) {
      if (element.groupId === "doctrine") {
        const files = this.listDoctrineFiles();
        if (files.length === 0) {
          return Promise.resolve([new PlaceholderItem2("Initialize defaults \u2192", "devory.initWorkspace")]);
        }
        return Promise.resolve(files.map((f) => new DoctrineFileItem(f, path13.basename(f))));
      }
      if (element.groupId === "skills") {
        const skills = this.listSkills();
        if (skills.length === 0) {
          return Promise.resolve([new PlaceholderItem2("Initialize defaults \u2192", "devory.initWorkspace")]);
        }
        return Promise.resolve(skills.map(({ name, mdPath }) => new SkillItem(mdPath, name)));
      }
      if (element.groupId === "agents") {
        const agents = this.listAgents();
        if (agents.length === 0) {
          return Promise.resolve([new PlaceholderItem2("Create agent \u2192", "devory.agentCreate")]);
        }
        return Promise.resolve(
          agents.map(({ name, filePath }) => new AgentItem(filePath, name))
        );
      }
    }
    return Promise.resolve([]);
  }
  listDoctrineFiles() {
    const doctrineDir = path13.join(this.factoryRoot, "doctrine");
    if (!fs8.existsSync(doctrineDir))
      return [];
    try {
      return fs8.readdirSync(doctrineDir).filter((f) => f.endsWith(".md") && !fs8.statSync(path13.join(doctrineDir, f)).isDirectory()).sort().map((f) => path13.join(doctrineDir, f));
    } catch {
      return [];
    }
  }
  listAgents() {
    const agentsDir = path13.join(this.factoryRoot, "agents");
    if (!fs8.existsSync(agentsDir))
      return [];
    try {
      return fs8.readdirSync(agentsDir).filter((f) => {
        if (!f.endsWith(".md"))
          return false;
        const fullPath = path13.join(agentsDir, f);
        return fs8.statSync(fullPath).isFile();
      }).sort().map((f) => ({
        name: f.replace(/\.md$/, ""),
        filePath: path13.join(agentsDir, f)
      }));
    } catch {
      return [];
    }
  }
  listSkills() {
    const skillsDir = path13.join(this.factoryRoot, "skills");
    if (!fs8.existsSync(skillsDir))
      return [];
    try {
      return fs8.readdirSync(skillsDir).filter((entry) => {
        const skillMd = path13.join(skillsDir, entry, "SKILL.md");
        return fs8.existsSync(skillMd);
      }).sort().map((entry) => ({
        name: entry,
        mdPath: path13.join(skillsDir, entry, "SKILL.md")
      }));
    } catch {
      return [];
    }
  }
};

// src/providers/task-assistant.ts
var fs9 = __toESM(require("fs"));
var vscode4 = __toESM(require("vscode"));
init_src();
var TaskAssistantProvider = class {
  static viewId = "devoryTaskAssistant";
  _view;
  _currentTask = null;
  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._buildHtml();
    webviewView.webview.onDidReceiveMessage((msg) => {
      this._handleMessage(msg);
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._render();
      }
    });
  }
  /** Called from extension.ts when a task is selected or opened. */
  setTask(task) {
    this._currentTask = task;
    this._render();
  }
  // ── Private helpers ────────────────────────────────────────────────────────
  _render() {
    if (this._view?.visible) {
      this._view.webview.html = this._buildHtml();
    }
  }
  _handleMessage(msg) {
    if (msg.type === "invokeCommand") {
      void vscode4.commands.executeCommand(msg.command);
    } else if (msg.type === "submitQuery") {
      void this._view?.webview.postMessage({
        type: "queryResponse",
        text: "Task-aware assistant responses are not wired yet. Use the action buttons above to work with this task directly."
      });
    }
  }
  _buildHtml() {
    if (!this._currentTask) {
      return buildEmptyStateHtml();
    }
    const extras = readTaskExtras(this._currentTask.filepath);
    return buildTaskHtml(this._currentTask, extras);
  }
};
function readTaskExtras(filepath) {
  try {
    const content = fs9.readFileSync(filepath, "utf-8");
    const { meta, body } = parseFrontmatter(content);
    const preferredModels = asStringArray3(meta.preferred_models);
    const dryRunEstimate = estimateDryRunForTask(
      { meta, body },
      {
        selected_model_id: preferredModels[0] ?? null
      }
    );
    const goalMatch = body.match(/^##\s+Goal\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/m);
    const sections = parseH2Sections(body);
    const acceptanceCriteria = extractListItems(
      sections["acceptance criteria"] ?? ""
    );
    const verification = dedupe([
      ...extractListItems(
        sections.verification ?? sections["verification steps"] ?? sections["verification commands"] ?? ""
      ),
      ...asStringArray3(meta.verification)
    ]);
    const dependencies = dedupe([
      ...extractListItems(sections.dependencies ?? ""),
      ...asStringArray3(meta.depends_on)
    ]);
    const filesLikelyAffected = dedupe([
      ...extractListItems(
        sections["files likely affected"] ?? sections["expected file changes"] ?? ""
      ),
      ...asStringArray3(meta.files_likely_affected)
    ]);
    const metadataRows = buildMetadataRows(meta);
    return {
      agent: meta.agent ?? null,
      goal: goalMatch ? goalMatch[1].trim().slice(0, 280) : null,
      acceptanceCriteria,
      verification,
      dependencies,
      filesLikelyAffected,
      metadataRows,
      rawFrontmatter: extractFrontmatterBlock(content),
      rawTaskBody: body,
      dryRunEstimate
    };
  } catch {
    return {
      agent: null,
      goal: null,
      acceptanceCriteria: [],
      verification: [],
      dependencies: [],
      filesLikelyAffected: [],
      metadataRows: [],
      rawFrontmatter: null,
      rawTaskBody: "",
      dryRunEstimate: estimateDryRunForTask({})
    };
  }
}
function asStringArray3(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}
function dedupe(values) {
  return Array.from(new Set(values));
}
function extractListItems(content) {
  return content.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- ") || line.startsWith("* ")).map((line) => line.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
}
function parseH2Sections(body) {
  const sections = {};
  let current = null;
  for (const line of body.split("\n")) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      current = headingMatch[1].trim().toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }
  return Object.fromEntries(
    Object.entries(sections).map(([heading, lines]) => [heading, lines.join("\n").trim()])
  );
}
function extractFrontmatterBlock(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  return match ? match[1].trim() : null;
}
function buildMetadataRows(meta) {
  const fields = [
    { label: "id", value: meta.id },
    { label: "title", value: meta.title },
    { label: "project", value: meta.project },
    { label: "status", value: meta.status },
    { label: "priority", value: meta.priority },
    { label: "agent", value: meta.agent },
    { label: "repo", value: meta.repo },
    { label: "branch", value: meta.branch },
    { label: "type", value: meta.type },
    { label: "depends_on", value: meta.depends_on },
    { label: "files_likely_affected", value: meta.files_likely_affected },
    { label: "verification", value: meta.verification }
  ];
  return fields.filter((field) => field.value !== void 0 && field.value !== null && field.value !== "").map((field) => ({
    label: field.label,
    value: Array.isArray(field.value) ? field.value.join(", ") : String(field.value)
  }));
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var BASE_STYLES = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: transparent;
      padding: 12px 14px;
      margin: 0;
    }
    .header {
      font-size: 0.75em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .task-card {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .task-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .task-title {
      font-size: 1em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .task-meta {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
    }
    .meta-row { display: flex; gap: 6px; }
    .meta-label { min-width: 52px; opacity: 0.7; }
    .status-badge {
      display: inline-block;
      font-size: 0.75em;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background, rgba(255,255,255,0.12));
      color: var(--vscode-badge-foreground, var(--vscode-editor-foreground));
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .goal-excerpt {
      margin-top: 8px;
      font-size: 0.82em;
      color: var(--vscode-editor-foreground);
      opacity: 0.8;
      line-height: 1.5;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      padding-top: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .section-label {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 7px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 14px;
    }
    .action-row {
      display: flex;
      gap: 5px;
    }
    button {
      flex: 1;
      padding: 5px 8px;
      font-size: 0.82em;
      font-family: var(--vscode-font-family);
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      text-align: center;
      line-height: 1.3;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-color: var(--vscode-widget-border, rgba(255,255,255,0.15));
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.18));
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      margin: 12px 0;
    }
    .input-area { margin-bottom: 10px; }
    textarea {
      width: 100%;
      min-height: 64px;
      resize: vertical;
      padding: 7px 9px;
      font-size: 0.82em;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.15));
      border-radius: 3px;
      outline: none;
      line-height: 1.4;
    }
    textarea:focus {
      border-color: var(--vscode-focusBorder, var(--vscode-button-background));
    }
    .response-area {
      margin-top: 8px;
      padding: 8px 10px;
      font-size: 0.82em;
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.04));
      border-left: 3px solid var(--vscode-widget-border, rgba(255,255,255,0.2));
      border-radius: 0 3px 3px 0;
      min-height: 36px;
      display: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      padding: 20px 4px;
      text-align: center;
    }
    .empty-title {
      font-size: 0.95em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      margin-bottom: 10px;
    }
    .empty-body {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .empty-actions {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    .gov-root {
      margin-bottom: 14px;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      padding: 8px 10px;
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.02));
    }
    .gov-root summary {
      cursor: pointer;
      font-weight: 600;
      font-size: 0.83em;
    }
    .gov-inner {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .gov-section {
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 3px;
      padding: 6px 8px;
      background: var(--vscode-input-background, rgba(255,255,255,0.02));
    }
    .gov-section summary {
      cursor: pointer;
      font-size: 0.81em;
      font-weight: 600;
    }
    .gov-list {
      margin: 7px 0 0;
      padding-left: 16px;
      font-size: 0.81em;
      line-height: 1.6;
    }
    .gov-empty {
      margin-top: 7px;
      font-size: 0.81em;
      color: var(--vscode-descriptionForeground);
    }
    .gov-meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 7px;
      font-size: 0.8em;
    }
    .gov-meta-table td {
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      padding: 4px 0;
      vertical-align: top;
    }
    .gov-meta-table td:first-child {
      color: var(--vscode-descriptionForeground);
      width: 38%;
      padding-right: 8px;
    }
    .gov-raw {
      margin-top: 6px;
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }
    .gov-raw pre {
      margin: 6px 0 0;
      padding: 8px;
      border-radius: 3px;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      background: var(--vscode-input-background, rgba(255,255,255,0.02));
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
    }
  </style>
`;
function buildEmptyStateHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  ${BASE_STYLES}
</head>
<body>
  <div class="header">Devory Assistant</div>
  <div class="empty-state">
    <div class="empty-title">No task selected</div>
    <div class="empty-body">
      Open or create a task to use Devory Assistant.<br><br>
      This panel works from the current task, agent, and doctrine context \u2014 not as a general-purpose chat.
    </div>
    <div class="empty-actions">
      <button class="btn-primary" onclick="cmd('devory.taskCreate')">Create Task</button>
      <button class="btn-secondary" onclick="cmd('devory.taskList')">Open Task List</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(command) {
      vscode.postMessage({ type: 'invokeCommand', command });
    }
  </script>
</body>
</html>`;
}
function renderGovernanceSection(title, items, emptyText) {
  const listHtml = items.length === 0 ? `<div class="gov-empty">${esc(emptyText)}</div>` : `<ul class="gov-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
  return `
    <details class="gov-section">
      <summary>${esc(title)}</summary>
      ${listHtml}
    </details>
  `;
}
function renderMetadataSection(extras) {
  const rows = extras.metadataRows.length === 0 ? `<div class="gov-empty">No structured task metadata is available.</div>` : `
        <table class="gov-meta-table">
          <tbody>
            ${extras.metadataRows.map((row) => `<tr><td>${esc(row.label)}</td><td>${esc(row.value)}</td></tr>`).join("")}
          </tbody>
        </table>
      `;
  const rawFrontmatter = extras.rawFrontmatter ? `
      <details class="gov-raw">
        <summary>View raw frontmatter</summary>
        <pre>${esc(extras.rawFrontmatter)}</pre>
      </details>
    ` : "";
  const rawTaskBody = extras.rawTaskBody.trim() ? `
      <details class="gov-raw">
        <summary>View raw task body</summary>
        <pre>${esc(extras.rawTaskBody.trim())}</pre>
      </details>
    ` : "";
  return `
    <details class="gov-section">
      <summary>Task Metadata</summary>
      ${rows}
      ${rawFrontmatter}
      ${rawTaskBody}
    </details>
  `;
}
function renderGovernanceDetails(extras) {
  return `
    <details class="gov-root">
      <summary>Show Governance Details</summary>
      <div class="gov-inner">
        ${renderGovernanceSection(
    "Acceptance Criteria",
    extras.acceptanceCriteria,
    "No acceptance criteria were parsed from this task."
  )}
        ${renderGovernanceSection(
    "Verification",
    extras.verification,
    "No verification steps were found."
  )}
        ${renderGovernanceSection(
    "Dependencies",
    extras.dependencies,
    "No dependencies are declared."
  )}
        ${renderGovernanceSection(
    "Files Likely Affected",
    extras.filesLikelyAffected,
    "No files likely affected are listed."
  )}
        ${renderMetadataSection(extras)}
        <details class="gov-section">
          <summary>Execution Artifacts</summary>
          <div class="gov-empty">
            Linked execution artifacts are not available in this panel yet.
            Start a run, then use Inspect Artifacts or Inspect Recent Runs.
          </div>
        </details>
      </div>
    </details>
  `;
}
function formatUsdRange(min, max) {
  const fmt = (value) => `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
  if (min === max)
    return fmt(min);
  return `${fmt(min)} - ${fmt(max)}`;
}
function renderDryRunEstimate(extras) {
  const estimate = extras.dryRunEstimate;
  const suggestion = estimate.lower_cost_suggestion;
  const isLowConfidence = estimate.confidence === "low";
  const usesFallbackModel = estimate.model_id === null;
  const whyRows = estimate.reasons.slice(0, 3).map((reason) => `<li>${esc(reason)}</li>`).join("");
  const suggestionHtml = suggestion ? `<div class="gov-empty" style="margin-top:6px;"><strong>Lower cost option:</strong> ${esc(suggestion.display_name)} (${esc(suggestion.runner)}) \xB7 ${esc(
    formatUsdRange(suggestion.estimated_cost_usd.min, suggestion.estimated_cost_usd.max)
  )}</div>` : "";
  return `
    <div class="gov-root">
      <div class="section-label" style="margin-bottom:8px;">Dry Run Estimate</div>
      <div class="gov-empty">
        <strong>Estimate only</strong> \u2014 planning visibility, not billing precision.
      </div>
      <table class="gov-meta-table">
        <tbody>
          <tr><td>runner/model</td><td>${esc(estimate.runner)} / ${esc(estimate.model_display_name)}</td></tr>
          <tr><td>context tier</td><td>${esc(estimate.context_tier)}</td></tr>
          <tr><td>output tier</td><td>${esc(estimate.output_tier)}</td></tr>
          <tr><td>cost estimate</td><td>${esc(formatUsdRange(estimate.estimated_cost_usd.min, estimate.estimated_cost_usd.max))}</td></tr>
          <tr><td>confidence</td><td>${esc(estimate.confidence)}</td></tr>
        </tbody>
      </table>
      ${isLowConfidence ? `<div class="gov-empty" style="margin-top:6px;"><strong>Low confidence:</strong> model or task metadata is incomplete.</div>` : ""}
      ${usesFallbackModel ? `<div class="gov-empty" style="margin-top:6px;"><strong>Fallback model pricing:</strong> exact workspace default model was not available.</div>` : ""}
      <details class="gov-section" style="margin-top:8px;">
        <summary>Why this estimate?</summary>
        <ul class="gov-list">${whyRows}</ul>
        <div class="gov-empty">
          Tokens: prompt ${estimate.estimated_input_tokens.min}-${estimate.estimated_input_tokens.max},
          output ${estimate.estimated_output_tokens.min}-${estimate.estimated_output_tokens.max}.
        </div>
      </details>
      ${suggestionHtml}
    </div>
  `;
}
function buildTaskHtml(task, extras) {
  const canEnrich = task.stage !== "done" && task.stage !== "archived";
  const canPromote = task.stage === "backlog" || task.stage === "ready" || task.stage === "doing";
  const canRun = task.stage === "ready";
  const isReview = task.stage === "review";
  const agentRow = extras.agent ? `<div class="meta-row"><span class="meta-label">Agent</span><span>${esc(extras.agent)}</span></div>` : "";
  const goalHtml = extras.goal ? `<div class="goal-excerpt">${esc(extras.goal)}</div>` : "";
  const governanceDetailsHtml = renderGovernanceDetails(extras);
  const dryRunEstimateHtml = renderDryRunEstimate(extras);
  const priorityBadge = task.priority ? ` &nbsp;<span class="status-badge">${esc(task.priority)}</span>` : "";
  const enrichButtons = canEnrich ? `
      <div class="action-row">
        <button class="btn-primary" onclick="cmd('devory.enrichTask')">Enrich Task</button>
        ${canPromote ? `<button class="btn-secondary" onclick="cmd('devory.taskPromote')">Promote Task</button>` : ""}
        ${isReview ? `<button class="btn-primary" onclick="cmd('devory.taskApprove')">Approve</button>` : ""}
      </div>
      <div class="action-row">
        <button class="btn-secondary" onclick="cmd('devory.addAcceptanceCriteria')">+ Acceptance Criteria</button>
        <button class="btn-secondary" onclick="cmd('devory.addVerification')">+ Verification</button>
      </div>
      <div class="action-row">
        <button class="btn-secondary" onclick="cmd('devory.addFilesAffected')">+ Files Affected</button>
        ${canRun ? `<button class="btn-primary" onclick="cmd('devory.runStart')">\u25B6 Run Task</button>` : ""}
      </div>` : `<div class="action-row">
        ${isReview ? `<button class="btn-primary" onclick="cmd('devory.taskApprove')">Approve</button><button class="btn-secondary" onclick="cmd('devory.taskSendBack')">Send Back</button>` : ""}
        ${task.stage === "blocked" || task.stage === "archived" ? `<button class="btn-secondary" onclick="cmd('devory.taskRequeue')">Requeue Task</button>` : ""}
        ${task.stage === "done" ? `<div style="font-size:0.82em;color:var(--vscode-descriptionForeground);padding:4px 0">Task is done.</div>` : ""}
      </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  ${BASE_STYLES}
</head>
<body>
  <div class="header">Devory Assistant</div>

  <div class="task-card">
    <div class="task-id">${esc(task.id)} &nbsp;<span class="status-badge">${esc(task.stage)}</span>${priorityBadge}</div>
    <div class="task-title">${esc(task.title)}</div>
    <div class="task-meta">
      <div class="meta-row"><span class="meta-label">Project</span><span>${esc(task.project || "\u2014")}</span></div>
      ${agentRow}
    </div>
    ${goalHtml}
  </div>

  ${governanceDetailsHtml}
  ${dryRunEstimateHtml}

  <div class="section-label">Task Actions</div>
  <div class="actions">
    ${enrichButtons}
  </div>

  <hr class="divider">

  <div class="section-label">Ask About This Task</div>
  <div class="input-area">
    <textarea id="query-input"
      placeholder="e.g. What approach should I take? Which files are affected? What acceptance criteria make sense?"
    ></textarea>
  </div>
  <div class="action-row">
    <button class="btn-primary" id="ask-btn" onclick="submitQuery()">Ask</button>
  </div>
  <div class="response-area" id="response-area"></div>

  <script>
    const vscode = acquireVsCodeApi();

    function cmd(command) {
      vscode.postMessage({ type: 'invokeCommand', command });
    }

    function submitQuery() {
      const input = document.getElementById('query-input');
      const text = input.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'submitQuery', text });
      document.getElementById('ask-btn').disabled = true;
      document.getElementById('ask-btn').textContent = 'Asking\u2026';
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'queryResponse') {
        const area = document.getElementById('response-area');
        area.style.display = 'block';
        area.textContent = msg.text;
        document.getElementById('ask-btn').disabled = false;
        document.getElementById('ask-btn').textContent = 'Ask';
      }
    });

    // Submit on Ctrl+Enter / Cmd+Enter
    document.getElementById('query-input').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        submitQuery();
      }
    });
  </script>
</body>
</html>`;
}

// src/providers/show-work.ts
var vscode5 = __toESM(require("vscode"));

// src/lib/show-work-reader.ts
var fs10 = __toESM(require("fs"));
var path14 = __toESM(require("path"));
init_src();
init_task_reader();
function readTaskExtras2(filepath) {
  try {
    const content = fs10.readFileSync(filepath, "utf-8");
    const { meta } = parseFrontmatter(content);
    const files = Array.isArray(meta.files_likely_affected) ? meta.files_likely_affected.filter((f) => typeof f === "string").slice(0, 5) : [];
    return {
      agent: typeof meta.agent === "string" ? meta.agent : null,
      filesLikelyAffected: files
    };
  } catch {
    return { agent: null, filesLikelyAffected: [] };
  }
}
function readLatestHeartbeat(artifactsDir) {
  const heartbeatsDir = path14.join(artifactsDir, "heartbeats");
  if (!fs10.existsSync(heartbeatsDir))
    return { record: null, isFresh: false };
  const files = fs10.readdirSync(heartbeatsDir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0)
    return { record: null, isFresh: false };
  try {
    const raw = fs10.readFileSync(path14.join(heartbeatsDir, files[0]), "utf-8");
    const record = JSON.parse(raw);
    const ts = record.last_heartbeat_at ?? record.started_at;
    const ageMs = ts ? Date.now() - new Date(ts).getTime() : Infinity;
    const isFresh = ageMs < 10 * 60 * 1e3;
    return { record, isFresh };
  } catch {
    return { record: null, isFresh: false };
  }
}
function readShowWorkData(tasksDir, artifactsDir) {
  const enrich = (task) => ({
    ...task,
    ...readTaskExtras2(task.filepath)
  });
  const doingTasks = listTasksInStage(tasksDir, "doing").map(enrich);
  const reviewTasks = listTasksInStage(tasksDir, "review").map(enrich);
  const { record: latestHeartbeat, isFresh: isHeartbeatFresh } = readLatestHeartbeat(artifactsDir);
  return { doingTasks, reviewTasks, latestHeartbeat, isHeartbeatFresh };
}
function formatRelativeTime(isoTs) {
  if (!isoTs)
    return "";
  const ageMs = Date.now() - new Date(isoTs).getTime();
  if (ageMs < 6e4)
    return "just now";
  if (ageMs < 36e5)
    return `${Math.floor(ageMs / 6e4)} min ago`;
  if (ageMs < 864e5)
    return `${Math.floor(ageMs / 36e5)} hr ago`;
  return `${Math.floor(ageMs / 864e5)} day(s) ago`;
}

// src/providers/show-work.ts
var REFRESH_INTERVAL_MS = 5e3;
var ShowWorkProvider = class {
  constructor(getTasksDir, getArtifactsDir, getRunState) {
    this.getTasksDir = getTasksDir;
    this.getArtifactsDir = getArtifactsDir;
    this.getRunState = getRunState;
  }
  static viewId = "devoryShowWork";
  _view;
  _refreshInterval;
  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildShellHtml();
    this._sendState();
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "invokeCommand") {
        void vscode5.commands.executeCommand(msg.command);
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendState();
        this._startRefresh();
      } else {
        this._stopRefresh();
      }
    });
    webviewView.onDidDispose(() => {
      this._stopRefresh();
    });
    this._startRefresh();
  }
  /** Call this whenever external state changes (e.g. run started/stopped). */
  refresh() {
    this._sendState();
  }
  // ── Private ───────────────────────────────────────────────────────────────
  _sendState() {
    if (!this._view?.visible)
      return;
    try {
      const data = readShowWorkData(this.getTasksDir(), this.getArtifactsDir());
      const runState = this.getRunState();
      void this._view.webview.postMessage({
        type: "update",
        runState,
        data: serializeData(data),
        refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch {
    }
  }
  _startRefresh() {
    this._stopRefresh();
    this._refreshInterval = setInterval(
      () => this._sendState(),
      REFRESH_INTERVAL_MS
    );
  }
  _stopRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = void 0;
    }
  }
};
function serializeData(data) {
  return {
    doingTasks: data.doingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stage: t.stage,
      priority: t.priority,
      agent: t.agent,
      filesLikelyAffected: t.filesLikelyAffected,
      updatedAgo: formatRelativeTime(new Date(t.modifiedAt).toISOString())
    })),
    reviewTasks: data.reviewTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stage: t.stage,
      priority: t.priority,
      agent: t.agent,
      filesLikelyAffected: t.filesLikelyAffected,
      updatedAgo: formatRelativeTime(new Date(t.modifiedAt).toISOString())
    })),
    heartbeat: data.isHeartbeatFresh && data.latestHeartbeat ? {
      runId: data.latestHeartbeat.run_id,
      phase: data.latestHeartbeat.current_phase ?? null,
      currentTaskId: data.latestHeartbeat.current_task_id ?? null,
      currentAdapter: data.latestHeartbeat.current_adapter ?? null,
      recentEventSummary: data.latestHeartbeat.recent_event_summary ?? null,
      lastHeartbeatAgo: formatRelativeTime(data.latestHeartbeat.last_heartbeat_at),
      suspicionFlags: data.latestHeartbeat.suspicion_flags ?? []
    } : null
  };
}
function buildShellHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: transparent;
      padding: 10px 14px;
      margin: 0;
    }

    /* \u2500\u2500 Layout \u2500\u2500 */
    .header {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .refreshed-at {
      font-size: 0.9em;
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      opacity: 0.6;
    }
    .section {
      margin-bottom: 12px;
    }
    .section-label {
      font-size: 0.72em;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    /* \u2500\u2500 Run status banner \u2500\u2500 */
    .run-banner {
      border-radius: 4px;
      padding: 8px 10px;
      margin-bottom: 10px;
      font-size: 0.82em;
      line-height: 1.5;
    }
    .run-banner.running {
      background: color-mix(in srgb, var(--vscode-terminal-ansiGreen, #4ec9b0) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiGreen, #4ec9b0) 35%, transparent);
    }
    .run-banner.paused {
      background: color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 35%, transparent);
    }
    .run-banner.idle {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    }
    .run-banner-title {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.running { background: var(--vscode-terminal-ansiGreen, #4ec9b0); }
    .dot.paused  { background: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .dot.idle    { background: var(--vscode-descriptionForeground); opacity: 0.4; }
    .run-detail {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    .run-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      opacity: 0.7;
    }
    .event-summary {
      margin-top: 4px;
      font-style: italic;
      opacity: 0.85;
    }
    .suspicion {
      margin-top: 4px;
      color: var(--vscode-terminal-ansiYellow, #dcdcaa);
    }

    /* \u2500\u2500 Task cards \u2500\u2500 */
    .task-card {
      background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      padding: 8px 10px;
      margin-bottom: 7px;
    }
    .task-card:last-child { margin-bottom: 0; }
    .task-card-top {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 2px;
    }
    .task-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }
    .task-title {
      font-size: 0.88em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      line-height: 1.3;
      flex: 1;
    }
    .task-meta {
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      margin-top: 4px;
    }
    .meta-row { display: flex; gap: 5px; }
    .meta-label { min-width: 46px; opacity: 0.6; }
    .files-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .file-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      opacity: 0.75;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* \u2500\u2500 Badges \u2500\u2500 */
    .badge {
      display: inline-block;
      font-size: 0.72em;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      vertical-align: middle;
    }
    .badge-stage-doing    { background: color-mix(in srgb, var(--vscode-terminal-ansiBlue, #569cd6) 20%, transparent); color: var(--vscode-terminal-ansiBlue, #569cd6); }
    .badge-stage-review   { background: color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 18%, transparent); color: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .badge-prio-urgent    { background: color-mix(in srgb, var(--vscode-terminal-ansiRed, #f44747) 18%, transparent); color: var(--vscode-terminal-ansiRed, #f44747); }
    .badge-prio-high      { background: color-mix(in srgb, var(--vscode-terminal-ansiYellow, #dcdcaa) 15%, transparent); color: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .badge-prio-medium    { background: rgba(255,255,255,0.1); color: var(--vscode-descriptionForeground); }
    .badge-prio-low       { background: rgba(255,255,255,0.06); color: var(--vscode-descriptionForeground); opacity: 0.7; }

    /* \u2500\u2500 Review attention strip \u2500\u2500 */
    .attention-strip {
      border-left: 2px solid var(--vscode-terminal-ansiYellow, #dcdcaa);
      padding-left: 8px;
    }

    /* \u2500\u2500 Actions \u2500\u2500 */
    .actions {
      display: flex;
      gap: 5px;
      margin-top: 7px;
    }
    button {
      flex: 1;
      padding: 4px 7px;
      font-size: 0.78em;
      font-family: var(--vscode-font-family);
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      line-height: 1.3;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-color: var(--vscode-widget-border, rgba(255,255,255,0.15));
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.15)); }

    /* \u2500\u2500 Empty / loading \u2500\u2500 */
    .empty {
      padding: 16px 4px 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
      line-height: 1.6;
    }
    .loading {
      padding: 20px 4px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    Show Work
    <span class="refreshed-at" id="refreshed-at"></span>
  </div>
  <div id="root"><div class="loading">Loading\u2026</div></div>

  <script>
    const vscode = acquireVsCodeApi();

    function cmd(command) {
      vscode.postMessage({ type: 'invokeCommand', command });
    }

    // \u2500\u2500 Escape helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function esc(s) {
      if (!s) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // \u2500\u2500 Badge builders \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function stageBadge(stage) {
      return '<span class="badge badge-stage-' + esc(stage) + '">' + esc(stage) + '</span>';
    }
    function prioBadge(priority) {
      if (!priority) return '';
      const cls = 'badge-prio-' + esc(priority.toLowerCase());
      return '<span class="badge ' + cls + '">' + esc(priority) + '</span>';
    }

    // \u2500\u2500 Run banner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function buildRunBanner(runState, heartbeat) {
      let stateLabel, dotClass, bannerClass;
      if (runState === 'running') {
        stateLabel = 'Run Active';
        dotClass = bannerClass = 'running';
      } else if (runState === 'paused') {
        stateLabel = 'Run Paused';
        dotClass = bannerClass = 'paused';
      } else {
        stateLabel = 'Factory Idle';
        dotClass = bannerClass = 'idle';
      }

      let detailHtml = '';
      if (heartbeat) {
        const adapter = heartbeat.currentAdapter ? ' via ' + esc(heartbeat.currentAdapter) : '';
        const phase   = heartbeat.phase ? esc(heartbeat.phase) + adapter : '';
        const taskRef = heartbeat.currentTaskId ? esc(heartbeat.currentTaskId) : '';
        const summary = heartbeat.recentEventSummary ? esc(heartbeat.recentEventSummary) : '';
        const flags   = (heartbeat.suspicionFlags || []).length > 0
          ? '<div class="suspicion">\u26A0 ' + heartbeat.suspicionFlags.map(esc).join(', ') + '</div>'
          : '';

        detailHtml += '<div class="run-detail">';
        if (phase)   detailHtml += '<div>' + phase + (taskRef ? ' \xB7 ' + taskRef : '') + '</div>';
        if (summary) detailHtml += '<div class="event-summary">' + summary + '</div>';
        if (heartbeat.lastHeartbeatAgo) {
          detailHtml += '<div style="opacity:0.55;font-size:0.9em">updated ' + esc(heartbeat.lastHeartbeatAgo) + '</div>';
        }
        detailHtml += flags;
        detailHtml += '</div>';
      }

      let actionHtml = '';
      if (runState === 'running') {
        actionHtml = '<div class="actions">' +
          '<button class="btn-secondary" onclick="cmd('devory.runPause')">Pause</button>' +
          '<button class="btn-secondary" onclick="cmd('devory.runStop')">Stop</button>' +
          '</div>';
      } else if (runState === 'paused') {
        actionHtml = '<div class="actions">' +
          '<button class="btn-primary" onclick="cmd('devory.runStart')">Resume</button>' +
          '</div>';
      } else {
        actionHtml = '<div class="actions">' +
          '<button class="btn-secondary" onclick="cmd('devory.runStart')">\u25B6 Start Run</button>' +
          '</div>';
      }

      return '<div class="run-banner ' + bannerClass + '">' +
        '<div class="run-banner-title">' +
          '<span class="dot ' + dotClass + '"></span>' +
          '<strong>' + stateLabel + '</strong>' +
        '</div>' +
        detailHtml +
        actionHtml +
        '</div>';
    }

    // \u2500\u2500 Task card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function buildTaskCard(task, isReview) {
      const filesHtml = task.filesLikelyAffected && task.filesLikelyAffected.length > 0
        ? '<div class="meta-row"><span class="meta-label">Files</span>' +
          '<div class="files-list">' +
          task.filesLikelyAffected.map(f => '<span class="file-path" title="' + esc(f) + '">' + esc(f) + '</span>').join('') +
          '</div></div>'
        : '';

      const agentHtml = task.agent
        ? '<div class="meta-row"><span class="meta-label">Agent</span><span>' + esc(task.agent) + '</span></div>'
        : '';

      const updatedHtml = task.updatedAgo
        ? '<div class="meta-row"><span class="meta-label">Updated</span><span>' + esc(task.updatedAgo) + '</span></div>'
        : '';

      const attentionClass = isReview ? ' attention-strip' : '';
      const reviewActions = isReview
        ? '<div class="actions">' +
          '<button class="btn-primary" onclick="cmd('devory.taskApprove')">Approve</button>' +
          '<button class="btn-secondary" onclick="cmd('devory.taskSendBack')">Send Back</button>' +
          '</div>'
        : '';

      return '<div class="task-card' + attentionClass + '">' +
        '<div class="task-card-top">' +
          '<span class="task-id">' + esc(task.id) + '</span>' +
          stageBadge(task.stage) +
          (task.priority ? prioBadge(task.priority) : '') +
        '</div>' +
        '<div class="task-title">' + esc(task.title) + '</div>' +
        '<div class="task-meta">' +
          agentHtml +
          filesHtml +
          updatedHtml +
        '</div>' +
        reviewActions +
        '</div>';
    }

    // \u2500\u2500 Main render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function render(runState, data) {
      const parts = [];

      // Run status banner (always shown).
      parts.push(buildRunBanner(runState, data.heartbeat));

      // Doing tasks.
      if (data.doingTasks && data.doingTasks.length > 0) {
        parts.push('<div class="section">');
        parts.push('<div class="section-label">In Progress</div>');
        data.doingTasks.forEach(t => parts.push(buildTaskCard(t, false)));
        parts.push('</div>');
      }

      // Review tasks (needs attention).
      if (data.reviewTasks && data.reviewTasks.length > 0) {
        parts.push('<div class="section">');
        parts.push('<div class="section-label">Needs Attention \xB7 Review</div>');
        data.reviewTasks.forEach(t => parts.push(buildTaskCard(t, true)));
        parts.push('</div>');
      }

      // Empty state: nothing in doing or review.
      if (
        (!data.doingTasks || data.doingTasks.length === 0) &&
        (!data.reviewTasks || data.reviewTasks.length === 0)
      ) {
        const idleMsg = runState === 'running'
          ? 'Run is active \u2014 waiting for the first task to enter the doing stage.'
          : 'No tasks are currently in progress or awaiting review.';
        parts.push('<div class="empty">' + esc(idleMsg) + '</div>');
        if (runState === 'idle') {
          parts.push(
            '<div class="actions" style="margin-top:0">' +
            '<button class="btn-secondary" onclick="cmd('devory.taskList')">View Tasks</button>' +
            '</div>'
          );
        }
      }

      document.getElementById('root').innerHTML = parts.join('');
    }

    // \u2500\u2500 Message listener \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'update') {
        render(msg.runState, msg.data);
        // Update "refreshed" timestamp in header.
        const ts = new Date(msg.refreshedAt);
        const hh = String(ts.getHours()).padStart(2, '0');
        const mm = String(ts.getMinutes()).padStart(2, '0');
        const ss = String(ts.getSeconds()).padStart(2, '0');
        const el = document.getElementById('refreshed-at');
        if (el) el.textContent = hh + ':' + mm + ':' + ss;
      }
    });
  </script>
</body>
</html>`;
}

// src/lib/capabilities.ts
var fs11 = __toESM(require("fs"));
var path15 = __toESM(require("path"));
function detectWorkspaceCapabilities(factoryRoot, runtimeRoot = null) {
  const hasFactoryRoot = Boolean(factoryRoot) && fs11.existsSync(factoryRoot);
  const tasksDir = path15.join(factoryRoot, "tasks");
  const runsDir = path15.join(factoryRoot, "runs");
  const artifactsDir = path15.join(factoryRoot, "artifacts");
  const resolvedRuntimeRoot = runtimeRoot ? path15.resolve(runtimeRoot) : null;
  const packagedRunner = resolvedRuntimeRoot ? path15.join(resolvedRuntimeRoot, "packages", "runner", "src", "factory-run.js") : "";
  const runtimeManifest = resolvedRuntimeRoot ? path15.join(resolvedRuntimeRoot, "runtime-manifest.json") : "";
  const hasTasksDir = hasFactoryRoot && fs11.existsSync(tasksDir);
  const hasRunsDir = hasFactoryRoot && fs11.existsSync(runsDir);
  const hasArtifactsDir = hasFactoryRoot && fs11.existsSync(artifactsDir);
  const hasPackagedRunner = hasFactoryRoot && fs11.existsSync(packagedRunner);
  const hasRuntimeManifest = hasFactoryRoot && fs11.existsSync(runtimeManifest);
  const supportsTaskBrowse = hasTasksDir;
  const supportsTaskMutations = hasTasksDir;
  const supportsRunInspect = hasRunsDir;
  const supportsArtifactInspect = hasArtifactsDir;
  const supportsRunExecution = hasTasksDir && hasPackagedRunner;
  const hasReadOnlySurface = supportsTaskBrowse || supportsRunInspect || supportsArtifactInspect;
  let capabilityLevel = "none";
  if (supportsRunExecution) {
    capabilityLevel = "full-run";
  } else if (supportsTaskMutations) {
    capabilityLevel = "local-mutations";
  } else if (hasReadOnlySurface) {
    capabilityLevel = "read-only";
  }
  return {
    factoryRoot,
    runtimeRoot: resolvedRuntimeRoot,
    capabilityLevel,
    hasFactoryRoot,
    hasTasksDir,
    hasRunsDir,
    hasArtifactsDir,
    hasPackagedRunner,
    hasRuntimeManifest,
    supportsTaskBrowse,
    supportsTaskMutations,
    supportsRunInspect,
    supportsArtifactInspect,
    supportsRunExecution
  };
}
function getUnsupportedCommandMessage(command, capabilities) {
  if (!capabilities.hasFactoryRoot) {
    return "Devory: factory root not found. Set devory.factoryRoot in settings.";
  }
  switch (command) {
    case "taskList":
      return capabilities.supportsTaskBrowse ? null : "Devory: this workspace does not expose a tasks/ directory yet, so task browsing is unavailable.";
    case "taskCreate":
    case "taskMove":
      return capabilities.supportsTaskMutations ? null : "Devory: this workspace is read-only right now. Task creation and movement need a Devory workspace with a tasks/ directory.";
    case "runInspect":
      return capabilities.supportsRunInspect ? null : "Devory: no runs/ directory was found, so there are no run records to inspect here.";
    case "artifactInspect":
      return capabilities.supportsArtifactInspect ? null : "Devory: no artifacts/ directory was found, so artifact inspection is unavailable here.";
    case "runStart":
      if (capabilities.supportsRunExecution)
        return null;
      if (!capabilities.hasTasksDir) {
        return "Devory: this workspace does not look like a runnable Devory factory yet. Expected a tasks/ directory at the factory root.";
      }
      return "Devory: this workspace supports browsing and local task mutations, but not factory runs yet. Install or package the extension with its bundled runtime so the local runner is available.";
  }
}

// src/commands/task-list.ts
var vscode6 = __toESM(require("vscode"));
init_task_reader();
async function taskListCommand(tasksDir) {
  if (!tasksDir) {
    vscode6.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const items = [];
  for (const stage of LIFECYCLE_STAGES) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0)
      continue;
    items.push({ label: stage.toUpperCase(), kind: vscode6.QuickPickItemKind.Separator });
    for (const task of tasks) {
      items.push({
        label: `$(file) ${task.id}`,
        description: task.title,
        detail: `${task.project}  \xB7  priority: ${task.priority || "(none)"}`
      });
    }
  }
  if (items.length === 0) {
    vscode6.window.showInformationMessage("Devory: no tasks found.");
    return;
  }
  const picked = await vscode6.window.showQuickPick(items, {
    title: "Devory Tasks",
    placeHolder: "Select a task to open",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked || picked.kind === vscode6.QuickPickItemKind.Separator)
    return;
  const taskId = picked.label.replace("$(file) ", "").trim();
  const { findTaskFile: findTaskFile2 } = await Promise.resolve().then(() => (init_task_reader(), task_reader_exports));
  const filepath = findTaskFile2(tasksDir, taskId);
  if (filepath) {
    const doc = await vscode6.workspace.openTextDocument(filepath);
    await vscode6.window.showTextDocument(doc);
  }
}

// src/commands/task-create.ts
var vscode7 = __toESM(require("vscode"));

// src/lib/task-create.ts
var fs13 = __toESM(require("fs"));
var path17 = __toESM(require("path"));

// ../cli/src/lib/workspace.ts
var fs12 = __toESM(require("fs"));
var path16 = __toESM(require("path"));
var import_crypto = require("crypto");
init_src();

// ../../workers/lib/workflow-helpers.ts
var LIFECYCLE_STAGES2 = [
  "backlog",
  "ready",
  "doing",
  "review",
  "blocked",
  "archived",
  "done"
];
var LIFECYCLE_DIR_MAP = {
  backlog: "tasks/backlog",
  ready: "tasks/ready",
  doing: "tasks/doing",
  review: "tasks/review",
  blocked: "tasks/blocked",
  archived: "tasks/archived",
  done: "tasks/done"
};
var VALID_TRANSITIONS = {
  backlog: ["ready", "blocked", "archived"],
  ready: ["doing", "blocked", "backlog", "archived"],
  doing: ["review", "blocked", "ready", "archived"],
  review: ["done", "doing", "blocked", "archived"],
  blocked: ["backlog", "ready", "archived"],
  archived: ["backlog", "ready"],
  done: []
};
function checkTransition(from, to) {
  if (!isLifecycleStage(from)) {
    return { allowed: false, reason: `Unknown stage: "${from}"` };
  }
  if (!isLifecycleStage(to)) {
    return { allowed: false, reason: `Unknown stage: "${to}"` };
  }
  if (from === to) {
    return { allowed: false, reason: `Task is already in "${from}"` };
  }
  const targets = VALID_TRANSITIONS[from];
  if (!targets.includes(to)) {
    return {
      allowed: false,
      reason: `Transition "${from}" \u2192 "${to}" is not allowed. Valid targets: ${targets.length ? targets.join(", ") : "(none)"}`
    };
  }
  return { allowed: true };
}
function isLifecycleStage(value) {
  return LIFECYCLE_STAGES2.includes(value);
}
function renderTransitionLog(opts) {
  const { taskId, filename, fromStatus, toStatus, timestamp: timestamp2, validationErrors } = opts;
  const success = validationErrors.length === 0;
  const resultLabel = success ? "moved" : "validation-failed";
  const lines = [
    "---",
    `task_id: ${taskId}`,
    `source_file: ${filename}`,
    `timestamp: ${timestamp2}`,
    `from_status: ${fromStatus}`,
    `to_status: ${toStatus}`,
    `result: ${resultLabel}`,
    "---",
    "",
    `# Transition Log \u2014 ${taskId}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Task ID | ${taskId} |`,
    `| Timestamp | ${timestamp2} |`,
    `| From | \`${fromStatus}\` |`,
    `| To | \`${toStatus}\` |`,
    `| Result | ${resultLabel} |`,
    ""
  ];
  if (!success) {
    lines.push(
      "## Validation Errors",
      "",
      "Task was **not** moved. Fix the errors below and retry.",
      "",
      ...validationErrors.map((e) => `- ${e}`)
    );
  } else {
    lines.push(
      "## Transition Complete",
      "",
      `Task \`${taskId}\` moved from \`${fromStatus}\` to \`${toStatus}\`.`,
      "",
      `File: \`${filename}\``
    );
  }
  return lines.join("\n") + "\n";
}

// ../../workers/lib/task-utils.ts
init_src();
function rewriteStatus(content, newStatus) {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch)
    return content;
  const updatedFm = fmMatch[1].replace(
    /^(status:\s*).*$/m,
    `$1${newStatus}`
  );
  return content.replace(fmMatch[1], updatedFm);
}

// ../cli/src/lib/workspace.ts
function insertAgentIntoFrontmatter(content, agent) {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch)
    return content;
  const fm = fmMatch[1];
  if (/^agent:\s*/m.test(fm))
    return content;
  const agentLine = `agent: ${agent}`;
  const priorityMatch = fm.match(/^(priority:[^\n]*\n)/m);
  let updatedFm;
  if (priorityMatch?.index !== void 0) {
    const insertAt = (priorityMatch.index ?? 0) + priorityMatch[1].length;
    updatedFm = fm.slice(0, insertAt) + agentLine + "\n" + fm.slice(insertAt);
  } else {
    updatedFm = fm.replace(/\n---\n$/, `
${agentLine}
---
`);
  }
  return content.replace(fm, updatedFm);
}
var LIFECYCLE_STAGES3 = LIFECYCLE_STAGES2;
var LIFECYCLE_DIR_MAP2 = LIFECYCLE_DIR_MAP;
function checkTransition2(from, to) {
  return checkTransition(from, to);
}
function isStage(value) {
  return LIFECYCLE_STAGES3.includes(value);
}
function buildTaskFilename(id, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${id}-${slug}.md`;
}
function buildTaskSkeleton(opts) {
  const {
    id,
    title,
    project,
    type: type2 = "feature",
    priority = "medium",
    agent,
    lane,
    repo_area,
    goal = ""
  } = opts;
  const optionalLines = [];
  if (agent)
    optionalLines.push(`agent: ${agent}`);
  if (lane)
    optionalLines.push(`lane: ${lane}`);
  if (repo_area)
    optionalLines.push(`repo_area: ${repo_area}`);
  return [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    `project: ${project}`,
    `status: backlog`,
    `type: ${type2}`,
    `priority: ${priority}`,
    ...optionalLines,
    "---",
    "",
    "## Goal",
    "",
    goal || "",
    "",
    "## Notes",
    "",
    ""
  ].join("\n");
}
function createTask(args, options) {
  const { factoryRoot, dryRun = false } = options;
  const content = buildTaskSkeleton({
    ...args,
    repo_area: args.repoArea,
    goal: args.goal
  });
  const filename = buildTaskFilename(args.id, args.title);
  const targetDir = path16.join(factoryRoot, "tasks", "backlog");
  const filePath = path16.join(targetDir, filename);
  if (!dryRun) {
    if (fs12.existsSync(filePath)) {
      return {
        ok: false,
        error: `File already exists: ${path16.relative(factoryRoot, filePath)}. Choose a different --id or remove the existing file.`
      };
    }
    try {
      fs12.mkdirSync(targetDir, { recursive: true });
      fs12.writeFileSync(filePath, content, "utf-8");
    } catch (err) {
      return { ok: false, error: `Write failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  return { ok: true, filePath, content };
}
function moveTask(args, options) {
  const { factoryRoot } = options;
  const resolvedTask = path16.isAbsolute(args.task) ? args.task : path16.resolve(factoryRoot, args.task);
  if (!fs12.existsSync(resolvedTask)) {
    return { ok: false, error: `File not found: ${resolvedTask}` };
  }
  let raw;
  try {
    raw = fs12.readFileSync(resolvedTask, "utf-8");
  } catch (err) {
    return { ok: false, error: `Cannot read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const { meta } = parseFrontmatter(raw);
  const fromStatus = meta.status ?? "";
  const taskId = meta.id ?? path16.basename(resolvedTask, ".md");
  const transition = checkTransition2(fromStatus, args.to);
  if (!transition.allowed) {
    return { ok: false, error: transition.reason };
  }
  const validation = validateTask(meta, fromStatus);
  if (!validation.valid) {
    const artifactPath2 = _writeTransitionArtifact(factoryRoot, {
      taskId,
      filename: path16.basename(resolvedTask),
      fromStatus,
      toStatus: args.to,
      validationErrors: validation.errors
    });
    return { ok: false, error: "Validation failed", validationErrors: validation.errors };
  }
  if (!isStage(args.to)) {
    return { ok: false, error: `Unknown target stage: "${args.to}"` };
  }
  const updated = rewriteStatus(raw, args.to);
  const destDir = path16.join(factoryRoot, LIFECYCLE_DIR_MAP2[args.to]);
  const filename = path16.basename(resolvedTask);
  const destPath = path16.join(destDir, filename);
  if (fs12.existsSync(destPath) && destPath !== resolvedTask) {
    return {
      ok: false,
      error: `Destination already exists: ${path16.relative(factoryRoot, destPath)}`
    };
  }
  try {
    fs12.mkdirSync(destDir, { recursive: true });
    fs12.writeFileSync(resolvedTask, updated, "utf-8");
    if (destPath !== resolvedTask) {
      fs12.renameSync(resolvedTask, destPath);
    }
  } catch (err) {
    return { ok: false, error: `Move failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  const artifactPath = _writeTransitionArtifact(factoryRoot, {
    taskId,
    filename,
    fromStatus,
    toStatus: args.to,
    validationErrors: []
  });
  return {
    ok: true,
    fromPath: resolvedTask,
    toPath: destPath,
    fromStatus,
    toStatus: args.to,
    artifactPath
  };
}
var REVIEW_ACTIONS = TASK_REVIEW_ACTIONS;
function validateReviewAction(action, reason) {
  if (!REVIEW_ACTIONS.includes(action)) {
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${REVIEW_ACTIONS.join(", ")}`
    };
  }
  if (action === "block" && !reason.trim()) {
    return {
      valid: false,
      error: "reason is required for block action"
    };
  }
  return { valid: true };
}
function reviewActionToStage(action) {
  return TASK_REVIEW_ACTION_STAGE_MAP[action];
}
function buildReviewArtifact(opts) {
  const { taskId, action, fromStage, toStage, timestamp: timestamp2, reason } = opts;
  const lines = [
    "---",
    `task_id: ${taskId}`,
    `action: ${action}`,
    `from_status: ${fromStage}`,
    `to_status: ${toStage}`,
    `timestamp: ${timestamp2}`,
    `run_id: ${opts.runId ?? ""}`,
    `routing_decision_id: ${opts.routingDecisionId ?? ""}`,
    reason.trim() ? `reason: ${reason.trim()}` : "reason:",
    "---",
    "",
    `# Review Decision \u2014 ${taskId}`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Task ID | ${taskId} |`,
    `| Action | **${action}** |`,
    `| From | \`${fromStage}\` |`,
    `| To | \`${toStage}\` |`,
    `| Timestamp | ${timestamp2} |`,
    `| Run ID | ${opts.runId ?? "\u2014"} |`,
    `| Routing Decision | ${opts.routingDecisionId ?? "\u2014"} |`,
    `| Reason | ${reason.trim() || "\u2014"} |`,
    ""
  ];
  return lines.join("\n") + "\n";
}
function applyReviewAction(args, options) {
  const validation = validateReviewAction(args.action, args.reason ?? "");
  if (!validation.valid) {
    return { ok: false, error: validation.error ?? "Invalid review action" };
  }
  const { factoryRoot } = options;
  const resolvedTask = path16.isAbsolute(args.task) ? args.task : path16.resolve(factoryRoot, args.task);
  if (!fs12.existsSync(resolvedTask)) {
    return { ok: false, error: `File not found: ${resolvedTask}` };
  }
  let raw;
  try {
    raw = fs12.readFileSync(resolvedTask, "utf-8");
  } catch (err) {
    return { ok: false, error: `Cannot read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const { meta } = parseFrontmatter(raw);
  const fromStatus = String(meta.status ?? "");
  if (fromStatus !== "review") {
    return {
      ok: false,
      error: `Task ${String(meta.id ?? path16.basename(resolvedTask, ".md"))} must be in review before review actions can run`
    };
  }
  const taskId = String(meta.id ?? path16.basename(resolvedTask, ".md"));
  const toStage = reviewActionToStage(args.action);
  const timestamp2 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const governanceQueue = enqueueGovernanceReviewAction({
    factoryRoot,
    taskId,
    action: args.action,
    reason: args.reason ?? ""
  });
  if (governanceQueue.queued) {
    const reviewArtifactPath2 = _writeReviewArtifact(factoryRoot, {
      taskId,
      action: args.action,
      fromStage: "review",
      toStage,
      timestamp: timestamp2,
      runId: options.runId ?? null,
      routingDecisionId: options.routingDecisionId ?? null,
      reason: args.reason ?? ""
    });
    return {
      ok: true,
      taskId,
      fromPath: resolvedTask,
      toPath: resolvedTask,
      fromStatus: "review",
      toStatus: toStage,
      executionMode: "governance-queued",
      transitionArtifactPath: null,
      reviewArtifactPath: reviewArtifactPath2,
      governanceCommandPath: governanceQueue.commandPath
    };
  }
  const transition = moveTask(
    { task: resolvedTask, to: toStage },
    { factoryRoot }
  );
  if (!transition.ok) {
    return transition;
  }
  const reviewArtifactPath = _writeReviewArtifact(factoryRoot, {
    taskId,
    action: args.action,
    fromStage: "review",
    toStage: transition.toStatus,
    timestamp: timestamp2,
    runId: options.runId ?? null,
    routingDecisionId: options.routingDecisionId ?? null,
    reason: args.reason ?? ""
  });
  return {
    ok: true,
    taskId,
    fromPath: transition.fromPath,
    toPath: transition.toPath,
    fromStatus: "review",
    toStatus: transition.toStatus,
    executionMode: "direct",
    transitionArtifactPath: transition.artifactPath,
    reviewArtifactPath
  };
}
function enqueueGovernanceReviewAction(opts) {
  const { factoryRoot } = opts;
  const { flags } = loadFeatureFlags(factoryRoot);
  if (!flags.governance_repo_enabled) {
    return { queued: false, commandPath: null };
  }
  const bindingPath = path16.join(factoryRoot, ".devory", "governance.json");
  if (!fs12.existsSync(bindingPath)) {
    return { queued: false, commandPath: null };
  }
  let binding;
  try {
    binding = JSON.parse(fs12.readFileSync(bindingPath, "utf-8"));
  } catch {
    return { queued: false, commandPath: null };
  }
  const governanceConfigPath = path16.join(
    binding.governance_repo_path,
    ".devory-governance",
    "config.json"
  );
  if (!fs12.existsSync(governanceConfigPath)) {
    return { queued: false, commandPath: null };
  }
  const commandType = opts.action === "approve" ? "approve-task" : opts.action === "send-back" ? "send-back-task" : "block-task";
  const commandId = `local-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${(0, import_crypto.randomUUID)().slice(0, 8)}`;
  const pendingDir = path16.join(factoryRoot, ".devory", "commands", "pending");
  fs12.mkdirSync(pendingDir, { recursive: true });
  const command = {
    command_id: commandId,
    command_type: commandType,
    issued_by: process.env.USER ?? "local-user",
    issued_at: (/* @__PURE__ */ new Date()).toISOString(),
    workspace_id: binding.workspace_id,
    target_task_id: opts.taskId,
    target_run_id: void 0,
    governance_repo_ref: binding.governance_repo_path,
    expires_at: new Date(Date.now() + 60 * 6e4).toISOString(),
    payload: {
      task_id: opts.taskId,
      ...opts.reason.trim() ? { reason: opts.reason.trim() } : {}
    }
  };
  const validation = validateGovernanceCommandEnvelope(command);
  if (!validation.ok) {
    throw new Error(`Invalid governance review command: ${validation.errors.join("; ")}`);
  }
  const commandPath = path16.join(pendingDir, `${command.command_id}.json`);
  fs12.writeFileSync(commandPath, `${JSON.stringify(command, null, 2)}
`, {
    encoding: "utf-8",
    flag: "wx"
  });
  return { queued: true, commandPath };
}
function _writeTransitionArtifact(factoryRoot, opts) {
  try {
    const runsDir = path16.join(factoryRoot, "runs");
    fs12.mkdirSync(runsDir, { recursive: true });
    const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
    const name = `${ts}-${opts.taskId}-move.md`;
    const artifactPath = path16.join(runsDir, name);
    const content = renderTransitionLog({
      taskId: opts.taskId,
      filename: opts.filename,
      fromStatus: opts.fromStatus,
      toStatus: opts.toStatus,
      timestamp: ts,
      validationErrors: opts.validationErrors
    });
    fs12.writeFileSync(artifactPath, content, "utf-8");
    return artifactPath;
  } catch {
    return null;
  }
}
function _writeReviewArtifact(factoryRoot, opts) {
  try {
    const runsDir = path16.join(factoryRoot, "runs");
    fs12.mkdirSync(runsDir, { recursive: true });
    const artifactPath = path16.join(runsDir, `${opts.timestamp}-${opts.taskId}-review.md`);
    fs12.writeFileSync(artifactPath, buildReviewArtifact(opts), "utf-8");
    return artifactPath;
  } catch {
    return null;
  }
}

// ../cli/src/lib/factory-root.ts
init_src();

// ../cli/src/commands/run.ts
init_src();

// ../cli/src/commands/config.ts
init_standards();
init_license();

// ../cli/src/commands/pr-create.ts
init_src();

// ../cli/src/commands/diagnostics.ts
init_license();

// ../cli/src/commands/governance.ts
init_src();
function evaluateCloudCommandReadiness(env2 = process.env, runtimeReady = true) {
  const resolution = evaluateGovernanceCommandTransport({ env: env2, runtimeReady });
  return {
    ready: resolution.mode === "supabase",
    supabaseUrl: resolution.supabaseUrl,
    supabaseUrlValid: resolution.supabaseUrlValid,
    serviceRoleKeyPresent: resolution.serviceRoleKeyPresent,
    mode: resolution.mode
  };
}
function formatCloudCommandReadinessLine(readiness) {
  if (readiness.mode === "supabase") {
    return "Cloud commands: READY (managed cloud backend)";
  }
  if (readiness.mode === "local-fallback") {
    return "Cloud commands: LOCAL FALLBACK (.devory/commands)";
  }
  return "Cloud commands: NOT READY";
}

// src/lib/task-create.ts
async function runTaskCreateWorkflow(args, deps) {
  const createTaskImpl = deps.createTaskImpl ?? createTask;
  const creation = createTaskImpl(args, { factoryRoot: deps.factoryRoot, dryRun: false });
  if (!creation.ok) {
    return { ok: false, error: creation.error };
  }
  let cursorLine = findGoalCursorLine(creation.content);
  let openedInEditor = false;
  if (deps.openTextDocument && deps.showTextDocument) {
    try {
      const document = await deps.openTextDocument(creation.filePath);
      cursorLine = findGoalCursorLine(document.getText());
      const editor = await deps.showTextDocument(document);
      if (cursorLine !== null) {
        editor.setCursor(cursorLine, 0);
      }
      openedInEditor = true;
    } catch {
      openedInEditor = false;
    }
  }
  return {
    ok: true,
    filePath: creation.filePath,
    content: creation.content,
    openedInEditor,
    cursorLine
  };
}
function findGoalCursorLine(content) {
  const goalHeaderLine = content.split("\n").findIndex((line) => line.trim() === "## Goal");
  if (goalHeaderLine === -1)
    return null;
  return goalHeaderLine + 2;
}
function suggestTaskCreateDefaults(factoryRoot) {
  const project = path17.basename(factoryRoot.trim()) || "project";
  const idPrefix = detectDominantTaskIdPrefix(factoryRoot) ?? sanitizeTaskIdPrefix(project);
  return {
    id: suggestNextTaskId(factoryRoot, idPrefix),
    project
  };
}
function detectDominantTaskIdPrefix(factoryRoot) {
  const counters = /* @__PURE__ */ new Map();
  for (const filename of listTaskFilenames(factoryRoot)) {
    const match = filename.match(/^(.+)-(\d+)(?:-|\.md$)/i);
    if (!match)
      continue;
    const prefix = sanitizeTaskIdPrefix(match[1]);
    if (!prefix)
      continue;
    const sequence = Number.parseInt(match[2], 10);
    const current = counters.get(prefix) ?? { count: 0, maxSequence: 0 };
    current.count += 1;
    current.maxSequence = Math.max(current.maxSequence, sequence);
    counters.set(prefix, current);
  }
  let bestPrefix = null;
  let bestCount = -1;
  let bestMaxSequence = -1;
  for (const [prefix, stats] of counters) {
    if (stats.count > bestCount || stats.count === bestCount && stats.maxSequence > bestMaxSequence || stats.count === bestCount && stats.maxSequence === bestMaxSequence && prefix.localeCompare(bestPrefix ?? "") < 0) {
      bestPrefix = prefix;
      bestCount = stats.count;
      bestMaxSequence = stats.maxSequence;
    }
  }
  return bestPrefix;
}
function suggestNextTaskId(factoryRoot, prefix) {
  const safePrefix = sanitizeTaskIdPrefix(prefix) || "task";
  const pattern = new RegExp(`^${escapeRegExp(safePrefix)}-(\\d+)(?:-|\\.md$)`, "i");
  let maxSequence = 0;
  let width = 3;
  for (const filename of listTaskFilenames(factoryRoot)) {
    const match = filename.match(pattern);
    if (!match)
      continue;
    maxSequence = Math.max(maxSequence, Number.parseInt(match[1], 10));
    width = Math.max(width, match[1].length);
  }
  return `${safePrefix}-${String(maxSequence + 1).padStart(width, "0")}`;
}
function listTaskFilenames(factoryRoot) {
  const tasksDir = path17.join(factoryRoot, "tasks");
  if (!fs13.existsSync(tasksDir)) {
    return [];
  }
  const filenames = [];
  for (const stage of fs13.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!stage.isDirectory())
      continue;
    const stageDir = path17.join(tasksDir, stage.name);
    for (const entry of fs13.readdirSync(stageDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        filenames.push(entry.name);
      }
    }
  }
  return filenames;
}
function sanitizeTaskIdPrefix(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/commands/task-create.ts
async function taskCreateCommand(factoryRoot) {
  if (!factoryRoot) {
    vscode7.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const defaults = suggestTaskCreateDefaults(factoryRoot);
  const id = await vscode7.window.showInputBox({
    title: "Devory: Create Task (1/4)",
    prompt: "Task ID \u2014 used as the filename and referenced in depends_on chains",
    value: defaults.id,
    placeHolder: defaults.id,
    validateInput: (v) => /^[a-zA-Z0-9_-]+$/.test(v.trim()) ? null : "ID may only contain letters, numbers, hyphens, underscores"
  });
  if (!id)
    return;
  const title = await vscode7.window.showInputBox({
    title: "Devory: Create Task (2/4)",
    prompt: "Task title \u2014 one sentence describing the outcome, not the implementation",
    placeHolder: "Add user authentication to the API",
    validateInput: (v) => v.trim() ? null : "Title is required"
  });
  if (!title)
    return;
  const project = await vscode7.window.showInputBox({
    title: "Devory: Create Task (3/4)",
    prompt: "Project name \u2014 the codebase or product this task belongs to",
    value: defaults.project,
    placeHolder: defaults.project,
    validateInput: (v) => v.trim() ? null : "Project is required"
  });
  if (!project)
    return;
  const goal = await vscode7.window.showInputBox({
    title: "Devory: Create Task (4/4)",
    prompt: "Goal \u2014 one sentence describing what this task should accomplish (optional, press Enter to skip)",
    placeHolder: "Make task creation less painful inside the IDE."
  });
  if (goal === void 0)
    return;
  const trimmedId = id.trim();
  await vscode7.window.withProgress(
    { location: vscode7.ProgressLocation.Notification, title: `Creating task ${trimmedId}\u2026` },
    async () => {
      const result = await runTaskCreateWorkflow(
        { id: trimmedId, title, project, goal: goal.trim() || void 0 },
        {
          factoryRoot,
          openTextDocument: async (filePath) => vscode7.workspace.openTextDocument(filePath),
          showTextDocument: async (doc) => {
            const editor = await vscode7.window.showTextDocument(
              doc
            );
            return {
              setCursor(line, column) {
                const pos = new vscode7.Position(line, column);
                editor.selection = new vscode7.Selection(pos, pos);
                editor.revealRange(new vscode7.Range(pos, pos));
              }
            };
          }
        }
      );
      if (!result.ok) {
        vscode7.window.showErrorMessage(`Devory: task creation failed
${result.error}`);
        return;
      }
      if (!result.openedInEditor) {
        vscode7.window.showInformationMessage(`Devory: task ${trimmedId} created.`);
      }
    }
  );
}

// src/commands/task-generate-from-idea.ts
var vscode8 = __toESM(require("vscode"));
init_src();

// ../../workers/lib/task-generator.ts
init_src();
var TYPE_DETECTION_PATTERNS = [
  {
    type: "bugfix",
    pattern: /\b(fix|bug|broken|error|issue|crash|incorrect|wrong|failing|regression|patch)\b/i
  },
  {
    type: "refactor",
    pattern: /\b(refactor|restructure|extract|rename|clean\s+up|simplify|reorgani[sz]e)\b/i
  },
  {
    type: "documentation",
    pattern: /\b(document|docs|readme|changelog|guide|wiki|howto|write\s+up)\b/i
  },
  {
    type: "test",
    pattern: /\b(add\s+tests?|write\s+tests?|test\s+coverage|spec|missing\s+tests?)\b/i
  },
  {
    type: "feature",
    pattern: /\b(add|implement|build|create|introduce|enable|extend|integrate|define|scaffold|set\s*up)\b/i
  }
];
function detectIntentType(description) {
  const signals = [];
  for (const { type: type2, pattern } of TYPE_DETECTION_PATTERNS) {
    if (pattern.test(description))
      signals.push(type2);
  }
  const PRIORITY = ["bugfix", "refactor", "documentation", "test", "feature"];
  for (const p of PRIORITY) {
    if (signals.includes(p))
      return { type: p, signals };
  }
  return { type: "feature", signals: ["feature (default)"] };
}
function deriveTaskTitle(description) {
  const cleaned = description.trim().replace(/\s+/g, " ");
  const firstSentence = cleaned.match(/^[^.!?\n]+/)?.[0]?.trim() ?? cleaned;
  const titled = firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
  return titled.length > 80 ? titled.slice(0, 77) + "..." : titled;
}
var VAGUE_PATTERNS = [
  /\b(improve|optimize|enhance|clean\s+up|better|faster|nicer|everything|the\s+whole|generally|overall)\b/i,
  /\b(fix\s+stuff|fix\s+things|update\s+everything|update\s+the\s+system)\b/i
];
var BROAD_PATTERN = /\b(and\s+also|as\s+well\s+as|and\s+additionally|and\s+then)\b/i;
function assessIntentClarity(description) {
  const warnings = [];
  if (description.trim().length < 15) {
    warnings.push(
      "Description is very short \u2014 add more detail to produce a well-formed task"
    );
    return { scope: "vague", warnings };
  }
  for (const pat of VAGUE_PATTERNS) {
    if (pat.test(description)) {
      warnings.push(
        "Description contains vague language \u2014 task-writing-standard requires specific outcomes"
      );
      break;
    }
  }
  const andCount = (description.match(/\b(and|also|as\s+well)\b/gi) ?? []).length;
  if (BROAD_PATTERN.test(description) || andCount >= 3) {
    warnings.push(
      "Description may cover multiple concerns \u2014 consider splitting into separate tasks"
    );
    const scope2 = warnings.some((w) => w.includes("vague")) ? "vague" : "broad";
    return { scope: scope2, warnings };
  }
  const scope = warnings.some((w) => w.includes("vague")) ? "vague" : "specific";
  return { scope, warnings };
}
function detectIntentPriority(description) {
  const text = description.toLowerCase();
  const highSignals = ["urgent", "blocking", "critical", "asap", "immediately", "broken"];
  const lowSignals = ["eventually", "nice to have", "low priority", "someday", "minor"];
  if (highSignals.some((signal) => text.includes(signal))) {
    return "high";
  }
  if (lowSignals.some((signal) => text.includes(signal))) {
    return "low";
  }
  return "medium";
}
function detectSuggestedAgent(type2) {
  if (type2 === "review" || type2 === "audit" || type2 === "docs-review") {
    return "reviewer";
  }
  if (type2 === "research" || type2 === "planning" || type2 === "requirements") {
    return "product-analyst";
  }
  return "fullstack-builder";
}
function normalizeIntent(input) {
  const { type: detectedType, signals } = input.type ? { type: input.type, signals: [`override: ${input.type}`] } : detectIntentType(input.description);
  const suggestedTitle = deriveTaskTitle(input.description);
  const { scope, warnings } = assessIntentClarity(input.description);
  return {
    description: input.description.trim().replace(/\s+/g, " "),
    type: detectedType,
    suggestedTitle,
    suggestedPriority: detectIntentPriority(input.description),
    suggestedAgent: detectSuggestedAgent(detectedType),
    scope,
    typeSignals: signals,
    clarityWarnings: warnings
  };
}
var CRITERIA_BY_TYPE = {
  feature: (title) => [
    `- [ ] ${title} is implemented as described`,
    "- [ ] The implementation handles expected inputs correctly",
    "- [ ] Edge cases are handled or explicitly documented as out of scope",
    "- [ ] No code outside the intended scope was modified",
    "- [ ] Verification commands exit 0"
  ],
  bugfix: (title) => [
    `- [ ] The bug described in "${title}" is reproducible before the fix`,
    "- [ ] The fix resolves the issue without introducing regressions",
    "- [ ] All existing tests continue to pass",
    "- [ ] Verification commands exit 0"
  ],
  refactor: (title) => [
    `- [ ] Behaviour is unchanged after the refactor (${title})`,
    "- [ ] Code is cleaner and more maintainable",
    "- [ ] All existing tests continue to pass",
    "- [ ] No unrelated changes introduced"
  ],
  documentation: (title) => [
    `- [ ] Documentation for "${title}" is accurate and complete`,
    "- [ ] Examples or usage instructions are included where relevant",
    "- [ ] No broken links or formatting issues"
  ],
  test: (title) => [
    `- [ ] Tests for "${title}" are present and named clearly`,
    "- [ ] All new tests pass",
    "- [ ] Test coverage improves for the relevant area",
    "- [ ] No existing tests are weakened or removed"
  ]
};
var DEFAULT_CRITERIA = (title) => [
  `- [ ] ${title} is complete`,
  "- [ ] Verification commands exit 0",
  "- [ ] No unintended side effects introduced"
];
function deriveAcceptanceCriteria(type2, title) {
  const builder = CRITERIA_BY_TYPE[type2] ?? DEFAULT_CRITERIA;
  return builder(title);
}
function deriveTaskId(project, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${project}-${slug}`;
}
function buildGeneratedTaskSpec(spec, input, titleOverride) {
  const title = titleOverride ?? spec.suggestedTitle;
  const id = input.id ?? deriveTaskId(input.project, title);
  const repo = input.repo ?? ".";
  const branch = input.branch ?? `task/${id}`;
  const priority = input.priority ?? spec.suggestedPriority;
  const agent = input.agent ?? spec.suggestedAgent;
  const doctrineNotes = [
    `Type detected: ${spec.type} (signals: ${spec.typeSignals.join(", ")})`,
    `Scope assessed: ${spec.scope}`,
    ...spec.clarityWarnings.map((w) => `Warning: ${w}`)
  ];
  return {
    id,
    title,
    project: input.project,
    repo,
    branch,
    type: spec.type,
    priority,
    agent,
    acceptanceCriteria: deriveAcceptanceCriteria(spec.type, title),
    verification: ["npm run test", "npm run build"],
    doctrineNotes
  };
}

// ../../workers/lib/planner-utils.ts
var CHILD_TYPE_PATTERNS = [
  {
    type: "test",
    pattern: /\b(test|spec|verify|validate|qa|assert|check)\b/i
  },
  {
    type: "documentation",
    pattern: /\b(doc|docs|document|documentation|readme|changelog|wiki|guide|howto|write.up)\b/i
  },
  {
    type: "refactor",
    pattern: /\b(refactor|extract|rename|clean|simplify|restructure|reorganise|reorganize)\b/i
  },
  {
    type: "feature",
    pattern: /\b(implement|add|build|create|introduce|enable|extend|integrate|define|set.up|scaffold)\b/i
  }
];
function inferChildType(name, tier) {
  if (tier === 2)
    return "test";
  for (const { type: type2, pattern } of CHILD_TYPE_PATTERNS) {
    if (pattern.test(name))
      return type2;
  }
  return tier === 1 ? "feature" : "subtask";
}
function buildChildAcceptanceCriteria(name, tier) {
  const cap = capitalize(name);
  if (tier === 0) {
    return [
      `- [ ] ${cap} is in place with no errors`,
      `- [ ] Prerequisites for all dependent tasks are satisfied`,
      `- [ ] No new breaking changes introduced by this step`
    ];
  }
  if (tier === 2) {
    return [
      `- [ ] All verification commands exit 0`,
      `- [ ] Tests are present and pass for the related implementation`,
      `- [ ] No regressions in existing functionality`
    ];
  }
  return [
    `- [ ] ${cap} works correctly for the expected inputs`,
    `- [ ] Edge cases are handled or explicitly documented as out of scope`,
    `- [ ] Implementation follows existing code conventions in this area`,
    `- [ ] No code outside the intended scope was modified`
  ];
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function inheritVerification(parentVerification, tier) {
  if (parentVerification.length === 0) {
    if (tier === 2)
      return ["npm run test", "npm run build"];
    if (tier === 1)
      return ["npm run build"];
    return [];
  }
  if (tier === 2) {
    return [...parentVerification];
  }
  if (tier === 1) {
    const buildCommands = parentVerification.filter(
      (cmd) => /\b(build|lint|compile|typecheck|type-check|check)\b/i.test(cmd) && !/\b(test|spec)\b/i.test(cmd)
    );
    return buildCommands;
  }
  return [];
}
var TYPE_FALLBACKS = {
  feature: [
    "define data model or schema",
    "implement core logic",
    "add API or interface layer",
    "verify and test implementation"
  ],
  "feature-parent": [
    "define data model or schema",
    "implement core logic",
    "add API or interface layer",
    "verify and test implementation"
  ],
  epic: [
    "setup and scaffolding",
    "implement core feature",
    "add integration layer",
    "validate and verify"
  ],
  refactor: [
    "identify refactor scope and target",
    "apply refactor",
    "verify refactored code"
  ],
  bugfix: [
    "reproduce and document bug",
    "fix bug",
    "verify fix"
  ],
  documentation: [
    "draft documentation",
    "review documentation"
  ]
};
var BASIC_FALLBACK_NAMES = ["setup", "implement", "verify"];
function deriveSmartFallback(meta) {
  const taskType = meta.type?.toLowerCase().trim() ?? "";
  if (taskType && taskType in TYPE_FALLBACKS) {
    return {
      names: TYPE_FALLBACKS[taskType],
      method: "smart-fallback"
    };
  }
  return { names: BASIC_FALLBACK_NAMES, method: "basic-fallback" };
}

// ../../workers/lib/task-draft-commit.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
init_src();
var TASK_STAGE_DIRS = ["backlog", "ready", "doing", "review", "blocked", "archived", "done"];
function buildBacklogCommitDraft(draft) {
  const { inferred_fields: _inferredFields, ...persistableDraft } = draft;
  const taskId = draft.commit.committed_task_id ?? draft.draft_id;
  const target = renderTaskDraftTarget2({
    ...persistableDraft,
    status: "backlog",
    commit: {
      ...persistableDraft.commit,
      state: "ready_to_commit",
      target_stage: "backlog",
      target_path: null,
      committed_task_id: taskId
    }
  });
  const validation = validateTaskDraft(
    {
      ...persistableDraft,
      status: "backlog",
      commit: {
        ...persistableDraft.commit,
        state: "ready_to_commit",
        target_stage: "backlog",
        target_path: target.target_path,
        committed_task_id: taskId
      }
    },
    "backlog"
  );
  return {
    ...persistableDraft,
    status: "backlog",
    commit: {
      ...persistableDraft.commit,
      state: "ready_to_commit",
      target_stage: "backlog",
      target_path: target.target_path,
      committed_task_id: taskId
    },
    validation: toPlanningDraftValidationRecord(validation)
  };
}
function findTaskPathById(factoryRoot, taskId) {
  const tasksDir = import_node_path.default.join(factoryRoot, "tasks");
  for (const stage of TASK_STAGE_DIRS) {
    const stageDir = import_node_path.default.join(tasksDir, stage);
    if (!import_node_fs.default.existsSync(stageDir))
      continue;
    for (const filename of import_node_fs.default.readdirSync(stageDir)) {
      if (!filename.endsWith(".md"))
        continue;
      const filePath = import_node_path.default.join(stageDir, filename);
      const content = import_node_fs.default.readFileSync(filePath, "utf-8");
      if (new RegExp(`^id:\\s*${taskId}\\s*$`, "m").test(content)) {
        return filePath;
      }
    }
  }
  return null;
}
function prepareTaskDraftCommits(drafts) {
  const normalizedDrafts = drafts.map(buildBacklogCommitDraft);
  const prepared = normalizedDrafts.map((draft) => {
    const rendered = renderTaskDraftTarget2(draft);
    return {
      draft,
      taskId: draft.commit.committed_task_id ?? draft.draft_id,
      targetPath: rendered.target_path,
      markdown: rendered.markdown
    };
  });
  const issues = [];
  for (const draft of normalizedDrafts) {
    if (draft.validation.errors.length === 0)
      continue;
    issues.push({
      draft_id: draft.draft_id,
      task_id: draft.commit.committed_task_id ?? draft.draft_id,
      target_path: draft.commit.target_path ?? "",
      errors: [...draft.validation.errors]
    });
  }
  return { prepared, normalizedDrafts, issues };
}
function commitTaskDrafts(drafts, options) {
  const { factoryRoot } = options;
  const { prepared, normalizedDrafts, issues } = prepareTaskDraftCommits(drafts);
  if (issues.length > 0) {
    return {
      ok: false,
      reason: "validation_failed",
      error: "One or more task drafts still have blocking validation errors.",
      issues,
      drafts: normalizedDrafts
    };
  }
  const seenTargetPaths = /* @__PURE__ */ new Map();
  const duplicateTargetIssues = [];
  for (const entry of prepared) {
    const existing = seenTargetPaths.get(entry.targetPath);
    if (!existing) {
      seenTargetPaths.set(entry.targetPath, entry);
      continue;
    }
    duplicateTargetIssues.push({
      draft_id: entry.draft.draft_id,
      task_id: entry.taskId,
      target_path: entry.targetPath,
      errors: [`Target path conflicts with draft ${existing.draft.draft_id} in the same commit batch.`]
    });
  }
  if (duplicateTargetIssues.length > 0) {
    return {
      ok: false,
      reason: "duplicate_target",
      error: "Two or more drafts resolve to the same backlog file.",
      issues: duplicateTargetIssues,
      drafts: normalizedDrafts
    };
  }
  const conflictIssues = [];
  for (const entry of prepared) {
    const absoluteTargetPath = import_node_path.default.join(factoryRoot, entry.targetPath);
    if (import_node_fs.default.existsSync(absoluteTargetPath)) {
      conflictIssues.push({
        draft_id: entry.draft.draft_id,
        task_id: entry.taskId,
        target_path: entry.targetPath,
        errors: ["Target backlog file already exists."]
      });
      continue;
    }
    const existingTaskPath = findTaskPathById(factoryRoot, entry.taskId);
    if (existingTaskPath) {
      conflictIssues.push({
        draft_id: entry.draft.draft_id,
        task_id: entry.taskId,
        target_path: entry.targetPath,
        errors: [
          `Task id already exists at ${import_node_path.default.relative(factoryRoot, existingTaskPath).replace(/\\/g, "/")}.`
        ]
      });
    }
  }
  if (conflictIssues.length > 0) {
    return {
      ok: false,
      reason: "target_conflict",
      error: "One or more drafts conflict with existing task files.",
      issues: conflictIssues,
      drafts: normalizedDrafts
    };
  }
  for (const entry of prepared) {
    const absoluteTargetPath = import_node_path.default.join(factoryRoot, entry.targetPath);
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(absoluteTargetPath), { recursive: true });
    import_node_fs.default.writeFileSync(absoluteTargetPath, entry.markdown, "utf-8");
  }
  const committedDrafts = normalizedDrafts.map((draft) => ({
    ...draft,
    commit: {
      ...draft.commit,
      state: "committed"
    }
  }));
  return {
    ok: true,
    committed: prepared.map((entry) => ({
      draft_id: entry.draft.draft_id,
      task_id: entry.taskId,
      target_path: entry.targetPath,
      target_stage: "backlog"
    })),
    drafts: committedDrafts
  };
}

// src/commands/task-generate-from-idea.ts
function tierOf(name) {
  if (/\b(setup|init|scaffold|configure|prepare|provision|bootstrap)\b/i.test(name))
    return 0;
  if (/\b(verify|test|check|validate|qa|audit|assert|spec|document|docs)\b/i.test(name))
    return 2;
  return 1;
}
function buildSingleDraft(description, project) {
  const input = { description, project };
  const intentSpec = normalizeIntent(input);
  const spec = buildGeneratedTaskSpec(intentSpec, input);
  return applyTaskDraftValidation(
    buildRichTaskDraftFixture({
      draft_id: spec.id,
      title: spec.title,
      project: spec.project,
      repo: spec.repo,
      branch: spec.branch,
      type: spec.type,
      priority: spec.priority,
      status: "backlog",
      agent: spec.agent,
      verification: spec.verification,
      goal: spec.title,
      context: [description],
      acceptance_criteria: spec.acceptanceCriteria.map(
        (e) => e.replace(/^- \[ \]\s*/, "")
      ),
      expected_artifacts: ["Implementation changes", "Verification evidence"],
      failure_conditions: [
        "Requirements are not met",
        "Verification does not pass",
        "Unintended side effects are introduced"
      ],
      reviewer_checklist: [
        "Scope remains aligned with request",
        "No unrelated files changed",
        "Verification commands pass"
      ],
      depends_on: [],
      commit: {
        state: "draft",
        target_stage: "backlog",
        target_path: null,
        committed_task_id: null
      }
    })
  );
}
function buildMultipleDrafts(description, project) {
  const input = { description, project };
  const intentSpec = normalizeIntent(input);
  const baseId = deriveTaskId(project, intentSpec.suggestedTitle);
  const { names } = deriveSmartFallback({ type: intentSpec.type });
  let previousId = null;
  return names.map((name, i) => {
    const id = `${baseId}-${String(i + 1).padStart(2, "0")}`;
    const tier = tierOf(name);
    const title = `${intentSpec.suggestedTitle}: ${name}`;
    const type2 = inferChildType(name, tier);
    const verification = inheritVerification(["npm run test", "npm run build"], tier);
    const criteria = buildChildAcceptanceCriteria(name, tier);
    const draft = applyTaskDraftValidation(
      buildRichTaskDraftFixture({
        draft_id: id,
        title,
        project,
        repo: ".",
        branch: `task/${id}`,
        type: type2,
        priority: intentSpec.suggestedPriority,
        status: "backlog",
        agent: intentSpec.suggestedAgent,
        verification,
        goal: title,
        context: [description],
        acceptance_criteria: criteria.map((e) => e.replace(/^- \[ \]\s*/, "")),
        expected_artifacts: ["Implementation changes aligned to this step"],
        failure_conditions: [
          "Task drifts outside its scoped concern",
          "Required verification cannot be completed"
        ],
        reviewer_checklist: [
          "Scope is contained and vertically useful",
          "Dependencies are satisfied before this task runs"
        ],
        depends_on: previousId ? [previousId] : [],
        commit: {
          state: "draft",
          target_stage: "backlog",
          target_path: null,
          committed_task_id: null
        }
      })
    );
    previousId = draft.draft_id;
    return draft;
  });
}
function buildDrafts(description, project) {
  const intentSpec = normalizeIntent({ description, project });
  if (intentSpec.scope === "broad") {
    return buildMultipleDrafts(description, project);
  }
  return [buildSingleDraft(description, project)];
}
async function generateTasksFromIdeaCommand(factoryRoot, onSuccess, onCommitted) {
  if (!factoryRoot) {
    vscode8.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const description = await vscode8.window.showInputBox({
    title: "Devory: Generate Tasks from Idea",
    prompt: "Describe the work to be done in 1\u20133 sentences",
    placeHolder: "Add JWT authentication to the API endpoints",
    validateInput: (v) => v.trim().length < 5 ? "Please describe the work in more detail" : null
  });
  if (!description)
    return;
  const { default: nodePath } = await import("node:path");
  const projectDefault = nodePath.basename(factoryRoot.trim()) || "project";
  const project = await vscode8.window.showInputBox({
    title: "Devory: Generate Tasks from Idea \u2014 Project",
    prompt: "Project name (used in task IDs and metadata)",
    value: projectDefault,
    placeHolder: projectDefault,
    validateInput: (v) => v.trim() ? null : "Project name is required"
  });
  if (!project)
    return;
  let drafts;
  try {
    drafts = buildDrafts(description.trim(), project.trim());
  } catch (err) {
    vscode8.window.showErrorMessage(
      `Devory: task generation failed \u2014 ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  if (drafts.length === 0) {
    vscode8.window.showInformationMessage(
      "Devory: no tasks could be generated from that description. Try rephrasing."
    );
    return;
  }
  const acceptLabel = `$(check) Accept all \u2014 save ${drafts.length} task${drafts.length > 1 ? "s" : ""} to backlog`;
  const previewItems = [
    {
      label: acceptLabel,
      description: "Writes task files to tasks/backlog/",
      isAccept: true
    },
    {
      label: "",
      kind: vscode8.QuickPickItemKind.Separator,
      isAccept: false
    },
    ...drafts.map((d, i) => ({
      label: `${i + 1}. ${d.title}`,
      description: `${d.type} \xB7 ${d.priority}`,
      detail: d.depends_on && d.depends_on.length > 0 ? `depends on: ${d.depends_on.join(", ")}` : void 0,
      isAccept: false
    }))
  ];
  const picked = await vscode8.window.showQuickPick(previewItems, {
    title: "Devory: Generate Tasks from Idea \u2014 Preview",
    placeHolder: "Select 'Accept all' to save tasks, or press Escape to cancel.",
    ignoreFocusOut: true
  });
  if (!picked || !picked.isAccept)
    return;
  await vscode8.window.withProgress(
    {
      location: vscode8.ProgressLocation.Notification,
      title: `Saving ${drafts.length} task${drafts.length > 1 ? "s" : ""} to backlog\u2026`
    },
    async () => {
      const result = commitTaskDrafts(drafts, { factoryRoot });
      if (!result.ok) {
        const detail = result.issues.length > 0 ? ` (${result.issues.map((i) => i.errors[0]).join("; ")})` : "";
        vscode8.window.showErrorMessage(`Devory: failed to save tasks \u2014 ${result.error}${detail}`);
        return;
      }
      onSuccess();
      const ids = result.committed.map((c) => c.task_id);
      if (onCommitted) {
        await onCommitted(result.committed);
      } else {
        vscode8.window.showInformationMessage(
          `Devory: ${result.committed.length} task${result.committed.length > 1 ? "s" : ""} added to backlog: ${ids.join(", ")}`
        );
      }
    }
  );
}

// src/commands/task-move.ts
var vscode9 = __toESM(require("vscode"));
var path19 = __toESM(require("path"));
init_task_reader();

// src/lib/task-move.ts
function formatTaskMoveError(result) {
  return `Devory: move failed
${result.error}${result.validationErrors?.length ? `
${result.validationErrors.join("\n")}` : ""}`;
}
function runTaskMoveWorkflow(args, deps) {
  const moveTaskImpl = deps.moveTaskImpl ?? moveTask;
  const result = moveTaskImpl(
    { task: args.task, to: args.to },
    { factoryRoot: deps.factoryRoot }
  );
  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskMoveError(result),
      validationErrors: result.validationErrors
    };
  }
  deps.onMoved?.();
  return {
    ok: true,
    message: `Devory: moved ${args.label} \u2192 ${args.to}.`
  };
}

// src/commands/task-move.ts
async function taskMoveCommand(factoryRoot, tasksDir, onMoved) {
  if (!factoryRoot || !tasksDir) {
    vscode9.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const taskItems = [];
  for (const stage of LIFECYCLE_STAGES3) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0)
      continue;
    taskItems.push({ label: stage.toUpperCase(), kind: vscode9.QuickPickItemKind.Separator });
    for (const t of tasks) {
      taskItems.push({ label: t.id, description: `${t.title}  [${stage}]`, detail: t.filepath });
    }
  }
  const pickedTask = await vscode9.window.showQuickPick(taskItems, {
    title: "Devory: Move Task \u2014 select task",
    matchOnDescription: true
  });
  if (!pickedTask || pickedTask.kind === vscode9.QuickPickItemKind.Separator)
    return;
  const taskFilepath = pickedTask.detail;
  const relPath = path19.relative(factoryRoot, taskFilepath).replace(/\\/g, "/");
  const stageItems = LIFECYCLE_STAGES3.map((s) => ({ label: s }));
  const pickedStage = await vscode9.window.showQuickPick(stageItems, {
    title: `Devory: Move Task \u2014 move "${pickedTask.label}" to`
  });
  if (!pickedStage)
    return;
  await vscode9.window.withProgress(
    {
      location: vscode9.ProgressLocation.Notification,
      title: `Moving ${pickedTask.label} \u2192 ${pickedStage.label}\u2026`
    },
    async () => {
      const result = runTaskMoveWorkflow(
        { task: relPath, to: pickedStage.label, label: pickedTask.label },
        { factoryRoot, onMoved }
      );
      if (!result.ok) {
        vscode9.window.showErrorMessage(result.error);
      } else {
        vscode9.window.showInformationMessage(result.message);
      }
    }
  );
}

// src/commands/task-promote.ts
var fs17 = __toESM(require("fs"));
var path21 = __toESM(require("path"));
var vscode12 = __toESM(require("vscode"));
init_src();

// src/lib/agent-catalog.ts
var fs15 = __toESM(require("fs"));
var path20 = __toESM(require("path"));
var FALLBACK_CATALOG = {
  default_agent: "fullstack-builder",
  agents: [
    {
      id: "fullstack-builder",
      name: "Fullstack Builder",
      description: "General-purpose agent for most product and code tasks.",
      best_for: ["bug fixes", "small features", "cross-layer work"]
    },
    {
      id: "backend-specialist",
      name: "Backend Specialist",
      description: "APIs, services, and server-side logic.",
      best_for: ["API development", "business logic", "integrations"]
    },
    {
      id: "frontend-specialist",
      name: "Frontend Specialist",
      description: "UI components, styling, and browser-side behavior.",
      best_for: ["UI work", "React/components", "UX fixes"]
    },
    {
      id: "data-engineer",
      name: "Data Engineer",
      description: "Pipelines, transformations, and analytics systems.",
      best_for: ["SQL/dbt", "BigQuery", "schema design"]
    },
    {
      id: "test-engineer",
      name: "Test Engineer",
      description: "Test coverage, QA automation, and validation logic.",
      best_for: ["unit tests", "integration tests", "validation tooling"]
    },
    {
      id: "infra-engineer",
      name: "Infra Engineer",
      description: "Infrastructure, CI/CD, and deployment systems.",
      best_for: ["CI/CD", "infrastructure config", "deployment pipelines"]
    }
  ]
};
function parseAgentCatalogYaml(raw) {
  try {
    const lines = raw.split("\n");
    let defaultAgent = "";
    const agents = [];
    let current = null;
    let inBestFor = false;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const topScalar = line.match(/^([a-z_]+):\s*(.+)$/);
      if (topScalar && !line.startsWith(" ") && !line.startsWith("-")) {
        if (topScalar[1] === "default_agent") {
          defaultAgent = topScalar[2].trim();
        }
        inBestFor = false;
        continue;
      }
      if (line.match(/^  - id:/)) {
        if (current && current.id)
          agents.push(finishEntry(current));
        current = { id: line.replace(/^  - id:\s*/, "").trim(), best_for: [] };
        inBestFor = false;
        continue;
      }
      if (!current)
        continue;
      const entryScalar = line.match(/^    ([a-z_]+):\s*(.+)$/);
      if (entryScalar) {
        inBestFor = false;
        const [, key, val] = entryScalar;
        if (key === "name")
          current.name = val.trim();
        else if (key === "description")
          current.description = val.trim();
        continue;
      }
      if (line.match(/^    best_for:\s*$/)) {
        inBestFor = true;
        if (!current.best_for)
          current.best_for = [];
        continue;
      }
      if (inBestFor) {
        const item = line.match(/^      -\s*(.+)$/);
        if (item) {
          current.best_for = current.best_for ?? [];
          current.best_for.push(item[1].trim());
        }
        continue;
      }
    }
    if (current && current.id)
      agents.push(finishEntry(current));
    if (agents.length === 0)
      return null;
    return { default_agent: defaultAgent || agents[0].id, agents };
  } catch {
    return null;
  }
}
function finishEntry(partial) {
  return {
    id: partial.id ?? "",
    name: partial.name ?? partial.id ?? "",
    description: partial.description ?? "",
    best_for: partial.best_for ?? []
  };
}
function loadAgentCatalog(factoryRoot) {
  const catalogPath = path20.join(factoryRoot, "agents", "agents.yaml");
  try {
    const raw = fs15.readFileSync(catalogPath, "utf-8");
    const parsed = parseAgentCatalogYaml(raw);
    if (parsed)
      return parsed;
  } catch {
  }
  return FALLBACK_CATALOG;
}

// src/commands/task-promote.ts
init_task_reader();

// src/lib/task-control.ts
var PROMOTION_STAGE_MAP = {
  backlog: "ready",
  ready: "doing",
  doing: "review"
};
function formatValidationDetails(validationErrors) {
  return validationErrors?.length ? `
${validationErrors.join("\n")}` : "";
}
function formatTaskControlMoveError(result) {
  return `Devory: action failed
${result.error}${formatValidationDetails(result.validationErrors)}`;
}
function formatTaskReviewError(result) {
  return `Devory: review action failed
${result.error}${formatValidationDetails(result.validationErrors)}`;
}
function runTaskPromoteWorkflow(args, deps) {
  if (!(args.fromStage in PROMOTION_STAGE_MAP)) {
    return {
      ok: false,
      error: "Devory: only backlog, ready, or doing tasks can be promoted with this command."
    };
  }
  const to = PROMOTION_STAGE_MAP[args.fromStage];
  const moveTaskImpl = deps.moveTaskImpl ?? moveTask;
  const result = moveTaskImpl({ task: args.task, to }, { factoryRoot: deps.factoryRoot });
  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskControlMoveError(result),
      validationErrors: result.validationErrors
    };
  }
  deps.onChanged?.();
  return {
    ok: true,
    message: `Devory: promoted ${args.label} \u2192 ${to}.`
  };
}
function runTaskRequeueWorkflow(args, deps) {
  if (args.fromStage !== "blocked" && args.fromStage !== "archived") {
    return {
      ok: false,
      error: "Devory: only blocked or archived tasks can be requeued."
    };
  }
  const targetStage = args.fromStage === "archived" ? args.toStage ?? "backlog" : "ready";
  const moveTaskImpl = deps.moveTaskImpl ?? moveTask;
  const result = moveTaskImpl(
    { task: args.task, to: targetStage },
    { factoryRoot: deps.factoryRoot }
  );
  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskControlMoveError(result),
      validationErrors: result.validationErrors
    };
  }
  deps.onChanged?.();
  return {
    ok: true,
    message: `Devory: requeued ${args.label} \u2192 ${targetStage}.`
  };
}
function runTaskReviewWorkflow(args, deps) {
  const applyReviewActionImpl = deps.applyReviewActionImpl ?? applyReviewAction;
  const result = applyReviewActionImpl(
    { task: args.task, action: args.action, reason: args.reason },
    { factoryRoot: deps.factoryRoot }
  );
  if (!result.ok) {
    return {
      ok: false,
      error: formatTaskReviewError(result),
      validationErrors: result.validationErrors
    };
  }
  if (result.executionMode === "governance-queued" && result.governanceCommandPath) {
    deps.onChanged?.();
    const queuedMessage = args.action === "approve" ? `Devory: queued approval for ${args.label}.` : args.action === "send-back" ? `Devory: queued send-back for ${args.label}.` : `Devory: queued block for ${args.label}.`;
    return { ok: true, message: queuedMessage };
  }
  deps.onChanged?.();
  const message = args.action === "approve" ? `Devory: approved ${args.label}.` : args.action === "send-back" ? `Devory: sent ${args.label} back to doing.` : `Devory: blocked ${args.label}.`;
  return { ok: true, message };
}

// src/lib/task-target.ts
var vscode10 = __toESM(require("vscode"));
init_task_reader();
function isTaskSummary(value) {
  return Boolean(
    value && typeof value === "object" && "filepath" in value && "id" in value && "stage" in value
  );
}
function isTaskTreeTargetLike(value) {
  return Boolean(value && typeof value === "object" && "task" in value);
}
function resolveTaskTarget(tasksDir, target) {
  if (!target)
    return null;
  if (target instanceof vscode10.Uri) {
    return findTaskByFile(tasksDir, target.fsPath);
  }
  if (isTaskTreeTargetLike(target)) {
    return target.task;
  }
  if (isTaskSummary(target)) {
    return target;
  }
  return null;
}
function resolveActiveEditorTask(tasksDir) {
  const uri = vscode10.window.activeTextEditor?.document.uri;
  if (!uri)
    return null;
  return resolveTaskTarget(tasksDir, uri);
}

// src/commands/task-enrich.ts
var fs16 = __toESM(require("fs"));
var vscode11 = __toESM(require("vscode"));
var SECTIONS = {
  acceptanceCriteria: {
    heading: "## Acceptance Criteria",
    placeholder: "- Criterion 1 \u2014 specific, verifiable outcome\n"
  },
  verification: {
    heading: "## Verification",
    placeholder: "- `npm test`\n"
  },
  dependsOn: {
    heading: "## Depends On",
    placeholder: "- (none)\n"
  },
  filesAffected: {
    heading: "## Files Likely Affected",
    placeholder: "- (unknown)\n"
  },
  context: {
    heading: "## Context",
    placeholder: "Relevant background, constraints, and assumptions the agent needs to know.\n"
  }
};
var ENRICH_ORDER = [
  "acceptanceCriteria",
  "verification",
  "context",
  "filesAffected",
  "dependsOn"
];
function hasSection(content, heading) {
  return content.split("\n").some((line) => line.trim() === heading);
}
function appendSection(content, def) {
  const base = content.endsWith("\n") ? content : content + "\n";
  return `${base}
${def.heading}

${def.placeholder}`;
}
function resolveActiveTaskFile() {
  const editor = vscode11.window.activeTextEditor;
  if (!editor)
    return null;
  const filePath = editor.document.uri.fsPath;
  if (!filePath.endsWith(".md"))
    return null;
  if (!/[\\/]tasks[\\/]/.test(filePath))
    return null;
  return filePath;
}
async function applySection(sectionKey, filePath) {
  const def = SECTIONS[sectionKey];
  let content;
  try {
    content = fs16.readFileSync(filePath, "utf-8");
  } catch {
    return { added: false, skipped: false };
  }
  if (hasSection(content, def.heading)) {
    return { added: false, skipped: true };
  }
  const updated = appendSection(content, def);
  fs16.writeFileSync(filePath, updated, "utf-8");
  return { added: true, skipped: false };
}
async function taskEnrichCommand() {
  const filePath = resolveActiveTaskFile();
  if (!filePath) {
    vscode11.window.showErrorMessage(
      "Devory: open a task file first to enrich it."
    );
    return;
  }
  let content;
  try {
    content = fs16.readFileSync(filePath, "utf-8");
  } catch {
    vscode11.window.showErrorMessage("Devory: could not read task file.");
    return;
  }
  const missing = ENRICH_ORDER.filter(
    (key) => !hasSection(content, SECTIONS[key].heading)
  );
  if (missing.length === 0) {
    vscode11.window.showInformationMessage(
      "Devory: task already has all enrichment sections."
    );
    return;
  }
  let updated = content;
  for (const key of missing) {
    if (!hasSection(updated, SECTIONS[key].heading)) {
      updated = appendSection(updated, SECTIONS[key]);
    }
  }
  fs16.writeFileSync(filePath, updated, "utf-8");
  const added = missing.map((k) => SECTIONS[k].heading.replace("## ", "")).join(", ");
  vscode11.window.showInformationMessage(
    `Devory: added ${missing.length} section(s): ${added}.`
  );
}
async function addSectionCommand(sectionKey) {
  const filePath = resolveActiveTaskFile();
  if (!filePath) {
    vscode11.window.showErrorMessage(
      "Devory: open a task file first."
    );
    return;
  }
  const result = await applySection(sectionKey, filePath);
  const def = SECTIONS[sectionKey];
  const label = def.heading.replace("## ", "");
  if (result.skipped) {
    vscode11.window.showInformationMessage(
      `Devory: "${label}" section already exists.`
    );
  } else if (result.added) {
    vscode11.window.showInformationMessage(
      `Devory: added "${label}" section.`
    );
  } else {
    vscode11.window.showErrorMessage(
      `Devory: could not add "${label}" section.`
    );
  }
}

// src/commands/task-promote.ts
var PROMOTABLE_STAGES = ["backlog", "ready", "doing"];
var READINESS_SECTIONS = ["## Acceptance Criteria", "## Verification"];
var CUSTOM_AGENT_ITEM = {
  label: "$(edit) Enter a custom agent name\u2026",
  description: ""
};
function readAgentFromFile(taskFilepath) {
  let content;
  try {
    content = fs17.readFileSync(taskFilepath, "utf-8");
  } catch {
    return null;
  }
  const { meta } = parseFrontmatter(content);
  return meta.agent && String(meta.agent).trim() || null;
}
async function promptAndInsertAgent(factoryRoot, taskFilepath, taskLabel) {
  const catalog = loadAgentCatalog(factoryRoot);
  const catalogItems = catalog.agents.map((a) => ({
    label: a.name,
    description: a.description,
    // Store the id in detail so we can read it back without coupling to label text.
    detail: a.id
  }));
  const defaultItem = catalogItems.find((item) => item.detail === catalog.default_agent);
  if (defaultItem) {
    defaultItem.description = `${defaultItem.description}  \u2605 default`;
  }
  const picked = await vscode12.window.showQuickPick(
    [...catalogItems, CUSTOM_AGENT_ITEM],
    {
      title: `Devory: Select Agent for "${taskLabel}"`,
      placeHolder: "Choose an agent to assign before promoting to ready",
      matchOnDescription: true
    }
  );
  if (!picked)
    return null;
  let agent;
  if (picked.label.startsWith("$(edit)")) {
    const custom = await vscode12.window.showInputBox({
      title: "Devory: Custom Agent Name",
      prompt: "Enter the agent id to assign to this task",
      placeHolder: catalog.default_agent,
      validateInput: (v) => v.trim() ? null : "Agent name is required"
    });
    if (!custom)
      return null;
    agent = custom.trim();
  } else {
    agent = picked.detail ?? picked.label;
  }
  let content;
  try {
    content = fs17.readFileSync(taskFilepath, "utf-8");
  } catch {
    vscode12.window.showErrorMessage(`Devory: could not read task file to insert agent.`);
    return null;
  }
  const updated = insertAgentIntoFrontmatter(content, agent);
  try {
    fs17.writeFileSync(taskFilepath, updated, "utf-8");
  } catch {
    vscode12.window.showErrorMessage(`Devory: could not write agent to task file.`);
    return null;
  }
  return agent;
}
async function ensureAgentAssigned(factoryRoot, taskFilepath, taskLabel) {
  if (readAgentFromFile(taskFilepath))
    return true;
  const agent = await promptAndInsertAgent(factoryRoot, taskFilepath, taskLabel);
  return agent !== null;
}
function missingReadinessSections(taskFilepath) {
  let content;
  try {
    content = fs17.readFileSync(taskFilepath, "utf-8");
  } catch {
    return [];
  }
  const lines = content.split("\n").map((l) => l.trim());
  return READINESS_SECTIONS.filter((heading) => !lines.includes(heading));
}
async function runReadinessCheck(taskFilepath, taskLabel) {
  const missing = missingReadinessSections(taskFilepath);
  if (missing.length === 0)
    return true;
  const labels = missing.map((h) => h.replace("## ", "")).join(", ");
  const choice = await vscode12.window.showWarningMessage(
    `"${taskLabel}" is missing: ${labels}. Promote to ready anyway?`,
    { modal: false },
    "Add Sections",
    "Promote Anyway"
  );
  if (choice === "Add Sections") {
    try {
      const doc = await vscode12.workspace.openTextDocument(taskFilepath);
      await vscode12.window.showTextDocument(doc);
    } catch {
    }
    await taskEnrichCommand();
    return false;
  }
  if (choice === "Promote Anyway")
    return true;
  return false;
}
async function taskPromoteCommand(factoryRoot, tasksDir, onChanged, target) {
  if (!factoryRoot || !tasksDir) {
    vscode12.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    if (directTarget.stage === "backlog") {
      const agentOk = await ensureAgentAssigned(factoryRoot, directTarget.filepath, directTarget.id);
      if (!agentOk)
        return;
      const proceed = await runReadinessCheck(directTarget.filepath, directTarget.id);
      if (!proceed)
        return;
    }
    const relPath2 = path21.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    await vscode12.window.withProgress(
      {
        location: vscode12.ProgressLocation.Notification,
        title: `Promoting ${directTarget.id}\u2026`
      },
      async () => {
        const result = runTaskPromoteWorkflow(
          { task: relPath2, label: directTarget.id, fromStage: directTarget.stage },
          { factoryRoot, onChanged }
        );
        if (!result.ok) {
          vscode12.window.showErrorMessage(result.error);
        } else {
          vscode12.window.showInformationMessage(result.message);
        }
      }
    );
    return;
  }
  const items = [];
  for (const stage of PROMOTABLE_STAGES) {
    const tasks = listTasksInStage(tasksDir, stage);
    if (tasks.length === 0)
      continue;
    items.push({ label: stage.toUpperCase(), kind: vscode12.QuickPickItemKind.Separator });
    for (const task of tasks) {
      items.push({
        label: task.id,
        description: `${task.title}  [${stage}]`,
        detail: task.filepath
      });
    }
  }
  if (items.length === 0) {
    vscode12.window.showInformationMessage(
      "Devory: no backlog, ready, or doing tasks are available to promote."
    );
    return;
  }
  const pickedTask = await vscode12.window.showQuickPick(items, {
    title: "Devory: Promote Task",
    placeHolder: "Select a task to promote to its next stage",
    matchOnDescription: true
  });
  if (!pickedTask || pickedTask.kind === vscode12.QuickPickItemKind.Separator)
    return;
  const taskFilepath = pickedTask.detail;
  const fromStageMatch = pickedTask.description?.match(/\[(backlog|ready|doing)\]$/);
  const fromStage = fromStageMatch?.[1] ?? "";
  if (fromStage === "backlog") {
    const agentOk = await ensureAgentAssigned(factoryRoot, taskFilepath, pickedTask.label);
    if (!agentOk)
      return;
    const proceed = await runReadinessCheck(taskFilepath, pickedTask.label);
    if (!proceed)
      return;
  }
  const relPath = path21.relative(factoryRoot, taskFilepath).replace(/\\/g, "/");
  await vscode12.window.withProgress(
    {
      location: vscode12.ProgressLocation.Notification,
      title: `Promoting ${pickedTask.label}\u2026`
    },
    async () => {
      const result = runTaskPromoteWorkflow(
        { task: relPath, label: pickedTask.label, fromStage },
        { factoryRoot, onChanged }
      );
      if (!result.ok) {
        vscode12.window.showErrorMessage(result.error);
      } else {
        vscode12.window.showInformationMessage(result.message);
      }
    }
  );
}

// src/commands/task-review.ts
var vscode13 = __toESM(require("vscode"));
init_task_reader();
async function taskReviewCommand(tasksDir, target) {
  if (!tasksDir) {
    vscode13.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    const doc2 = await vscode13.workspace.openTextDocument(directTarget.filepath);
    await vscode13.window.showTextDocument(doc2);
    return;
  }
  const tasks = listTasksInStage(tasksDir, "review");
  if (tasks.length === 0) {
    vscode13.window.showInformationMessage("Devory: no review tasks are waiting right now.");
    return;
  }
  const picked = await vscode13.window.showQuickPick(
    tasks.map((task) => ({
      label: `$(file) ${task.id}`,
      description: task.title,
      detail: task.filepath
    })),
    {
      title: "Devory: Review Queue",
      placeHolder: "Select a review task to open",
      matchOnDescription: true,
      matchOnDetail: true
    }
  );
  if (!picked?.detail)
    return;
  const doc = await vscode13.workspace.openTextDocument(picked.detail);
  await vscode13.window.showTextDocument(doc);
}

// src/commands/task-review-action.ts
var path22 = __toESM(require("path"));
var vscode14 = __toESM(require("vscode"));
init_task_reader();
var REVIEW_ACTION_TITLES = {
  approve: "Approve Review Task",
  "send-back": "Send Review Task Back",
  block: "Block Review Task"
};
var REVIEW_ACTION_PROGRESS = {
  approve: "Approving",
  "send-back": "Sending back",
  block: "Blocking"
};
async function taskReviewActionCommand(factoryRoot, tasksDir, action, onChanged, target) {
  if (!factoryRoot || !tasksDir) {
    vscode14.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    const reason2 = action === "block" ? await vscode14.window.showInputBox({
      title: "Devory: Block Review Task",
      prompt: "Briefly explain why this task is being blocked",
      validateInput: (value) => value.trim() ? null : "A block reason is required."
    }) : void 0;
    if (action === "block" && reason2 === void 0)
      return;
    const relPath2 = path22.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    await vscode14.window.withProgress(
      {
        location: vscode14.ProgressLocation.Notification,
        title: `${REVIEW_ACTION_PROGRESS[action]} ${directTarget.id}\u2026`
      },
      async () => {
        const result = runTaskReviewWorkflow(
          { task: relPath2, label: directTarget.id, action, reason: reason2 },
          { factoryRoot, onChanged }
        );
        if (!result.ok) {
          vscode14.window.showErrorMessage(result.error);
        } else {
          vscode14.window.showInformationMessage(result.message);
        }
      }
    );
    return;
  }
  const tasks = listTasksInStage(tasksDir, "review");
  if (tasks.length === 0) {
    vscode14.window.showInformationMessage("Devory: no review tasks are waiting right now.");
    return;
  }
  const pickedTask = await vscode14.window.showQuickPick(
    tasks.map((task) => ({
      label: task.id,
      description: task.title,
      detail: task.filepath
    })),
    {
      title: `Devory: ${REVIEW_ACTION_TITLES[action]}`,
      placeHolder: "Select a review task",
      matchOnDescription: true
    }
  );
  if (!pickedTask?.detail)
    return;
  const reason = action === "block" ? await vscode14.window.showInputBox({
    title: "Devory: Block Review Task",
    prompt: "Briefly explain why this task is being blocked",
    validateInput: (value) => value.trim() ? null : "A block reason is required."
  }) : void 0;
  if (action === "block" && reason === void 0)
    return;
  const relPath = path22.relative(factoryRoot, pickedTask.detail).replace(/\\/g, "/");
  await vscode14.window.withProgress(
    {
      location: vscode14.ProgressLocation.Notification,
      title: `${REVIEW_ACTION_PROGRESS[action]} ${pickedTask.label}\u2026`
    },
    async () => {
      const result = runTaskReviewWorkflow(
        {
          task: relPath,
          label: pickedTask.label,
          action,
          reason
        },
        { factoryRoot, onChanged }
      );
      if (!result.ok) {
        vscode14.window.showErrorMessage(result.error);
      } else {
        vscode14.window.showInformationMessage(result.message);
      }
    }
  );
}

// src/commands/task-requeue.ts
var path23 = __toESM(require("path"));
var vscode15 = __toESM(require("vscode"));
init_task_reader();
async function taskRequeueCommand(factoryRoot, tasksDir, onChanged, target) {
  if (!factoryRoot || !tasksDir) {
    vscode15.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    const relPath2 = path23.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    const toStage2 = directTarget.stage === "archived" ? await vscode15.window.showQuickPick([{ label: "backlog" }, { label: "ready" }], {
      title: `Devory: Restore ${directTarget.id} to`
    }) : null;
    if (directTarget.stage === "archived" && !toStage2)
      return;
    await vscode15.window.withProgress(
      {
        location: vscode15.ProgressLocation.Notification,
        title: `Requeueing ${directTarget.id}\u2026`
      },
      async () => {
        const result = runTaskRequeueWorkflow(
          {
            task: relPath2,
            label: directTarget.id,
            fromStage: directTarget.stage,
            toStage: toStage2?.label
          },
          { factoryRoot, onChanged }
        );
        if (!result.ok) {
          vscode15.window.showErrorMessage(result.error);
        } else {
          vscode15.window.showInformationMessage(result.message);
        }
      }
    );
    return;
  }
  const tasks = [
    ...listTasksInStage(tasksDir, "blocked"),
    ...listTasksInStage(tasksDir, "archived")
  ];
  if (tasks.length === 0) {
    vscode15.window.showInformationMessage("Devory: no blocked or archived tasks are available to requeue.");
    return;
  }
  const pickedTask = await vscode15.window.showQuickPick(
    tasks.map((task) => ({
      label: task.id,
      description: task.title,
      detail: task.filepath
    })),
    {
      title: "Devory: Requeue Task",
      placeHolder: "Select a blocked or archived task to restore",
      matchOnDescription: true
    }
  );
  if (!pickedTask?.detail)
    return;
  const relPath = path23.relative(factoryRoot, pickedTask.detail).replace(/\\/g, "/");
  const fromStage = tasks.find((task) => task.filepath === pickedTask.detail)?.stage ?? "blocked";
  const toStage = fromStage === "archived" ? await vscode15.window.showQuickPick([{ label: "backlog" }, { label: "ready" }], {
    title: `Devory: Restore ${pickedTask.label} to`
  }) : null;
  if (fromStage === "archived" && !toStage)
    return;
  await vscode15.window.withProgress(
    {
      location: vscode15.ProgressLocation.Notification,
      title: `Requeueing ${pickedTask.label}\u2026`
    },
    async () => {
      const result = runTaskRequeueWorkflow(
        {
          task: relPath,
          label: pickedTask.label,
          fromStage,
          toStage: toStage?.label
        },
        { factoryRoot, onChanged }
      );
      if (!result.ok) {
        vscode15.window.showErrorMessage(result.error);
      } else {
        vscode15.window.showInformationMessage(result.message);
      }
    }
  );
}

// src/commands/run-start.ts
var fs20 = __toESM(require("fs"));
var path26 = __toESM(require("path"));
var vscode16 = __toESM(require("vscode"));
init_src();

// src/lib/execution-outcome.ts
var fs18 = __toESM(require("fs"));
var path24 = __toESM(require("path"));
var EXECUTION_OUTCOME_VERSION = "execution-outcome-v1";
var EXECUTION_OUTCOME_ARTIFACT = path24.join(
  "artifacts",
  "routing-outcomes",
  "execution-outcomes.jsonl"
);
function createOutcomeId(timestamp2) {
  const safe = timestamp2.replace(/[:.]/g, "-");
  return `routing-outcome-${safe}`;
}
function countBy(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}
function dominantValue(values) {
  if (values.length === 0)
    return null;
  const counts = countBy(values);
  let winner = null;
  let winnerCount = -1;
  for (const value of values) {
    const nextCount = counts.get(value) ?? 0;
    if (nextCount > winnerCount) {
      winner = value;
      winnerCount = nextCount;
    }
  }
  return winner;
}
function summarizeTaskProfiles(taskProfiles) {
  if (taskProfiles.length === 0) {
    return null;
  }
  return {
    total_tasks: taskProfiles.length,
    dominant_complexity_tier: dominantValue(
      taskProfiles.map((profile) => profile.complexity_tier)
    ),
    dominant_local_viability: dominantValue(
      taskProfiles.map((profile) => profile.local_viability)
    ),
    decomposition_candidates: taskProfiles.filter(
      (profile) => profile.decomposition_candidate
    ).length,
    recommended_provider_mix: {
      deterministic: taskProfiles.filter(
        (profile) => profile.recommended_provider_class === "deterministic"
      ).length,
      local: taskProfiles.filter(
        (profile) => profile.recommended_provider_class === "local"
      ).length,
      cloud: taskProfiles.filter(
        (profile) => profile.recommended_provider_class === "cloud"
      ).length
    }
  };
}
function resolveSelectedProviderClass(binding) {
  return binding.originally_targeted_class ?? binding.selected_provider_class ?? null;
}
function resolveActualProviderClass(binding) {
  return binding.selected_provider_class ?? null;
}
function resolveFallbackReason(binding) {
  return binding.fallback_reason ?? binding.target_fallback_reason ?? binding.adapter_fallback_reason ?? null;
}
function resolveLearnable(runRecord, runResultStatus, failureReason) {
  if (runResultStatus === "cancelled") {
    return null;
  }
  if (runRecord) {
    const executedAny = runRecord.tasks_executed.length > 0;
    const failedAny = runRecord.tasks_executed.some(
      (record) => record.outcome === "failure"
    );
    if (executedAny && !failedAny) {
      return true;
    }
    if (failedAny) {
      return false;
    }
  }
  if (runResultStatus === "completed") {
    return true;
  }
  if (runResultStatus === "failed" || runResultStatus === "blocked" || runResultStatus === "no-op") {
    return false;
  }
  if (runResultStatus === "cancelled" && failureReason && failureReason.toLowerCase().includes("stopped by operator")) {
    return null;
  }
  return null;
}
function mapRunResultStatus(input) {
  const failureReason = input.failureReason?.trim() ?? "";
  const lowerReason = failureReason.toLowerCase();
  if (input.runRecord) {
    if (input.runRecord.status === "completed") {
      return "completed";
    }
    if (input.runRecord.status === "paused_for_review") {
      return "blocked";
    }
    if (input.runRecord.status === "failed" && (lowerReason.includes("stopped by operator") || lowerReason.includes("stop requested"))) {
      return "cancelled";
    }
    if (input.runRecord.status === "failed") {
      return "failed";
    }
  }
  if (input.signal) {
    return "cancelled";
  }
  if (input.noOutput) {
    return "no-op";
  }
  if ((input.exitCode ?? 0) !== 0) {
    return "failed";
  }
  return "completed";
}
function resolveFailureReason(input) {
  if (input.runRecord?.failure?.reason) {
    return input.runRecord.failure.reason;
  }
  if (input.failureReason && input.failureReason.trim() !== "") {
    return input.failureReason.trim();
  }
  if (input.signal) {
    return `Process killed by signal ${input.signal}`;
  }
  if ((input.exitCode ?? 0) !== 0) {
    return `Process exited with code ${input.exitCode ?? 1}`;
  }
  return null;
}
function createExecutionOutcomeSession(timestamp2) {
  return {
    outcome_id: createOutcomeId(timestamp2),
    next_sequence: 1
  };
}
function buildRunStartOutcome(session, input, runId) {
  return {
    version: EXECUTION_OUTCOME_VERSION,
    outcome_id: session.outcome_id,
    sequence: session.next_sequence,
    recorded_at: input.timestamp,
    run_id: runId,
    task_ids: [...input.task_ids],
    task_profile_summary: summarizeTaskProfiles(input.task_profiles),
    selected_provider_class: resolveSelectedProviderClass(input.binding),
    selected_target_id: input.binding.selected_target_id ?? null,
    selected_adapter_id: input.binding.selected_adapter_id ?? null,
    actual_provider_class: resolveActualProviderClass(input.binding),
    actual_target_id: input.binding.actual_target_id ?? null,
    actual_adapter_id: input.binding.actual_adapter_id ?? null,
    preference_used: input.preference_used,
    fallback_taken: input.binding.fallback_taken || input.binding.target_fallback_taken || input.binding.adapter_fallback_taken,
    fallback_reason: resolveFallbackReason(input.binding),
    readiness_state: input.binding.target_readiness_state ?? null,
    execution_path: input.binding.actual_execution_path ?? input.binding.execution_path ?? null,
    estimated_cost_usd_min: input.estimate?.estimated_cost_usd.min ?? null,
    estimated_cost_usd_max: input.estimate?.estimated_cost_usd.max ?? null,
    run_result_status: null,
    failure_reason: null,
    learnable: null,
    decomposition_recommended: input.binding.decomposition_recommended
  };
}
function finalizeExecutionOutcome(record, session, input) {
  const failureReason = resolveFailureReason({
    runRecord: input.run_record,
    failureReason: input.failure_reason,
    signal: input.signal,
    exitCode: input.exit_code
  });
  const runResultStatus = mapRunResultStatus({
    runRecord: input.run_record,
    exitCode: input.exit_code,
    signal: input.signal,
    noOutput: input.no_output,
    failureReason
  });
  return {
    ...record,
    sequence: session.next_sequence,
    recorded_at: input.timestamp,
    run_id: input.run_id ?? input.run_record?.run_id ?? record.run_id,
    run_result_status: runResultStatus,
    failure_reason: failureReason,
    learnable: resolveLearnable(input.run_record, runResultStatus, failureReason)
  };
}
function appendExecutionOutcomeRecord(factoryRoot, record) {
  const artifactPath = path24.join(factoryRoot, EXECUTION_OUTCOME_ARTIFACT);
  fs18.mkdirSync(path24.dirname(artifactPath), { recursive: true });
  fs18.appendFileSync(artifactPath, `${JSON.stringify(record)}
`, "utf-8");
  return artifactPath;
}

// src/lib/run-reader.ts
var fs19 = __toESM(require("fs"));
var path25 = __toESM(require("path"));
init_src();
var RESUMABLE_STATUSES = RESUMABLE_RUN_STATUSES;
function listRuns(runsDir) {
  if (!fs19.existsSync(runsDir))
    return [];
  return fs19.readdirSync(runsDir).filter((f) => f.endsWith(".json") && !f.endsWith("-manifest.json")).sort().reverse().map((filename) => {
    try {
      const raw = fs19.readFileSync(path25.join(runsDir, filename), "utf-8");
      return normalizeRunRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }).filter(Boolean);
}
function getRunById(runsDir, runId) {
  if (!fs19.existsSync(runsDir))
    return null;
  for (const filename of fs19.readdirSync(runsDir).filter((f) => f.endsWith(".json") && !f.endsWith("-manifest.json"))) {
    try {
      const raw = fs19.readFileSync(path25.join(runsDir, filename), "utf-8");
      const run = normalizeRunRecord(JSON.parse(raw));
      if (run?.run_id === runId)
        return run;
    } catch {
    }
  }
  return null;
}
function getResumableRuns(runsDir) {
  return listRuns(runsDir).filter(
    (r) => RESUMABLE_STATUSES.includes(r.status)
  );
}
function formatRunLabel(run) {
  const date = run.start_time ? run.start_time.slice(0, 16).replace("T", " ") : "unknown";
  const taskCount = run.tasks_executed?.length ?? 0;
  const displayStatus = run.unattended_execution?.status ?? run.status;
  return `${run.run_id}  [${displayStatus}]  ${taskCount} task(s)  started ${date}`;
}

// src/commands/run-start.ts
init_task_reader();
var PREFERENCE_ITEMS = VALID_EXECUTION_PREFERENCES.map(
  (pref) => ({
    label: EXECUTION_PREFERENCE_LABELS[pref],
    preference: pref,
    description: pref === "auto" ? "Devory picks the best lane (local-first)" : pref === "prefer_local" ? "Use local model if available, otherwise cloud" : pref === "force_local" ? "Local only \u2014 warn if unavailable or complex" : pref === "allow_cloud" ? "Explicitly permit cloud routing" : pref === "force_cloud" ? "Always use cloud API" : "No model \u2014 deterministic/scripted only"
  })
);
function formatTargetSummary(providerClass, targetId, readiness, adapterId, executionPath) {
  const suffix = readiness ? ` (${readiness.state})` : "";
  const adapterPart = adapterId ? ` -> adapter: ${adapterId}` : "";
  const pathPart = executionPath ? ` [${executionPath}]` : "";
  return targetId !== null ? `Routed to: ${providerClass} -> ${targetId}${adapterPart}${suffix}${pathPart}` : `Routed to: ${providerClass}${adapterPart}${suffix}${pathPart}`;
}
async function runStartCommand(factoryRoot, tasksDir, runtimeRoot, runOutput, controller, onStateChange) {
  const outcomeSession = createExecutionOutcomeSession((/* @__PURE__ */ new Date()).toISOString());
  if (!factoryRoot) {
    vscode16.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const readyTasks = listTasksInStage(tasksDir, "ready");
  let policy;
  try {
    const resolution = resolveRoutingPolicy(factoryRoot);
    policy = resolution.policy;
  } catch {
    runOutput.appendLine(
      "[Devory] \u26A0 Could not load routing-policy config; using defaults."
    );
  }
  const ollamaConfigured = detectOllamaConfigured();
  const ollamaStatus = ollamaConfigured ? "configured" : "not configured";
  const policySummary = policy ? formatRoutingPolicySummary(policy) : "";
  if (policySummary || !ollamaConfigured) {
    const policyNote = policySummary ? `Policy: ${policySummary}` : "Policy: default";
    runOutput.appendLine(
      `[Devory] ${policyNote} \xB7 Ollama: ${ollamaStatus}`
    );
  }
  const cloudAllowed = policy ? policy.cloud_allowed && !policy.local_only : true;
  const baseEnv = process.env;
  const initialRegistry = buildRegistryFromEnvironment(
    baseEnv,
    cloudAllowed
  );
  const initialTargetRegistry = buildProviderTargetRegistry({
    policy,
    provider_registry: initialRegistry,
    env: baseEnv
  });
  const candidateTargetIds = initialTargetRegistry.map((entry) => entry.id);
  const ollamaProbe = await probeOllamaReadiness({
    env: baseEnv,
    timeout_ms: 1200
  });
  const readiness = detectTargetReadiness({
    env: baseEnv,
    policy,
    target_ids: candidateTargetIds,
    configured_target_ids: initialTargetRegistry.filter((entry) => entry.configured).map((entry) => entry.id),
    ollama_probe: ollamaProbe
  });
  const envRegistry = buildRegistryFromEnvironment(
    baseEnv,
    cloudAllowed,
    readiness
  );
  const ollamaReadiness = readiness.provider_classes.local_ollama;
  const cloudReadiness = readiness.provider_classes.cloud_premium;
  if (ollamaReadiness?.state === "configured_but_unverified") {
    runOutput.appendLine("[Devory] Ollama configured but readiness unverified.");
  } else if (ollamaReadiness?.state === "unavailable" && ollamaReadiness.detail) {
    runOutput.appendLine(`[Devory] Ollama unavailable: ${ollamaReadiness.detail}`);
  }
  if (cloudReadiness?.state === "blocked_by_policy") {
    runOutput.appendLine("[Devory] Cloud target blocked by policy.");
  } else if (cloudReadiness?.state === "unavailable" && cloudReadiness.detail) {
    runOutput.appendLine(`[Devory] Cloud target unavailable: ${cloudReadiness.detail}`);
  }
  const taskSources = readyTasks.slice(0, 8).map((task) => {
    try {
      const content = fs20.readFileSync(task.filepath, "utf-8");
      const parsed = parseFrontmatter(content);
      return { meta: parsed.meta, body: parsed.body };
    } catch {
      return {};
    }
  });
  const taskProfiles = taskSources.map((source) => profileTask(source));
  const estimate = estimateDryRunForTaskSources(taskSources, {
    fallback_runner: "local-packaged-runner"
  });
  const estimateCost = `$${estimate.estimated_cost_usd.min.toFixed(2)} - $${estimate.estimated_cost_usd.max.toFixed(2)}`;
  const estimateParts = [
    `Dry Run Estimate: ${estimate.runner}/${estimate.model_display_name}`,
    `context ${estimate.context_tier}`,
    `output ${estimate.output_tier}`,
    `cost estimate ${estimateCost}`,
    `${estimate.confidence} confidence`
  ];
  if (estimate.model_id === null) {
    estimateParts.push("fallback pricing model");
  }
  if (estimate.confidence === "low") {
    estimateParts.push("metadata incomplete");
  }
  const estimateDetail = `${estimateParts.join(" \xB7 ")}.`;
  runOutput.appendLine(`[Devory] ${estimateDetail}`);
  const routingDecisions = taskProfiles.map(
    (profile) => routeExecution(profile, "auto", {
      dryRunEstimate: estimate,
      registry: envRegistry,
      policy
    })
  );
  const routingSummary = summarizeRoutingDecisions(routingDecisions);
  runOutput.appendLine(`[Devory] Routing: ${routingSummary.summary_line}`);
  if (routingDecisions.length > 0) {
    const firstDecision = routingDecisions[0];
    runOutput.appendLine(
      `[Devory] ${formatRoutingDecisionSummary(firstDecision)}`
    );
    if (firstDecision.decomposition_recommended) {
      runOutput.appendLine(
        `[Devory] \u26A0 Decomposition suggested: ${firstDecision.decomposition_note ?? ""}`
      );
    }
    for (const warning of firstDecision.warnings) {
      runOutput.appendLine(`[Devory] \u26A0 ${warning}`);
    }
  }
  if (readyTasks.length > 0) {
    void vscode16.window.showInformationMessage(
      `${estimateDetail} ${routingSummary.summary_line} Estimate only; execution is not blocked.`
    );
  } else {
    void vscode16.window.showInformationMessage(
      `${estimateDetail} No ready tasks found right now; starting a run may complete with no runnable work.`
    );
  }
  const preferenceItems = PREFERENCE_ITEMS.map(
    (item) => ({
      ...item,
      // Mark the current auto-selected provider and policy default in the label
      ...item.preference === "auto" ? {
        description: [
          item.description,
          `currently \u2192 ${routingDecisions[0]?.selected_provider.label ?? "unknown"}`,
          policy && policy.default_preference !== "auto" ? `policy default: ${policy.default_preference}` : null
        ].filter(Boolean).join(" \xB7 ")
      } : {}
    })
  );
  const preferenceSelection = await vscode16.window.showQuickPick(
    preferenceItems,
    {
      title: "Devory: Execution Preference",
      placeHolder: "Select how Devory should route this run (Esc = cancel)",
      canPickMany: false
    }
  );
  if (preferenceSelection === void 0)
    return;
  const chosenPreference = preferenceSelection.preference;
  let finalDecisions = routingDecisions;
  if (chosenPreference !== "auto") {
    finalDecisions = taskProfiles.map(
      (profile) => routeExecution(profile, chosenPreference, {
        dryRunEstimate: estimate,
        registry: envRegistry,
        policy
      })
    );
    const recomputedSummary = summarizeRoutingDecisions(finalDecisions);
    runOutput.appendLine(
      `[Devory] Routing (override: ${EXECUTION_PREFERENCE_LABELS[chosenPreference]}): ${recomputedSummary.summary_line}`
    );
    const firstRecomputed = finalDecisions[0];
    if (firstRecomputed) {
      runOutput.appendLine(
        `[Devory] ${formatRoutingDecisionSummary(firstRecomputed)}`
      );
      for (const warning of firstRecomputed.warnings) {
        runOutput.appendLine(`[Devory] \u26A0 ${warning}`);
      }
    }
  }
  const binding = bindExecution(finalDecisions, chosenPreference, {
    policy,
    task_profiles: taskProfiles,
    task_metas: taskSources.map((source) => source.meta ?? null),
    readiness
  });
  const runTargetSummary = formatTargetSummary(
    binding.selected_provider_class,
    binding.actual_target_id,
    binding.target_resolution ? {
      state: binding.target_readiness_state,
      detail: binding.target_readiness_detail
    } : null,
    binding.actual_adapter_id,
    binding.actual_execution_path
  );
  const taskIds = readyTasks.map((task) => path26.basename(task.filepath, ".md"));
  const baseOutcomeRecord = buildRunStartOutcome(
    outcomeSession,
    {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      task_ids: taskIds,
      task_profiles: taskProfiles,
      binding,
      estimate,
      preference_used: chosenPreference
    },
    null
  );
  let startedOutcomeRecord = null;
  const appendOutcome = (record) => {
    appendExecutionOutcomeRecord(factoryRoot, record);
    runOutput.appendLine(
      `[Devory] Routing outcome recorded: ${record.run_result_status ?? "started"}`
    );
  };
  const appendFinalOutcome = (status, failureReason) => {
    const finalRecord = finalizeExecutionOutcome(baseOutcomeRecord, {
      ...outcomeSession,
      next_sequence: outcomeSession.next_sequence + (startedOutcomeRecord ? 1 : 0)
    }, {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      run_id: startedOutcomeRecord?.run_id ?? null,
      run_record: startedOutcomeRecord?.run_id ? getRunById(path26.join(factoryRoot, "runs"), startedOutcomeRecord.run_id) : null,
      no_output: status === "no-op",
      exit_code: status === "failed" ? 1 : 0,
      signal: status === "cancelled" ? "SIGTERM" : null,
      failure_reason: failureReason
    });
    appendOutcome({
      ...finalRecord,
      run_result_status: status,
      failure_reason: failureReason,
      learnable: status === "completed" ? true : status === "failed" || status === "blocked" || status === "no-op" ? false : null
    });
  };
  runOutput.appendLine(`[Devory] ${runTargetSummary}`);
  if (binding.target_fallback_taken) {
    runOutput.appendLine(
      `[Devory] Fallback: ${binding.target_fallback_reason ?? "preferred concrete target unavailable."}`
    );
  } else if (binding.adapter_fallback_taken || binding.adapter_fallback_reason) {
    runOutput.appendLine(
      `[Devory] Adapter: ${binding.adapter_fallback_reason ?? "adapter fallback taken."}`
    );
  } else if (binding.target_readiness_state === "configured_but_unverified" && binding.target_readiness_detail) {
    runOutput.appendLine(`[Devory] ${binding.target_readiness_detail}`);
  }
  if (binding.policy_effects.some((effect) => effect.toLowerCase().includes("cloud"))) {
    const firstPolicyNote = binding.policy_effects.find(
      (effect) => effect.toLowerCase().includes("cloud")
    );
    if (firstPolicyNote) {
      runOutput.appendLine(`[Devory] Policy note: ${firstPolicyNote}`);
    }
  }
  if (binding.decomposition_recommended) {
    runOutput.appendLine(
      `[Devory] \u26A0 Decomposition: ${binding.decomposition_note ?? "One or more tasks are broad for local execution. Consider splitting first."}`
    );
  }
  if (binding.force_local_violated) {
    const stopMsg = "Force local is selected, but no local provider (Ollama) is available. Start Ollama or switch to a different execution preference.";
    runOutput.appendLine(`[Devory] \u2716 Routing blocked: ${stopMsg}`);
    appendFinalOutcome("blocked", stopMsg);
    const action = await vscode16.window.showWarningMessage(
      `Devory: ${stopMsg}`,
      "Change Preference",
      "Cancel Run"
    );
    if (action !== "Change Preference") {
      return;
    }
    void vscode16.commands.executeCommand("devory.runStart");
    return;
  }
  if (binding.blocked_by_policy) {
    const blockMsg = binding.selected_provider_class === "cloud_premium" && ollamaReadiness?.state === "unavailable" ? "No ready local targets found; cloud escalation is not allowed." : binding.policy_block_reason ?? "Routing policy has blocked this execution path.";
    runOutput.appendLine(`[Devory] \u2716 Policy block: ${blockMsg}`);
    appendFinalOutcome("blocked", blockMsg);
    void vscode16.window.showWarningMessage(
      `Devory: ${blockMsg} Change routing policy or use a different preference.`
    );
    return;
  }
  if (!binding.actual_adapter_id || !binding.actual_execution_path) {
    const stopMsg = binding.adapter_fallback_reason ?? "Preferred target is resolved, but no truthful execution adapter path exists.";
    runOutput.appendLine(`[Devory] \u2716 Adapter block: ${stopMsg}`);
    appendFinalOutcome("blocked", stopMsg);
    void vscode16.window.showWarningMessage(`Devory: ${stopMsg}`);
    return;
  }
  if (binding.cloud_confirmation_required) {
    const confirmMsg = "Cloud execution is selected and requires confirmation per routing policy (require_cloud_confirmation=true).";
    runOutput.appendLine(`[Devory] \u26A0 Cloud confirmation required: ${confirmMsg}`);
    const confirmed = await vscode16.window.showWarningMessage(
      `Devory: ${confirmMsg} Proceed with cloud execution?`,
      "Proceed",
      "Cancel"
    );
    if (confirmed !== "Proceed") {
      appendFinalOutcome("cancelled", "Cloud execution confirmation declined.");
      return;
    }
  }
  const limitStr = await vscode16.window.showInputBox({
    title: "Devory: Start Factory Run",
    prompt: "Max tasks to run (leave blank for no limit)",
    placeHolder: "e.g. 3",
    validateInput: (v) => {
      if (!v.trim())
        return null;
      const n = Number(v);
      return isNaN(n) || n < 1 ? "Enter a positive integer or leave blank" : null;
    }
  });
  if (limitStr === void 0) {
    appendFinalOutcome("cancelled", "Run start cancelled before launch.");
    return;
  }
  const limit = limitStr.trim() ? Number(limitStr.trim()) : void 0;
  runOutput.clear();
  runOutput.appendLine(`[Devory] Starting factory run${limit !== void 0 ? ` (limit: ${limit})` : ""}\u2026`);
  runOutput.appendLine(`[Devory] ${estimateDetail}`);
  runOutput.appendLine(`[Devory] Routing: ${routingSummary.summary_line}`);
  runOutput.appendLine(
    `[Devory] Execution preference: ${EXECUTION_PREFERENCE_LABELS[chosenPreference]}`
  );
  runOutput.appendLine(`[Devory] ${runTargetSummary}`);
  if (binding.target_fallback_taken) {
    runOutput.appendLine(
      `[Devory] Fallback: ${binding.target_fallback_reason ?? "preferred concrete target unavailable."}`
    );
  } else if (binding.adapter_fallback_taken || binding.adapter_fallback_reason) {
    runOutput.appendLine(
      `[Devory] Adapter: ${binding.adapter_fallback_reason ?? "adapter fallback taken."}`
    );
  }
  runOutput.appendLine(`[Devory] ${formatBindingRecord(binding)}`);
  if (binding.fallback_taken) {
    runOutput.appendLine(
      `[Devory] \u26A0 Routing mismatch: intended=${binding.originally_targeted_class ?? "unknown"}, actual=${binding.selected_provider_class}` + (binding.fallback_reason ? ` (${binding.fallback_reason})` : "")
    );
  }
  for (const warning of binding.warnings) {
    if (!warning.toLowerCase().includes("decomposition")) {
      runOutput.appendLine(`[Devory] \u26A0 ${warning}`);
    }
  }
  runOutput.show(true);
  const routingEnv = buildExecutionBindingEnv(binding);
  const started = await controller.start(factoryRoot, runtimeRoot, { limit, routingEnv }, {
    onOutput: (chunk) => runOutput.append(chunk),
    onStateChange,
    onRunId: (runId) => {
      if (startedOutcomeRecord) {
        return;
      }
      startedOutcomeRecord = buildRunStartOutcome(
        {
          ...outcomeSession,
          next_sequence: outcomeSession.next_sequence
        },
        {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          task_ids: taskIds,
          task_profiles: taskProfiles,
          binding,
          estimate,
          preference_used: chosenPreference
        },
        runId
      );
      appendOutcome(startedOutcomeRecord);
    },
    onExit: (result) => {
      const runRecord = startedOutcomeRecord?.run_id ? getRunById(path26.join(factoryRoot, "runs"), startedOutcomeRecord.run_id) : null;
      const finalRecord = finalizeExecutionOutcome(
        startedOutcomeRecord ?? baseOutcomeRecord,
        {
          ...outcomeSession,
          next_sequence: outcomeSession.next_sequence + (startedOutcomeRecord ? 1 : 0)
        },
        {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          run_id: startedOutcomeRecord?.run_id ?? null,
          run_record: runRecord,
          exit_code: result.exitCode,
          signal: result.signal,
          no_output: result.stdout.length === 0 && result.stderr.length === 0,
          failure_reason: result.stderr || result.stdout || null
        }
      );
      appendOutcome(finalRecord);
      if (controller.getState() === "paused") {
        vscode16.window.showInformationMessage(
          "Devory: factory run paused at a safe checkpoint. Use Play to resume."
        );
        return;
      }
      const noOutput = result.stdout.length === 0 && result.stderr.length === 0;
      if (result.exitCode !== 0) {
        vscode16.window.showErrorMessage(
          `Devory: factory run failed (exit ${result.exitCode})
${result.stderr || result.stdout}`
        );
        return;
      }
      if (noOutput) {
        runOutput.append("[Devory] No output received \u2014 no ready tasks detected.\n");
      }
      vscode16.window.showInformationMessage(
        "Devory: factory run completed. Use Devory: Inspect Recent Runs to review the result."
      );
    }
  });
  if (!started.started) {
    appendFinalOutcome("blocked", started.reason);
    vscode16.window.showInformationMessage(`Devory: ${started.reason}`);
  }
}

// src/commands/run-resume.ts
var vscode17 = __toESM(require("vscode"));

// src/lib/run-adapter.ts
var import_child_process = require("child_process");
var path27 = __toESM(require("path"));
function resolvePackagedRunInvocation(factoryRoot, runtimeRoot, args) {
  const runnerEntry = path27.join(runtimeRoot, "packages", "runner", "src", "factory-run.js");
  const runnerArgs = [runnerEntry];
  if (args.resumeId) {
    runnerArgs.push("--resume", args.resumeId);
  }
  if (args.limit !== void 0) {
    runnerArgs.push("--limit", String(args.limit));
  }
  return {
    command: process.execPath,
    args: runnerArgs,
    cwd: factoryRoot,
    env: {
      ...process.env,
      DEVORY_FACTORY_ROOT: factoryRoot,
      DEVORY_RUNTIME_ROOT: runtimeRoot,
      FACTORY_DEFAULT_ENGINE: args.routingEnv?.DEVORY_ADAPTER_INVOCATION_MODE?.trim() || process.env.FACTORY_DEFAULT_ENGINE,
      // Routing binding env vars (from execution binding layer).
      // Injected so the orchestrator can honor the routing decision where supported.
      // Keys are DEVORY_PROVIDER_CLASS, DEVORY_EXECUTION_PATH, etc.
      ...args.routingEnv ?? {}
    }
  };
}
function runPackagedRuntime(invocation, onOutput) {
  return new Promise((resolve6) => {
    const child = (0, import_child_process.spawn)(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: process.platform === "win32"
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout.push(text);
      onOutput?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr.push(text);
      onOutput?.(text);
    });
    child.on("error", (error) => {
      stderr.push(error.message);
      resolve6({ exitCode: 1, signal: null, stdout: stdout.join(""), stderr: stderr.join("") });
    });
    child.on("close", (code, signal) => {
      resolve6({
        exitCode: code ?? 1,
        signal: signal ?? null,
        stdout: stdout.join(""),
        stderr: stderr.join("")
      });
    });
  });
}
async function startFactoryRun(factoryRoot, runtimeRoot, args, runner = runPackagedRuntime, onOutput) {
  const invocation = resolvePackagedRunInvocation(factoryRoot, runtimeRoot, args);
  if (onOutput) {
    const nodeName = path27.basename(invocation.command);
    const runnerFile = path27.basename(invocation.args[0]);
    const runnerFlags = invocation.args.slice(1);
    const cmdDisplay = [nodeName, runnerFile, ...runnerFlags].join(" ");
    onOutput(`[Devory] Workspace: ${factoryRoot}
`);
    onOutput(`[Devory] Runner: ${cmdDisplay}
`);
  }
  const result = await runner(invocation, onOutput);
  const noOutput = result.stdout.length === 0 && result.stderr.length === 0;
  if (onOutput) {
    if (result.signal) {
      onOutput(`[Devory] Process killed by signal ${result.signal}.
`);
    } else {
      onOutput(`[Devory] Exited with code ${result.exitCode}.
`);
    }
    if (result.exitCode === 0 && noOutput) {
      onOutput("[Devory] No output received \u2014 no ready tasks detected.\n");
    }
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: `Devory: ${args.resumeId ? "run resume" : "factory run"} failed (exit ${result.exitCode})
${result.stderr || result.stdout}`,
      stdout: result.stdout,
      stderr: result.stderr,
      noOutput
    };
  }
  return {
    ok: true,
    message: args.resumeId ? `Devory: resumed ${args.resumeId}. Use Devory: Inspect Recent Runs to review progress.` : "Devory: factory run completed. Use Devory: Inspect Recent Runs to review the result.",
    stdout: result.stdout,
    stderr: result.stderr,
    noOutput
  };
}

// src/commands/run-resume.ts
async function runResumeCommand(factoryRoot, runsDir, runtimeRoot, runOutput) {
  if (!factoryRoot) {
    vscode17.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const runs = getResumableRuns(runsDir);
  if (runs.length === 0) {
    vscode17.window.showInformationMessage("Devory: no resumable runs were found.");
    return;
  }
  const pickedRun = await vscode17.window.showQuickPick(
    runs.map((run) => ({
      label: run.run_id,
      description: formatRunLabel(run),
      detail: run.failure?.reason ?? run.unattended_execution?.progress.summary ?? run.unattended_execution?.escalation.summary ?? run.status
    })),
    {
      title: "Devory: Resume Run",
      placeHolder: "Select a run to resume",
      matchOnDescription: true,
      matchOnDetail: true
    }
  );
  if (!pickedRun)
    return;
  runOutput.clear();
  runOutput.appendLine(`[Devory] Resuming run ${pickedRun.label}\u2026`);
  runOutput.show(true);
  const result = await startFactoryRun(
    factoryRoot,
    runtimeRoot,
    { resumeId: pickedRun.label },
    void 0,
    (chunk) => runOutput.append(chunk)
  );
  if (!result.ok) {
    vscode17.window.showErrorMessage(result.message);
  } else {
    vscode17.window.showInformationMessage(result.message);
  }
}

// src/commands/run-pause.ts
var vscode18 = __toESM(require("vscode"));
async function runPauseCommand(controller, runOutput) {
  const paused = controller.pause({ onOutput: (chunk) => runOutput.append(chunk) });
  if (!paused.ok) {
    vscode18.window.showInformationMessage(`Devory: ${paused.reason}`);
    return;
  }
  vscode18.window.showInformationMessage("Devory: pause requested. The run will pause at the next safe checkpoint.");
}

// src/commands/run-stop.ts
var vscode19 = __toESM(require("vscode"));
async function runStopCommand(controller, runOutput) {
  const confirmed = await vscode19.window.showWarningMessage(
    "Stop the active factory run? Devory will ask it to stop at the next safe checkpoint before it falls back to terminating the process.",
    { modal: true },
    "Stop Run"
  );
  if (confirmed !== "Stop Run") {
    return;
  }
  const stopped = controller.stop({ onOutput: (chunk) => runOutput.append(chunk) });
  if (!stopped.ok) {
    vscode19.window.showInformationMessage(`Devory: ${stopped.reason}`);
    return;
  }
  vscode19.window.showInformationMessage("Devory: stop requested. The run will stop at the next safe checkpoint.");
}

// src/commands/run-inspect.ts
var vscode20 = __toESM(require("vscode"));
var path29 = __toESM(require("path"));
var fs22 = __toESM(require("fs"));

// src/lib/agent-context-reader.ts
var fs21 = __toESM(require("fs"));
var path28 = __toESM(require("path"));
function readAgentContextSummary(artifactsDir, taskId) {
  const packetDir = path28.join(artifactsDir, "execution", taskId, "agent-packet");
  const contextPath = path28.join(packetDir, "agent-context.json");
  const doctrinePath = path28.join(packetDir, "doctrine-manifest.json");
  let context = null;
  let doctrine = null;
  try {
    context = JSON.parse(fs21.readFileSync(contextPath, "utf-8"));
  } catch {
  }
  try {
    doctrine = JSON.parse(fs21.readFileSync(doctrinePath, "utf-8"));
  } catch {
    if (context?.doctrine) {
      doctrine = null;
    }
  }
  if (!context && !doctrine)
    return null;
  const routing = context?.engine_routing;
  const contextDoctrine = context?.doctrine;
  return {
    taskId,
    model: routing?.model_display_name ?? routing?.model_id ?? null,
    engine: routing?.engine ?? null,
    doctrineAlwaysLoaded: doctrine?.always_loaded ?? [],
    doctrineConditionallyLoaded: doctrine?.conditionally_loaded ?? [],
    doctrineTotalLoaded: doctrine != null ? doctrine.always_loaded.length + doctrine.conditionally_loaded.filter((c) => c.included).length : contextDoctrine?.total_loaded ?? 0,
    skillsLoaded: [],
    // skill-manifest.json is separate; omit for now
    missingDoctrineFiles: doctrine?.missing_files ?? [],
    productDoctrine: doctrine?.product_doctrine?.file ?? null
  };
}

// src/commands/run-inspect.ts
async function runInspectCommand(runsDir, artifactsDir) {
  if (!runsDir) {
    vscode20.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const runs = listRuns(runsDir).slice(0, 20);
  if (runs.length === 0) {
    vscode20.window.showInformationMessage("Devory: no run records found.");
    return;
  }
  const items = runs.map((run2) => ({
    label: run2.run_id,
    description: `[${run2.status}]  ${run2.tasks_executed?.length ?? 0} task(s)`,
    detail: `started: ${run2.start_time ?? "unknown"}  ended: ${run2.end_time ?? "in progress"}`
  }));
  const picked = await vscode20.window.showQuickPick(items, {
    title: "Devory: Recent Factory Runs",
    placeHolder: "Select a run to inspect",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked)
    return;
  const run = runs.find((r) => r.run_id === picked.label);
  if (!run)
    return;
  const contexts = (run.tasks_executed ?? []).map(
    (t) => artifactsDir ? readAgentContextSummary(artifactsDir, t.task_id) : null
  );
  const panel = vscode20.window.createWebviewPanel(
    "devoryRunInspect",
    `Run: ${run.run_id}`,
    vscode20.ViewColumn.One,
    { enableScripts: true }
  );
  panel.webview.html = buildRunWebviewHtml(run, contexts, runsDir, artifactsDir);
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg.type === "openFolder" && msg.path) {
      vscode20.commands.executeCommand("revealFileInOS", vscode20.Uri.file(msg.path));
    }
    if (msg.type === "openFile" && msg.path) {
      vscode20.workspace.openTextDocument(msg.path).then(
        (doc) => vscode20.window.showTextDocument(doc)
      );
    }
  });
}
function esc2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function statusBadge(status) {
  const color = status === "completed" ? "var(--vscode-testing-iconPassed, #4ec9b0)" : status === "failed" ? "var(--vscode-testing-iconFailed, #f48771)" : status === "paused_for_review" ? "var(--vscode-testing-iconQueued, #cca700)" : "var(--vscode-descriptionForeground)";
  return `<span style="color:${color};font-weight:600">${esc2(status)}</span>`;
}
function buildRunWebviewHtml(run, contexts, runsDir, artifactsDir) {
  const models = [...new Set(contexts.flatMap((c) => c?.model ? [c.model] : []))];
  const modelDisplay = models.length === 0 ? "\u2014" : models.join(", ");
  const doctrineFiles = /* @__PURE__ */ new Set();
  for (const ctx of contexts) {
    if (!ctx)
      continue;
    for (const f of ctx.doctrineAlwaysLoaded)
      doctrineFiles.add(path29.basename(f));
    for (const c of ctx.doctrineConditionallyLoaded) {
      if (c.included)
        doctrineFiles.add(path29.basename(c.file));
    }
    if (ctx.productDoctrine)
      doctrineFiles.add(path29.basename(ctx.productDoctrine));
  }
  const skills = /* @__PURE__ */ new Set();
  for (const ctx of contexts) {
    if (!ctx)
      continue;
    for (const s of ctx.skillsLoaded)
      skills.add(s);
  }
  const runLogPath = path29.join(runsDir, `${run.run_id}.json`);
  const runLogExists = fs22.existsSync(runLogPath);
  const executionDir = artifactsDir ? path29.join(artifactsDir, "execution") : null;
  const executionDirExists = executionDir ? fs22.existsSync(executionDir) : false;
  const taskRows = (run.tasks_executed ?? []).map((t) => {
    const ctx = contexts.find((c) => c?.taskId === t.task_id) ?? null;
    const modelCell = ctx?.model ? esc2(ctx.model) : esc2(t.model_id ?? "\u2014");
    const taskArtifactDir = artifactsDir ? path29.join(artifactsDir, "execution", t.task_id) : null;
    const hasArtifacts = taskArtifactDir ? fs22.existsSync(taskArtifactDir) : false;
    const artifactLink = hasArtifacts ? `<a href="#" class="link" onclick="openFolder('${esc2(taskArtifactDir)}');return false">artifacts</a>` : "";
    return `<tr>
        <td><code>${esc2(t.task_id)}</code></td>
        <td>${statusBadge(t.outcome)}</td>
        <td>${esc2(t.engine ?? "\u2014")}</td>
        <td>${modelCell}</td>
        <td>${artifactLink}</td>
      </tr>`;
  }).join("\n");
  const doctrineItems = doctrineFiles.size > 0 ? [...doctrineFiles].map((f) => `<li>${esc2(f)}</li>`).join("\n") : `<li class="muted">No doctrine files recorded</li>`;
  const skillItems = skills.size > 0 ? [...skills].map((s) => `<li>${esc2(s)}</li>`).join("\n") : `<li class="muted">No skills recorded</li>`;
  const linksHtml = [
    executionDirExists ? `<a href="#" class="link-button" onclick="openFolder('${esc2(executionDir)}');return false">Open Artifact Folder</a>` : `<span class="link-button disabled">Open Artifact Folder</span>`,
    runLogExists ? `<a href="#" class="link-button" onclick="openFile('${esc2(runLogPath)}');return false">Open Run Log</a>` : `<span class="link-button disabled">Open Run Log</span>`
  ].join("\n");
  const failureHtml = run.failure ? `<section>
        <h2>Failure</h2>
        <table>
          <tr><td>Task</td><td><code>${esc2(run.failure.task_id)}</code></td></tr>
          <tr><td>Reason</td><td>${esc2(run.failure.reason)}</td></tr>
          <tr><td>At</td><td>${esc2(run.failure.timestamp ?? "")}</td></tr>
        </table>
      </section>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 32px;
      max-width: 900px;
    }
    h1 {
      font-size: 1.3em;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--vscode-editor-foreground);
    }
    h2 {
      font-size: 1em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin: 28px 0 8px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      padding-bottom: 4px;
    }
    section { margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; }
    td {
      padding: 4px 10px 4px 0;
      vertical-align: top;
      color: var(--vscode-editor-foreground);
    }
    td:first-child {
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      width: 140px;
    }
    th {
      text-align: left;
      padding: 4px 10px 4px 0;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.06));
      padding: 1px 5px;
      border-radius: 3px;
    }
    ul {
      margin: 4px 0;
      padding-left: 20px;
    }
    li { padding: 2px 0; }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
    .link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .link:hover { text-decoration: underline; }
    .link-button {
      display: inline-block;
      margin-right: 10px;
      padding: 5px 12px;
      border-radius: 3px;
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      text-decoration: none;
      cursor: pointer;
      font-size: 0.9em;
      border: 1px solid var(--vscode-widget-border, #555);
    }
    .link-button:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.18)); }
    .link-button.disabled {
      opacity: 0.4;
      cursor: default;
    }
    .tasks-table td:first-child { width: auto; }
  </style>
</head>
<body>
  <h1>Run: <code>${esc2(run.run_id)}</code></h1>

  <section>
    <h2>Run Summary</h2>
    <table>
      <tr><td>Run ID</td><td><code>${esc2(run.run_id)}</code></td></tr>
      <tr><td>Status</td><td>${statusBadge(run.status)}</td></tr>
      <tr><td>Model</td><td>${esc2(modelDisplay)}</td></tr>
      <tr><td>Start</td><td>${esc2(run.start_time ?? "(unknown)")}</td></tr>
      <tr><td>End</td><td>${esc2(run.end_time ?? "(in progress)")}</td></tr>
    </table>
  </section>

  <section>
    <h2>Doctrine Applied</h2>
    <ul>${doctrineItems}</ul>
  </section>

  <section>
    <h2>Skills Used</h2>
    <ul>${skillItems}</ul>
  </section>

  <section>
    <h2>Execution Info</h2>
    <p style="margin:4px 0 10px;color:var(--vscode-descriptionForeground)">
      ${run.tasks_executed?.length ?? 0} task(s) executed
      of ${run.task_queue?.length ?? 0} queued
    </p>
    ${(run.tasks_executed?.length ?? 0) > 0 ? `<table class="tasks-table">
        <thead>
          <tr>
            <th>Task</th><th>Outcome</th><th>Engine</th><th>Model</th><th>Artifacts</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>` : `<p class="muted">No tasks executed.</p>`}
  </section>

  ${failureHtml}

  <section>
    <h2>Links</h2>
    <div style="margin-top:8px">${linksHtml}</div>
  </section>

  <script>
    const vscode = acquireVsCodeApi();
    function openFolder(p) { vscode.postMessage({ type: 'openFolder', path: p }); }
    function openFile(p)   { vscode.postMessage({ type: 'openFile',   path: p }); }
  </script>
</body>
</html>`;
}

// src/commands/routing-outcome-summary.ts
var path30 = __toESM(require("path"));
var vscode21 = __toESM(require("vscode"));

// src/lib/execution-outcome-summary.ts
var fs23 = __toESM(require("fs"));
function asNullableComplexityTier(value) {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}
function asNullableLocalViabilityTier(value) {
  return value === "good" || value === "marginal" || value === "poor" ? value : null;
}
function isObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isExecutionOutcomeResultStatus(value) {
  return value === "completed" || value === "failed" || value === "cancelled" || value === "blocked" || value === "no-op";
}
function asNullableString3(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function asNullableNumber3(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asBoolean4(value) {
  return value === true;
}
function asStringArray4(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
function parseTaskProfileSummary(value) {
  if (!isObject2(value)) {
    return null;
  }
  const totalTasks = typeof value.total_tasks === "number" && Number.isFinite(value.total_tasks) ? value.total_tasks : null;
  const dominantComplexity = asNullableComplexityTier(
    value.dominant_complexity_tier
  );
  const dominantLocalViability = asNullableLocalViabilityTier(
    value.dominant_local_viability
  );
  const decompositionCandidates = typeof value.decomposition_candidates === "number" && Number.isFinite(value.decomposition_candidates) ? value.decomposition_candidates : null;
  const mix = isObject2(value.recommended_provider_mix) ? {
    deterministic: typeof value.recommended_provider_mix.deterministic === "number" && Number.isFinite(value.recommended_provider_mix.deterministic) ? value.recommended_provider_mix.deterministic : 0,
    local: typeof value.recommended_provider_mix.local === "number" && Number.isFinite(value.recommended_provider_mix.local) ? value.recommended_provider_mix.local : 0,
    cloud: typeof value.recommended_provider_mix.cloud === "number" && Number.isFinite(value.recommended_provider_mix.cloud) ? value.recommended_provider_mix.cloud : 0
  } : null;
  if (totalTasks === null && dominantComplexity === null && dominantLocalViability === null && decompositionCandidates === null && mix === null) {
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
      cloud: 0
    }
  };
}
function parseExecutionOutcomeLine(line) {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!isObject2(parsed)) {
      return null;
    }
    const version = asNullableString3(parsed.version);
    const outcomeId = asNullableString3(parsed.outcome_id);
    const recordedAt = asNullableString3(parsed.recorded_at);
    const sequence = typeof parsed.sequence === "number" && Number.isFinite(parsed.sequence) ? parsed.sequence : null;
    if (version !== "execution-outcome-v1" || outcomeId === null || recordedAt === null || sequence === null) {
      return null;
    }
    return {
      version,
      outcome_id: outcomeId,
      sequence,
      recorded_at: recordedAt,
      run_id: asNullableString3(parsed.run_id),
      task_ids: asStringArray4(parsed.task_ids),
      task_profile_summary: parseTaskProfileSummary(parsed.task_profile_summary),
      selected_provider_class: asNullableString3(parsed.selected_provider_class),
      selected_target_id: asNullableString3(parsed.selected_target_id),
      selected_adapter_id: asNullableString3(parsed.selected_adapter_id),
      actual_provider_class: asNullableString3(parsed.actual_provider_class),
      actual_target_id: asNullableString3(parsed.actual_target_id),
      actual_adapter_id: asNullableString3(parsed.actual_adapter_id),
      preference_used: asNullableString3(parsed.preference_used) ?? null,
      fallback_taken: asBoolean4(parsed.fallback_taken),
      fallback_reason: asNullableString3(parsed.fallback_reason),
      readiness_state: asNullableString3(parsed.readiness_state),
      execution_path: asNullableString3(parsed.execution_path),
      estimated_cost_usd_min: asNullableNumber3(parsed.estimated_cost_usd_min),
      estimated_cost_usd_max: asNullableNumber3(parsed.estimated_cost_usd_max),
      run_result_status: isExecutionOutcomeResultStatus(parsed.run_result_status) ? parsed.run_result_status : null,
      failure_reason: asNullableString3(parsed.failure_reason),
      learnable: typeof parsed.learnable === "boolean" ? parsed.learnable : null,
      decomposition_recommended: typeof parsed.decomposition_recommended === "boolean" ? parsed.decomposition_recommended : null
    };
  } catch {
    return null;
  }
}
function readExecutionOutcomeLedger(filePath) {
  if (!fs23.existsSync(filePath)) {
    return { records: [], malformed_lines: 0 };
  }
  const raw = fs23.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const records = [];
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
function incrementCount(counts, key) {
  if (!key)
    return;
  counts[key] = (counts[key] ?? 0) + 1;
}
function sortedCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => {
      const countDelta = right[1] - left[1];
      return countDelta !== 0 ? countDelta : left[0].localeCompare(right[0]);
    })
  );
}
function summarizeReasons(records) {
  const reasonCounts = {};
  for (const record of records) {
    const reason = record.fallback_reason ?? record.failure_reason;
    if (!reason)
      continue;
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  return Object.entries(reasonCounts).sort((left, right) => {
    const countDelta = right[1] - left[1];
    return countDelta !== 0 ? countDelta : left[0].localeCompare(right[0]);
  }).map(([reason, count]) => ({ reason, count })).slice(0, 5);
}
function applySummaryFilters(records, options = {}) {
  let filtered = records;
  if (options.provider_class) {
    filtered = filtered.filter(
      (record) => record.selected_provider_class === options.provider_class || record.actual_provider_class === options.provider_class
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
function summarizeExecutionOutcomes(records, malformedLines = 0, options = {}) {
  const filtered = applySummaryFilters(records, options);
  const selectedProviderCounts = {};
  const actualProviderCounts = {};
  const targetCounts = {};
  const statusCounts = {};
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
    if (record.estimated_cost_usd_min !== null && record.estimated_cost_usd_max !== null) {
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
      max_usd_sum: estimateCount > 0 ? Number(maxUsdSum.toFixed(2)) : null
    }
  };
}
function renderCountSection(title, counts, emptyLabel) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return [title, `  ${emptyLabel}`, ""];
  }
  return [
    title,
    ...entries.map(([label, count]) => `  ${label}: ${count}`),
    ""
  ];
}
function renderExecutionOutcomeSummary(summary, options = {}) {
  const filterParts = [];
  if (options.last_n)
    filterParts.push(`last ${options.last_n}`);
  if (options.provider_class)
    filterParts.push(`provider=${options.provider_class}`);
  if (options.status)
    filterParts.push(`status=${options.status}`);
  if (options.fallback_only)
    filterParts.push("fallback-only");
  if (options.blocked_only)
    filterParts.push("blocked-only");
  const lines = [
    "Devory Routing Outcome Summary",
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
    filterParts.length > 0 ? `Filters: ${filterParts.join(" \xB7 ")}` : "Filters: none",
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
    ...summary.top_reasons.length > 0 ? summary.top_reasons.map(
      ({ reason, count }) => `  ${count}x  ${reason}`
    ) : ["  No fallback or failure reasons recorded"],
    ""
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

// src/commands/routing-outcome-summary.ts
async function routingOutcomeSummaryCommand(factoryRoot, output) {
  if (!factoryRoot) {
    vscode21.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const quickPick = await vscode21.window.showQuickPick(
    [
      { label: "Last 50 records", value: 50 },
      { label: "Last 25 records", value: 25 },
      { label: "Last 100 records", value: 100 },
      { label: "All records", value: 0 }
    ],
    {
      title: "Devory: Show Routing Outcome Summary",
      placeHolder: "Choose how many recent outcome records to summarize"
    }
  );
  if (!quickPick) {
    return;
  }
  const artifactPath = path30.join(factoryRoot, EXECUTION_OUTCOME_ARTIFACT);
  const ledger = readExecutionOutcomeLedger(artifactPath);
  const options = quickPick.value > 0 ? { last_n: quickPick.value } : {};
  const summary = summarizeExecutionOutcomes(
    ledger.records,
    ledger.malformed_lines,
    options
  );
  if (summary.total_records === 0) {
    vscode21.window.showInformationMessage(
      "Devory: no routing outcome records found for the selected summary."
    );
    return;
  }
  output.clear();
  output.appendLine(renderExecutionOutcomeSummary(summary, options));
  output.show(true);
  void vscode21.window.showInformationMessage(
    `Devory: summarized ${summary.total_records} routing outcome record(s).`
  );
}

// src/commands/artifact-inspect.ts
var vscode22 = __toESM(require("vscode"));
var fs24 = __toESM(require("fs"));
var path31 = __toESM(require("path"));
async function artifactInspectCommand(artifactsDir) {
  if (!artifactsDir) {
    vscode22.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  if (!fs24.existsSync(artifactsDir)) {
    vscode22.window.showInformationMessage("Devory: artifacts directory not found.");
    return;
  }
  const files = collectMdFiles(artifactsDir).sort((a, b) => b.localeCompare(a)).slice(0, 50);
  if (files.length === 0) {
    vscode22.window.showInformationMessage("Devory: no artifacts found.");
    return;
  }
  const items = files.map((filepath) => ({
    label: path31.basename(filepath),
    description: path31.relative(artifactsDir, path31.dirname(filepath)),
    detail: filepath
  }));
  const picked = await vscode22.window.showQuickPick(items, {
    title: "Devory: Artifacts",
    placeHolder: "Select an artifact to open",
    matchOnDescription: true
  });
  if (!picked || !picked.detail)
    return;
  const doc = await vscode22.workspace.openTextDocument(picked.detail);
  await vscode22.window.showTextDocument(doc);
}
function collectMdFiles(dir) {
  const results = [];
  try {
    for (const entry of fs24.readdirSync(dir, { withFileTypes: true })) {
      const full = path31.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(full);
      }
    }
  } catch {
  }
  return results;
}

// src/commands/factory-doctor.ts
var vscode23 = __toESM(require("vscode"));
var path34 = __toESM(require("path"));
var import_child_process3 = require("child_process");

// src/lib/find-devory-cli.ts
var import_child_process2 = require("child_process");
var import_util = require("util");
var path32 = __toESM(require("path"));
var fs25 = __toESM(require("fs"));
var execFileAsync = (0, import_util.promisify)(import_child_process2.execFile);
async function findDevoryCli(cwd) {
  const localBin = path32.join(cwd, "node_modules", ".bin", "devory");
  if (fs25.existsSync(localBin)) {
    return localBin;
  }
  const segments = cwd.split(path32.sep);
  for (let i = segments.length - 1; i > 0; i--) {
    const candidate = path32.join(
      segments.slice(0, i).join(path32.sep) || path32.sep,
      "node_modules",
      ".bin",
      "devory"
    );
    if (fs25.existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(whichCmd, ["devory"]);
    const resolved = stdout.trim().split("\n")[0].trim();
    if (resolved) {
      return resolved;
    }
  } catch {
  }
  throw new Error("devory CLI not found");
}

// src/lib/cli-spawn-env.ts
var path33 = __toESM(require("path"));
function uniquePaths(entries) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry))
      continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}
function buildCliSpawnEnv(cwd, cliBin) {
  const pathEntries = uniquePaths([
    path33.join(cwd, "node_modules", ".bin"),
    cliBin ? path33.dirname(cliBin) : "",
    process.env.PATH ?? ""
  ]);
  return {
    ...process.env,
    DEVORY_FACTORY_ROOT: cwd,
    PATH: pathEntries.join(path33.delimiter)
  };
}

// src/commands/factory-doctor.ts
function spawnCommand(bin, args, cwd, onLine) {
  return new Promise((resolve6) => {
    const child = (0, import_child_process3.spawn)(bin, args, {
      cwd,
      env: buildCliSpawnEnv(cwd, bin),
      shell: false
    });
    let buffer = "";
    let hasOutput = false;
    const flush = (chunk) => {
      hasOutput = true;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines)
        onLine(line);
    };
    child.stdout.on("data", (chunk) => flush(chunk.toString()));
    child.stderr.on("data", (chunk) => flush(chunk.toString()));
    child.on("close", (code, signal) => {
      if (buffer)
        onLine(buffer);
      resolve6({ exitCode: code ?? 1, signal: signal ?? null, hasOutput });
    });
    child.on("error", (err) => {
      onLine(`ERROR: ${err.message}`);
      resolve6({ exitCode: 1, signal: null, hasOutput });
    });
  });
}
async function factoryDoctorCommand(factoryRoot, doctorOutput) {
  if (!factoryRoot) {
    vscode23.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  doctorOutput.clear();
  doctorOutput.appendLine("[Devory] Starting doctor diagnostics\u2026");
  doctorOutput.appendLine(`[Devory] Workspace: ${factoryRoot}`);
  doctorOutput.appendLine("[Devory] Resolving CLI (local node_modules \u2192 monorepo walk-up \u2192 PATH)\u2026");
  let bin;
  try {
    bin = await findDevoryCli(factoryRoot);
  } catch {
    doctorOutput.appendLine(
      "[Devory] ERROR: devory CLI not found. Install it globally if you want, add it to your project dependencies, or use the built-in workspace setup where available."
    );
    doctorOutput.show(true);
    vscode23.window.showErrorMessage(
      "Devory Doctor: CLI not found. Install `@devory/cli`, add it to your project, or use built-in setup where supported."
    );
    return;
  }
  const binName = path34.basename(bin);
  doctorOutput.appendLine(`[Devory] CLI: ${bin}`);
  doctorOutput.show(true);
  const onLine = (line) => doctorOutput.appendLine(line);
  doctorOutput.appendLine("");
  doctorOutput.appendLine(`=== ${binName} doctor ===`);
  doctorOutput.appendLine(`[Devory] Running: ${binName} doctor`);
  const result1 = await spawnCommand(bin, ["doctor"], factoryRoot, onLine);
  if (result1.signal) {
    doctorOutput.appendLine(`[Devory] Process killed by signal ${result1.signal}.`);
  } else {
    doctorOutput.appendLine(`[Devory] Exited with code ${result1.exitCode}.`);
  }
  if (!result1.hasOutput) {
    doctorOutput.appendLine("[Devory] No output received from doctor command.");
  }
  doctorOutput.appendLine("");
  doctorOutput.appendLine(`=== ${binName} governance doctor ===`);
  doctorOutput.appendLine(`[Devory] Running: ${binName} governance doctor`);
  const result2 = await spawnCommand(bin, ["governance", "doctor"], factoryRoot, onLine);
  if (result2.signal) {
    doctorOutput.appendLine(`[Devory] Process killed by signal ${result2.signal}.`);
  } else {
    doctorOutput.appendLine(`[Devory] Exited with code ${result2.exitCode}.`);
  }
  if (!result2.hasOutput) {
    doctorOutput.appendLine("[Devory] No output received from governance doctor command.");
  }
  doctorOutput.appendLine("");
  doctorOutput.appendLine(
    result1.exitCode === 0 && result2.exitCode === 0 ? "[Devory] All checks passed." : `[Devory] One or more checks failed (doctor=${result1.exitCode}, governance=${result2.exitCode}).`
  );
}

// src/commands/cloud-connect.ts
var vscode24 = __toESM(require("vscode"));
var path35 = __toESM(require("path"));
var import_child_process4 = require("child_process");
function spawnCommand2(bin, args, cwd, onLine) {
  return new Promise((resolve6) => {
    const child = (0, import_child_process4.spawn)(bin, args, {
      cwd,
      env: buildCliSpawnEnv(cwd, bin),
      shell: false
    });
    let buffer = "";
    const flush = (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines)
        onLine(line);
    };
    child.stdout.on("data", (chunk) => flush(chunk.toString()));
    child.stderr.on("data", (chunk) => flush(chunk.toString()));
    child.on("close", (code) => {
      if (buffer)
        onLine(buffer);
      resolve6(code ?? 1);
    });
    child.on("error", (err) => {
      onLine(`ERROR: ${err.message}`);
      resolve6(1);
    });
  });
}
function spawnLoginAndOpenUrl(bin, cwd, output) {
  return new Promise((resolve6) => {
    const child = (0, import_child_process4.spawn)(bin, ["cloud", "login"], {
      cwd,
      env: buildCliSpawnEnv(cwd, bin),
      shell: false
    });
    let buffer = "";
    let urlOpened = false;
    const handleLine = (line) => {
      output.appendLine(line);
      if (!urlOpened && line.trim().startsWith("https://")) {
        const url = line.trim();
        urlOpened = true;
        void vscode24.env.openExternal(vscode24.Uri.parse(url));
      }
    };
    const flush = (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines)
        handleLine(line);
    };
    child.stdout.on("data", (chunk) => flush(chunk.toString()));
    child.stderr.on("data", (chunk) => flush(chunk.toString()));
    child.on("close", (code) => {
      if (buffer)
        handleLine(buffer);
      resolve6(code ?? 1);
    });
    child.on("error", (err) => {
      handleLine(`ERROR: ${err.message}`);
      resolve6(1);
    });
  });
}
async function cloudConnectCommand(factoryRoot, output) {
  if (!factoryRoot) {
    vscode24.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  output.clear();
  output.appendLine("[Devory] Cloud connect");
  output.appendLine(`[Devory] Workspace: ${factoryRoot}`);
  let bin;
  try {
    bin = await findDevoryCli(factoryRoot);
  } catch {
    output.appendLine("[Devory] ERROR: devory CLI not found.");
    output.show(true);
    vscode24.window.showErrorMessage(
      "Devory Cloud Connect: CLI not found. Install `@devory/cli` or add it to your workspace."
    );
    return;
  }
  output.appendLine(`[Devory] CLI: ${bin}`);
  output.appendLine("");
  output.appendLine(`=== ${path35.basename(bin)} cloud status ===`);
  const statusCode = await spawnCommand2(bin, ["cloud", "status"], factoryRoot, (line) => {
    output.appendLine(line);
  });
  output.appendLine("");
  output.show(true);
  const action = await vscode24.window.showInformationMessage(
    statusCode === 0 ? "Devory cloud status loaded. Start the browser sign-in to connect this workspace." : "Could not read cloud status. You can still start the browser sign-in.",
    "Connect Cloud Account",
    "View Output"
  );
  if (action !== "Connect Cloud Account")
    return;
  output.appendLine("=== devory cloud login ===");
  output.appendLine("[Devory] Starting browser sign-in. Opening approval page\u2026");
  output.show(true);
  const loginCode = await spawnLoginAndOpenUrl(bin, factoryRoot, output);
  if (loginCode === 0) {
    output.appendLine("");
    output.appendLine("[Devory] Cloud login complete.");
    void vscode24.window.showInformationMessage("Devory: Cloud account connected.");
  } else {
    output.appendLine("");
    output.appendLine("[Devory] Cloud login did not complete. See output for details.");
    output.show(true);
  }
}

// src/commands/init-workspace.ts
var vscode25 = __toESM(require("vscode"));
var fs27 = __toESM(require("fs"));
var path37 = __toESM(require("path"));
var import_child_process5 = require("child_process");

// src/lib/seed-starter.ts
var fs26 = __toESM(require("fs"));
var path36 = __toESM(require("path"));
function seedStarterFiles(factoryRoot, runtimeRoot, output) {
  const starterDoctrineDir = path36.join(runtimeRoot, "templates", "starter", "doctrine");
  const starterSkillsDir = path36.join(runtimeRoot, "templates", "starter", "skills");
  const targetDoctrineDir = path36.join(factoryRoot, "doctrine");
  const targetSkillsDir = path36.join(factoryRoot, "skills");
  const seededDoctrine = [];
  const seededSkills = [];
  try {
    let doctrineHasFiles = false;
    try {
      const files = fs26.readdirSync(targetDoctrineDir);
      doctrineHasFiles = files.some((f) => f.endsWith(".md"));
    } catch {
    }
    if (!doctrineHasFiles) {
      const starterFiles = fs26.readdirSync(starterDoctrineDir);
      fs26.mkdirSync(targetDoctrineDir, { recursive: true });
      for (const file of starterFiles) {
        const dest = path36.join(targetDoctrineDir, file);
        if (!fs26.existsSync(dest)) {
          fs26.copyFileSync(path36.join(starterDoctrineDir, file), dest);
          seededDoctrine.push(file);
        }
      }
    }
    let skillsHasContent = false;
    try {
      const entries = fs26.readdirSync(targetSkillsDir, { withFileTypes: true });
      skillsHasContent = entries.filter((e) => e.isDirectory()).some((e) => fs26.existsSync(path36.join(targetSkillsDir, e.name, "SKILL.md")));
    } catch {
    }
    if (!skillsHasContent) {
      const skillDirs = fs26.readdirSync(starterSkillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
      fs26.mkdirSync(targetSkillsDir, { recursive: true });
      for (const skillDir of skillDirs) {
        const destSkillDir = path36.join(targetSkillsDir, skillDir.name);
        const skillMdDest = path36.join(destSkillDir, "SKILL.md");
        if (!fs26.existsSync(skillMdDest)) {
          fs26.mkdirSync(destSkillDir, { recursive: true });
          fs26.copyFileSync(
            path36.join(starterSkillsDir, skillDir.name, "SKILL.md"),
            skillMdDest
          );
          seededSkills.push(skillDir.name);
        }
      }
    }
    output.appendLine(
      `Starter doctrine and skills copied. Doctrine: ${seededDoctrine.length ? seededDoctrine.join(", ") : "(none added)"}. Skills: ${seededSkills.length ? seededSkills.join(", ") : "(none added)"}.`
    );
  } catch {
  }
  return { doctrine: seededDoctrine, skills: seededSkills };
}

// src/commands/init-workspace.ts
var TASK_STAGES2 = ["backlog", "ready", "doing", "review", "done", "blocked", "archived"];
var STANDARDS_TEMPLATE = `# devory.standards.yml
#
# Define what "good" means for your codebase.
# The Devory factory uses these standards as guardrails on every run.

version: "1"

stack:
  language: typescript        # e.g. typescript, javascript, python, go

doctrine:
  testing:
    require_unit: true
    require_integration: true
    coverage_threshold: 80
    avoid_mocking:
      - database
      - filesystem

  architecture:
    max_file_lines: 300
    no_circular_deps: true

  code_style:
    no_any: true
    prefer_explicit_over_clever: true
`;
var TASK_TEMPLATE = `---
id: TASK-ID
title: Short descriptive title
project: your-project-name
repo: .
branch: task/TASK-ID-short-slug
type: feature
priority: medium
status: backlog
agent: fullstack-builder
depends_on: []
files_likely_affected: []
verification:
  - npm run build
  - npm run test
---

## Goal

Describe the business outcome in plain English.

## Context

Relevant background, constraints, and assumptions.

## Acceptance Criteria

- Criterion 1 \u2014 specific, verifiable outcome

## Failure Conditions

- build fails
- tests fail
- acceptance criteria not fully met
`;
var FACTORY_CONTEXT = `# Factory Context

## Purpose

This file defines the context every AI worker loads before performing work in this workspace.

## Doctrine

Doctrine files define the engineering rules every run must follow.
Load all top-level doctrine files by default except \`doctrine/product-philosophy.md\`.

Always load these:

- doctrine/engineering-principles.md
- doctrine/architecture-rules.md
- doctrine/testing-standard.md
- doctrine/workflow-rules.md
- doctrine/common-mistakes.md
- doctrine/code-style.md
- doctrine/task-writing-standard.md
- doctrine/prompt-guidelines.md
- doctrine/documentation-standard.md
- doctrine/database-standard.md
- doctrine/security-philosophy.md
- doctrine/git-workflow-standard.md

Load when relevant:

- doctrine/product-philosophy.md

## Skills

Skills are reusable procedure modules for specific kinds of work.
Activate them from task frontmatter with a \`skills:\` declaration, for example:

  skills: [test-generation]

Starter skills included with this workspace:
- skills/test-generation/SKILL.md    \u2014 write or extend tests for a module
- skills/nextjs-component/SKILL.md   \u2014 create or refactor a Next.js component

Skills live at \`skills/<name>/SKILL.md\` and are loaded after doctrine on every run that requests them.

## Required behavior

All work must:
- follow the standards defined in devory.standards.yml
- aim for the thinnest valuable slice
- include tests where practical
- avoid unrelated scope changes
- remain safe, reviewable, and reversible

## Task lifecycle

Tasks move through: backlog \u2192 ready \u2192 doing \u2192 review \u2192 done
Support stages: blocked, archived
`;
function runBuiltinInit(dir, output) {
  function ensureDir(p) {
    if (!fs27.existsSync(p)) {
      fs27.mkdirSync(p, { recursive: true });
      output.appendLine(`  created  ${path37.relative(dir, p)}/`);
    } else {
      output.appendLine(`  exists   ${path37.relative(dir, p)}/`);
    }
  }
  function writeFile(p, content) {
    if (!fs27.existsSync(p)) {
      fs27.writeFileSync(p, content, "utf8");
      output.appendLine(`  created  ${path37.relative(dir, p)}`);
    } else {
      output.appendLine(`  skipped  ${path37.relative(dir, p)} (already exists)`);
    }
  }
  for (const stage of TASK_STAGES2) {
    ensureDir(path37.join(dir, "tasks", stage));
  }
  ensureDir(path37.join(dir, "runs"));
  ensureDir(path37.join(dir, "artifacts"));
  ensureDir(path37.join(dir, "doctrine"));
  ensureDir(path37.join(dir, "templates"));
  writeFile(path37.join(dir, "FACTORY_CONTEXT.md"), FACTORY_CONTEXT);
  writeFile(path37.join(dir, "templates", "task-template.md"), TASK_TEMPLATE);
  writeFile(path37.join(dir, "devory.standards.yml"), STANDARDS_TEMPLATE);
  const readmePath = path37.join(dir, "README.md");
  if (!fs27.existsSync(readmePath)) {
    writeFile(readmePath, "# Devory Workspace\n\nManaged by [Devory](https://devory.ai).\n");
  } else {
    output.appendLine(`  skipped  README.md (already exists)`);
  }
}
async function initWorkspaceCommand(outputChannel, refreshTaskTree, refreshRunTree, runtimeRoot) {
  const workspaceFolder = vscode25.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode25.window.showErrorMessage(
      "Devory: No workspace folder is open. Please open a folder first."
    );
    return;
  }
  const cwd = workspaceFolder.uri.fsPath;
  outputChannel.show(true);
  outputChannel.appendLine("\u2500".repeat(60));
  outputChannel.appendLine("Devory: Initializing workspace\u2026");
  outputChannel.appendLine(`  cwd : ${cwd}`);
  let cliBin = null;
  try {
    cliBin = await findDevoryCli(cwd);
    outputChannel.appendLine(`  bin : ${cliBin} (CLI found)`);
  } catch {
    outputChannel.appendLine(
      "  bin : not found \u2014 local node_modules/.bin/devory not present, no global devory on PATH; using built-in init"
    );
  }
  outputChannel.appendLine("\u2500".repeat(60));
  if (cliBin) {
    await new Promise((resolve6, reject) => {
      const child = (0, import_child_process5.spawn)(cliBin, ["init"], {
        cwd,
        shell: false,
        env: buildCliSpawnEnv(cwd, cliBin)
      });
      child.stdout.on("data", (chunk) => {
        outputChannel.append(chunk.toString());
      });
      child.stderr.on("data", (chunk) => {
        outputChannel.append(chunk.toString());
      });
      child.on("error", (err) => {
        if (err.code === "ENOENT") {
          vscode25.window.showErrorMessage(
            `Devory: CLI binary not executable at ${cliBin}. Try reinstalling it, using a local project dependency, or using the built-in workspace setup.`
          );
        } else {
          vscode25.window.showErrorMessage(`Devory: init failed \u2014 ${err.message}`);
        }
        reject(err);
      });
      child.on("close", (code) => {
        if (code === 0) {
          outputChannel.appendLine("\u2500".repeat(60));
          outputChannel.appendLine("Devory: Workspace initialized successfully.");
          resolve6();
        } else {
          outputChannel.appendLine("\u2500".repeat(60));
          outputChannel.appendLine(`Devory: init exited with code ${code}.`);
          vscode25.window.showErrorMessage(
            `Devory: init exited with code ${code}. Check the Devory output channel for details.`
          );
          reject(new Error(`devory init exited with code ${code}`));
        }
      });
    }).then(() => finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree)).catch(() => {
    });
  } else {
    try {
      runBuiltinInit(cwd, outputChannel);
      outputChannel.appendLine("\u2500".repeat(60));
      outputChannel.appendLine("Devory: Workspace initialized successfully (built-in).");
      finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`ERROR: ${msg}`);
      outputChannel.appendLine("\u2500".repeat(60));
      vscode25.window.showErrorMessage(`Devory: init failed \u2014 ${msg}`);
    }
  }
}
function finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree) {
  let seededSummary = null;
  if (runtimeRoot) {
    seededSummary = seedStarterFiles(cwd, runtimeRoot, outputChannel);
  }
  refreshTaskTree();
  refreshRunTree();
  const seededSuffix = seededSummary && (seededSummary.doctrine.length > 0 || seededSummary.skills.length > 0) ? ` Starter doctrine: ${seededSummary.doctrine.slice(0, 2).join(", ")}. Starter skills: ${seededSummary.skills.slice(0, 2).join(", ")}. Open Devory: Factory to inspect them.` : "";
  vscode25.window.showInformationMessage(
    `Devory: Workspace initialized. Tasks and run folders are ready.${seededSuffix}`
  );
}

// src/commands/doctrine-create.ts
var path39 = __toESM(require("path"));
var vscode26 = __toESM(require("vscode"));

// src/lib/factory-content.ts
var fs28 = __toESM(require("fs"));
var path38 = __toESM(require("path"));
var DOCTRINE_TEMPLATE = `# Doctrine Title

## Purpose

Describe the durable rule, standard, or philosophy this doctrine file defines.

## Rules

- Rule 1
- Rule 2

## Notes

Add examples, boundaries, or references if they help future authors apply this doctrine consistently.
`;
var SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
var AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
function toFriendlyTitle(name) {
  return name.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function readSkillTemplate(factoryRoot, runtimeRoot) {
  const candidates = [
    path38.join(factoryRoot, "templates", "skill-template.md"),
    runtimeRoot ? path38.join(runtimeRoot, "templates", "skill-template.md") : null
  ].filter((candidate) => candidate !== null);
  for (const candidate of candidates) {
    if (fs28.existsSync(candidate) && fs28.statSync(candidate).isFile()) {
      return fs28.readFileSync(candidate, "utf-8");
    }
  }
  return [
    "---",
    "name: Skill Name Here",
    "version: 1",
    "tags: []",
    "---",
    "",
    "# Skill Name Here",
    "",
    "## When to Use",
    "",
    "This skill applies when the task involves any of the following:",
    "",
    "- [Condition 1 \u2014 be specific]",
    "- [Condition 2 \u2014 be specific]",
    "",
    "## What This Skill Covers",
    "",
    "This skill covers:",
    "",
    "- [Specific pattern or decision covered]",
    "- [Specific procedure or guidance covered]",
    "",
    "## What This Skill Does Not Cover",
    "",
    "- [Excluded topic]: see [doctrine file or other skill]",
    "",
    "## Inputs",
    "",
    "Before following this skill, confirm you have:",
    "",
    "- [Required input 1]",
    "- [Required input 2]",
    "",
    "## Procedure",
    "",
    "1. [First step \u2014 imperative verb, concrete action]",
    "2. [Second step]",
    "3. [Third step]",
    "",
    "## Outputs / Verification",
    "",
    "Expected outputs:",
    "- [Artifact 1]",
    "",
    "Verification:",
    "- [Command or check that confirms correct execution]",
    "",
    "## Common Mistakes",
    "",
    "1. **[Mistake name]** \u2014 [What it looks like and why it is a problem.]",
    "2. **[Mistake name]** \u2014 [What it looks like and why it is a problem.]",
    "3. **[Mistake name]** \u2014 [What it looks like and why it is a problem.]",
    ""
  ].join("\n");
}
function createDoctrineFile(factoryRoot, name) {
  const trimmedName = name.trim().replace(/\\/g, "/");
  if (!trimmedName) {
    return { ok: false, error: "Doctrine file name is required." };
  }
  const filename = trimmedName.endsWith(".md") ? trimmedName : `${trimmedName}.md`;
  if (filename.includes("/") || filename.includes("..")) {
    return { ok: false, error: "Doctrine file name must be a single markdown filename." };
  }
  const doctrineDir = path38.join(factoryRoot, "doctrine");
  const filePath = path38.join(doctrineDir, filename);
  if (fs28.existsSync(filePath)) {
    return { ok: false, error: `Doctrine file already exists: doctrine/${filename}` };
  }
  fs28.mkdirSync(doctrineDir, { recursive: true });
  fs28.writeFileSync(
    filePath,
    DOCTRINE_TEMPLATE.replace("Doctrine Title", toFriendlyTitle(filename.replace(/\.md$/, ""))),
    "utf-8"
  );
  return { ok: true, filePath };
}
function createSkillFile(factoryRoot, skillName, runtimeRoot) {
  const trimmedName = skillName.trim();
  if (!SKILL_NAME_PATTERN.test(trimmedName)) {
    return {
      ok: false,
      error: `Invalid skill name "${skillName}". Expected lowercase kebab-case matching ^[a-z][a-z0-9-]*$`
    };
  }
  const skillDir = path38.join(factoryRoot, "skills", trimmedName);
  const skillFile = path38.join(skillDir, "SKILL.md");
  if (fs28.existsSync(skillDir)) {
    return { ok: false, error: `Skill already exists: skills/${trimmedName}` };
  }
  fs28.mkdirSync(skillDir, { recursive: true });
  fs28.writeFileSync(skillFile, readSkillTemplate(factoryRoot, runtimeRoot), "utf-8");
  return { ok: true, filePath: skillFile };
}
var AGENT_TEMPLATE = `# agent-id

## Purpose
Describe what this agent does and when to use it.

## Input
A task packet with repo, branch, goal, acceptance criteria, and verification commands.

## Output
Code changes, summary, changed file list, verification results.

## Rules
- Follow acceptance criteria strictly
- Run required verification commands
- Do not mark complete if checks fail
- Move task to blocked if a real blocker is found
`;
function createAgentFile(factoryRoot, agentName) {
  const trimmedName = agentName.trim();
  if (!AGENT_NAME_PATTERN.test(trimmedName)) {
    return {
      ok: false,
      error: `Invalid agent name "${agentName}". Expected lowercase kebab-case matching ^[a-z][a-z0-9-]*$`
    };
  }
  const agentsDir = path38.join(factoryRoot, "agents");
  const filePath = path38.join(agentsDir, `${trimmedName}.md`);
  if (fs28.existsSync(filePath)) {
    return { ok: false, error: `Agent already exists: agents/${trimmedName}.md` };
  }
  fs28.mkdirSync(agentsDir, { recursive: true });
  fs28.writeFileSync(filePath, AGENT_TEMPLATE.replace("agent-id", trimmedName), "utf-8");
  return { ok: true, filePath };
}
function archiveDoctrineFile(factoryRoot, filePath) {
  const resolved = path38.resolve(filePath);
  const doctrineDir = path38.join(factoryRoot, "doctrine");
  const archiveDir = path38.join(doctrineDir, "archive");
  const expectedPrefix = `${path38.resolve(doctrineDir)}${path38.sep}`;
  if (!resolved.startsWith(expectedPrefix)) {
    return { ok: false, error: "Only doctrine files inside doctrine/ can be archived." };
  }
  if (!fs28.existsSync(resolved) || !fs28.statSync(resolved).isFile()) {
    return { ok: false, error: `Doctrine file not found: ${resolved}` };
  }
  const archivedPath = path38.join(archiveDir, path38.basename(resolved));
  if (fs28.existsSync(archivedPath)) {
    return {
      ok: false,
      error: `Archive destination already exists: doctrine/archive/${path38.basename(resolved)}`
    };
  }
  fs28.mkdirSync(archiveDir, { recursive: true });
  fs28.renameSync(resolved, archivedPath);
  return { ok: true, archivedPath };
}
function archiveSkillDirectory(factoryRoot, skillMdPath) {
  const resolved = path38.resolve(skillMdPath);
  const skillsDir = path38.join(factoryRoot, "skills");
  const archiveDir = path38.join(skillsDir, "archive");
  const skillDir = path38.dirname(resolved);
  const skillName = path38.basename(skillDir);
  const expectedPrefix = `${path38.resolve(skillsDir)}${path38.sep}`;
  if (!resolved.startsWith(expectedPrefix)) {
    return { ok: false, error: "Only skills inside skills/ can be archived." };
  }
  if (!fs28.existsSync(resolved) || path38.basename(resolved) !== "SKILL.md") {
    return { ok: false, error: `Skill file not found: ${resolved}` };
  }
  const archivedPath = path38.join(archiveDir, skillName);
  if (fs28.existsSync(archivedPath)) {
    return {
      ok: false,
      error: `Archive destination already exists: skills/archive/${skillName}`
    };
  }
  fs28.mkdirSync(archiveDir, { recursive: true });
  fs28.renameSync(skillDir, archivedPath);
  return { ok: true, archivedPath };
}

// src/commands/doctrine-create.ts
async function doctrineCreateCommand(factoryRoot, onChanged) {
  if (!factoryRoot) {
    vscode26.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const filename = await vscode26.window.showInputBox({
    title: "Devory: Create Doctrine File",
    prompt: "Markdown filename inside doctrine/",
    placeHolder: "architecture-rules.md",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed)
        return "Doctrine file name is required";
      if (trimmed.includes("/") || trimmed.includes("\\"))
        return "Use a single filename, not a path";
      if (trimmed.includes(".."))
        return "Doctrine file name cannot contain '..'";
      return null;
    }
  });
  if (!filename)
    return;
  const result = createDoctrineFile(factoryRoot, filename);
  if (!result.ok) {
    vscode26.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }
  onChanged?.();
  const document = await vscode26.workspace.openTextDocument(result.filePath);
  await vscode26.window.showTextDocument(document);
  vscode26.window.showInformationMessage(
    `Devory: created doctrine/${path39.basename(result.filePath)}.`
  );
}

// src/commands/skill-create.ts
var path40 = __toESM(require("path"));
var vscode27 = __toESM(require("vscode"));
async function skillCreateCommand(factoryRoot, runtimeRoot, onChanged) {
  if (!factoryRoot) {
    vscode27.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const skillName = await vscode27.window.showInputBox({
    title: "Devory: Create Skill",
    prompt: "Skill name \u2014 lowercase kebab-case directory under skills/",
    placeHolder: "database-migration",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed)
        return "Skill name is required";
      if (!SKILL_NAME_PATTERN.test(trimmed))
        return "Skill name must match ^[a-z][a-z0-9-]*$";
      return null;
    }
  });
  if (!skillName)
    return;
  const result = createSkillFile(factoryRoot, skillName, runtimeRoot);
  if (!result.ok) {
    vscode27.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }
  onChanged?.();
  const document = await vscode27.workspace.openTextDocument(result.filePath);
  await vscode27.window.showTextDocument(document);
  vscode27.window.showInformationMessage(
    `Devory: created skills/${path40.basename(path40.dirname(result.filePath))}/SKILL.md.`
  );
}

// src/commands/doctrine-archive.ts
var path41 = __toESM(require("path"));
var vscode28 = __toESM(require("vscode"));
async function doctrineArchiveCommand(factoryRoot, filePath, onChanged) {
  const confirmed = await vscode28.window.showWarningMessage(
    `Archive ${path41.basename(filePath)} from active doctrine?`,
    { modal: true },
    "Archive"
  );
  if (confirmed !== "Archive")
    return;
  const result = archiveDoctrineFile(factoryRoot, filePath);
  if (!result.ok) {
    vscode28.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }
  onChanged?.();
  vscode28.window.showInformationMessage(
    `Devory: archived doctrine/${path41.basename(filePath)} to doctrine/archive/.`
  );
}

// src/commands/skill-archive.ts
var path42 = __toESM(require("path"));
var vscode29 = __toESM(require("vscode"));
async function skillArchiveCommand(factoryRoot, skillMdPath, onChanged) {
  const skillName = path42.basename(path42.dirname(skillMdPath));
  const confirmed = await vscode29.window.showWarningMessage(
    `Archive skill ${skillName} from active skills?`,
    { modal: true },
    "Archive"
  );
  if (confirmed !== "Archive")
    return;
  const result = archiveSkillDirectory(factoryRoot, skillMdPath);
  if (!result.ok) {
    vscode29.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }
  onChanged?.();
  vscode29.window.showInformationMessage(
    `Devory: archived skills/${skillName}/ to skills/archive/.`
  );
}

// src/commands/agent-create.ts
var path43 = __toESM(require("path"));
var vscode30 = __toESM(require("vscode"));
async function agentCreateCommand(factoryRoot, onChanged) {
  if (!factoryRoot) {
    vscode30.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const agentName = await vscode30.window.showInputBox({
    title: "Devory: Create Agent",
    prompt: "Agent ID \u2014 lowercase kebab-case, e.g. backend-builder",
    placeHolder: "backend-builder",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed)
        return "Agent name is required";
      if (!AGENT_NAME_PATTERN.test(trimmed))
        return "Agent name must match ^[a-z][a-z0-9-]*$";
      return null;
    }
  });
  if (!agentName)
    return;
  const result = createAgentFile(factoryRoot, agentName);
  if (!result.ok) {
    vscode30.window.showErrorMessage(`Devory: ${result.error}`);
    return;
  }
  onChanged?.();
  const document = await vscode30.workspace.openTextDocument(result.filePath);
  await vscode30.window.showTextDocument(document);
  vscode30.window.showInformationMessage(
    `Devory: created agents/${path43.basename(result.filePath)}.`
  );
}

// src/commands/task-archive.ts
var path44 = __toESM(require("path"));
var vscode31 = __toESM(require("vscode"));
init_task_reader();
var ARCHIVABLE_STAGES = /* @__PURE__ */ new Set(["backlog", "ready", "doing", "review", "blocked"]);
async function taskArchiveCommand(factoryRoot, tasksDir, onMoved, target) {
  if (!factoryRoot || !tasksDir) {
    vscode31.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }
  const directTarget = resolveTaskTarget(tasksDir, target) ?? resolveActiveEditorTask(tasksDir);
  if (directTarget) {
    if (!ARCHIVABLE_STAGES.has(directTarget.stage)) {
      vscode31.window.showInformationMessage("Devory: only active tasks can be archived.");
      return;
    }
    const relPath2 = path44.relative(factoryRoot, directTarget.filepath).replace(/\\/g, "/");
    const result2 = runTaskMoveWorkflow(
      { task: relPath2, to: "archived", label: directTarget.id },
      { factoryRoot, onMoved }
    );
    if (!result2.ok) {
      vscode31.window.showErrorMessage(result2.error);
    } else {
      vscode31.window.showInformationMessage(result2.message);
    }
    return;
  }
  const allTasks = listAllTasks(tasksDir);
  const candidates = [
    ...allTasks.backlog,
    ...allTasks.ready,
    ...allTasks.doing,
    ...allTasks.review,
    ...allTasks.blocked
  ];
  if (candidates.length === 0) {
    vscode31.window.showInformationMessage("Devory: no active tasks are available to archive.");
    return;
  }
  const picked = await vscode31.window.showQuickPick(
    candidates.map((task) => ({
      label: task.id,
      description: `${task.title}  [${task.stage}]`,
      detail: task.filepath
    })),
    {
      title: "Devory: Archive Task",
      placeHolder: "Select a task to archive",
      matchOnDescription: true
    }
  );
  if (!picked?.detail)
    return;
  const relPath = path44.relative(factoryRoot, picked.detail).replace(/\\/g, "/");
  const result = runTaskMoveWorkflow(
    { task: relPath, to: "archived", label: picked.label },
    { factoryRoot, onMoved }
  );
  if (!result.ok) {
    vscode31.window.showErrorMessage(result.error);
  } else {
    vscode31.window.showInformationMessage(result.message);
  }
}

// src/lib/governance-status.ts
var fs29 = __toESM(require("fs"));
var path45 = __toESM(require("path"));
init_feature_flags();
var BINDING_PATH = path45.join(".devory", "governance.json");
var GOVERNANCE_CONFIG_PATH = path45.join(".devory-governance", "config.json");
function asRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  return value;
}
function parseBinding(bindingPath) {
  if (!fs29.existsSync(bindingPath))
    return null;
  const raw = fs29.readFileSync(bindingPath, "utf-8");
  const parsed = asRecord(JSON.parse(raw));
  if (!parsed)
    return null;
  return {
    governance_repo_path: typeof parsed.governance_repo_path === "string" ? parsed.governance_repo_path : void 0,
    workspace_id: typeof parsed.workspace_id === "string" ? parsed.workspace_id : void 0
  };
}
function buildNextStep(snapshot) {
  if (!snapshot.hasFactoryRoot) {
    return "Set devory.factoryRoot to your local Devory workspace path.";
  }
  if (!snapshot.hasBinding) {
    return "Run devory governance bind --governance-repo <path> from your workspace.";
  }
  if (!snapshot.hasGovernanceRepoPath || !snapshot.governanceRepoReachable) {
    return "Ensure .devory/governance.json points to a valid governance repo with .devory-governance/config.json.";
  }
  if (!snapshot.featureFlagEnabled) {
    return "Enable governance mode in .devory/feature-flags.json (governance_repo_enabled: true).";
  }
  return null;
}
function readGovernanceStatus(factoryRoot) {
  if (!factoryRoot || !fs29.existsSync(factoryRoot)) {
    const cloudReadiness = evaluateCloudCommandReadiness(process.env, false);
    return {
      indicator: "OFF",
      governanceModeOn: false,
      factoryRoot,
      featureFlagEnabled: false,
      governanceRepoPath: null,
      governanceRepoReachable: false,
      workspaceId: null,
      cloudReadiness,
      nextStep: buildNextStep({
        hasFactoryRoot: false,
        featureFlagEnabled: false,
        hasBinding: false,
        hasGovernanceRepoPath: false,
        governanceRepoReachable: false
      }),
      errorMessage: null
    };
  }
  try {
    const featureFlags = loadFeatureFlags(factoryRoot);
    const featureFlagEnabled = featureFlags.flags.governance_repo_enabled;
    const bindingPath = path45.join(factoryRoot, BINDING_PATH);
    const binding = parseBinding(bindingPath);
    const governanceRepoPath = binding?.governance_repo_path?.trim() || null;
    const workspaceId = binding?.workspace_id?.trim() || null;
    const governanceRepoReachable = governanceRepoPath !== null && fs29.existsSync(path45.join(governanceRepoPath, GOVERNANCE_CONFIG_PATH));
    const governanceModeOn = featureFlagEnabled && binding !== null && governanceRepoReachable;
    const cloudReadiness = evaluateCloudCommandReadiness(process.env, governanceModeOn);
    return {
      indicator: governanceModeOn ? "ON" : "OFF",
      governanceModeOn,
      factoryRoot,
      featureFlagEnabled,
      governanceRepoPath,
      governanceRepoReachable,
      workspaceId,
      cloudReadiness,
      nextStep: buildNextStep({
        hasFactoryRoot: true,
        featureFlagEnabled,
        hasBinding: binding !== null,
        hasGovernanceRepoPath: governanceRepoPath !== null,
        governanceRepoReachable
      }),
      errorMessage: null
    };
  } catch (error) {
    const cloudReadiness = evaluateCloudCommandReadiness(process.env, false);
    return {
      indicator: "ERROR",
      governanceModeOn: false,
      factoryRoot,
      featureFlagEnabled: false,
      governanceRepoPath: null,
      governanceRepoReachable: false,
      workspaceId: null,
      cloudReadiness,
      nextStep: "Run Devory: Show Governance Status for details.",
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}
function formatGovernanceStatusBarText(snapshot) {
  if (snapshot.indicator === "ERROR")
    return "Governance: ERROR";
  if (snapshot.indicator === "ON") {
    if (snapshot.workspaceId) {
      return `Governance: ON (${snapshot.workspaceId})`;
    }
    return "Governance: ON";
  }
  return "Governance: OFF";
}
function formatGovernanceStatusSummary(snapshot) {
  const lines = [];
  lines.push(`Governance mode: ${snapshot.indicator}`);
  lines.push(
    `Governance repo path: ${snapshot.governanceRepoPath ?? "(not configured)"}`
  );
  lines.push(`Workspace ID: ${snapshot.workspaceId ?? "(not configured)"}`);
  lines.push(formatCloudCommandReadinessLine(snapshot.cloudReadiness));
  if (snapshot.errorMessage) {
    lines.push(`Error: ${snapshot.errorMessage}`);
  }
  if (snapshot.nextStep) {
    lines.push(`Next step: ${snapshot.nextStep}`);
  }
  return lines.join("\n");
}

// src/lib/task-paths.ts
var path46 = __toESM(require("node:path"));
function resolveTasksDir(factoryRoot) {
  const snapshot = readGovernanceStatus(factoryRoot);
  if (snapshot.governanceModeOn && snapshot.governanceRepoPath) {
    return path46.join(snapshot.governanceRepoPath, "tasks");
  }
  return getFactoryPaths(factoryRoot).tasksDir;
}

// src/extension.ts
init_task_reader();

// src/lib/post-commit-handoff.ts
function selectFirstCommittedTask(committed) {
  if (committed.length === 0)
    return null;
  const byOrder = [...committed].sort((a, b) => a.commitIndex - b.commitIndex);
  const ready = byOrder.find((entry) => entry.stage === "ready");
  if (ready)
    return ready;
  const backlog = byOrder.find((entry) => entry.stage === "backlog");
  if (backlog)
    return backlog;
  return byOrder[0] ?? null;
}
function buildPostCommitActions(stage) {
  const runDetail = stage === "backlog" ? "Promote the selected backlog task, then start a run." : stage === "ready" ? "Start a run using existing ready-task execution." : "Open the selected task first, then move it to ready before running.";
  return [
    {
      id: "run-first-task",
      label: "Run first task",
      detail: runDetail
    },
    {
      id: "reveal-task",
      label: "Reveal in Task Explorer",
      detail: "Focus the selected task in the tree and update task context."
    },
    {
      id: "open-show-work",
      label: "Open Show Work",
      detail: "Open the execution status panel (available without starting a run)."
    }
  ];
}

// src/lib/bootstrap.ts
var vscode32 = __toESM(require("vscode"));
var cp = __toESM(require("child_process"));
var STATE_KEY = "devory.firstRunCompleted";
function shouldShowBootstrap(context, workspaceInitialized) {
  if (context.globalState.get(STATE_KEY))
    return false;
  if (workspaceInitialized) {
    void context.globalState.update(STATE_KEY, true);
    return false;
  }
  return true;
}
function markFirstRunComplete(context) {
  void context.globalState.update(STATE_KEY, true);
}
async function checkAndLogCliReadiness(cwd, output) {
  output.appendLine("[Devory] Checking environment\u2026");
  output.appendLine(`[Devory]   Workspace : ${cwd}`);
  output.appendLine(
    "[Devory] Checking CLI locations (local node_modules \u2192 monorepo walk-up \u2192 PATH)\u2026"
  );
  let cliPath = null;
  let cliVersion = null;
  try {
    cliPath = await findDevoryCli(cwd);
  } catch {
  }
  if (cliPath) {
    output.appendLine(`[Devory]   Found CLI at : ${cliPath}`);
    cliVersion = await probeCliVersion(cwd, cliPath);
    if (cliVersion) {
      output.appendLine(`[Devory]   CLI verified : version ${cliVersion}`);
    } else {
      output.appendLine(
        "[Devory]   CLI found but --version probe failed \u2014 will proceed anyway"
      );
    }
    output.appendLine("[Devory] Environment ready.");
  } else {
    output.appendLine(
      "[Devory]   CLI not found in local node_modules, monorepo parents, or PATH"
    );
    output.appendLine(
      "[Devory]   Built-in initialization will be used \u2014 no manual install required"
    );
  }
  return { cliPath, cliVersion };
}
function probeCliVersion(cwd, cliPath) {
  return new Promise((resolve6) => {
    let settled = false;
    const finish = (v) => {
      if (!settled) {
        settled = true;
        resolve6(v);
      }
    };
    const child = cp.spawn(cliPath, ["--version"], {
      shell: false,
      env: buildCliSpawnEnv(cwd, cliPath)
    });
    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      buf += chunk.toString();
    });
    child.on("close", () => {
      finish(buf.trim().split("\n")[0].trim() || null);
    });
    child.on("error", () => finish(null));
    setTimeout(() => {
      finish(null);
      try {
        child.kill();
      } catch {
      }
    }, 5e3);
  });
}
async function runBootstrapFlow(context, cwd, output, runInit) {
  await checkAndLogCliReadiness(cwd, output);
  const action = await vscode32.window.showInformationMessage(
    "Welcome to Devory! Your workspace isn't set up yet.",
    "Initialize Workspace",
    "Show Setup Log"
  );
  if (action === "Initialize Workspace") {
    output.show(true);
    await runInit();
  } else if (action === "Show Setup Log") {
    output.show(true);
    const followUp = await vscode32.window.showInformationMessage(
      "Ready to initialize your Devory workspace?",
      "Initialize Workspace"
    );
    if (followUp === "Initialize Workspace") {
      await runInit();
    }
  }
}

// src/commands/cleanup.ts
var vscode33 = __toESM(require("vscode"));

// src/lib/stored-data.ts
var fs30 = __toESM(require("fs"));
var path47 = __toESM(require("path"));
var FIRST_RUN_STATE_KEY = "devory.firstRunCompleted";
function safeStat(targetPath) {
  try {
    return fs30.statSync(targetPath);
  } catch {
    return null;
  }
}
function pathExists(targetPath) {
  return safeStat(targetPath) !== null;
}
function isDirectory(targetPath) {
  return safeStat(targetPath)?.isDirectory() ?? false;
}
function isFile(targetPath) {
  return safeStat(targetPath)?.isFile() ?? false;
}
function getDirectorySize(targetPath) {
  const stat = safeStat(targetPath);
  if (!stat)
    return 0;
  if (stat.isFile())
    return stat.size;
  if (!stat.isDirectory())
    return 0;
  let total = 0;
  for (const entry of fs30.readdirSync(targetPath, { withFileTypes: true })) {
    const childPath = path47.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySize(childPath);
    } else if (entry.isFile()) {
      total += safeStat(childPath)?.size ?? 0;
    }
  }
  return total;
}
function makeDirectoryEntry(id, label, targetPath, usage, classification, canSweep, cleanupNote) {
  const exists = pathExists(targetPath);
  return {
    id,
    label,
    location: targetPath,
    usage,
    classification,
    exists,
    sizeBytes: exists ? getDirectorySize(targetPath) : 0,
    canSweep,
    cleanupNote
  };
}
function makeMementoEntry(id, label, usage, hasValue, canSweep, cleanupNote) {
  return {
    id,
    label,
    location: "Managed by VS Code (no stable file path exposed)",
    usage,
    classification: "SAFE_TO_DELETE",
    exists: hasValue,
    sizeBytes: null,
    canSweep,
    cleanupNote
  };
}
function buildProjectEntries(factoryRoot) {
  if (!factoryRoot)
    return [];
  const directoryEntries = [
    ["tasks", "Task files and lifecycle queues"],
    ["runs", "Run records and execution outputs stored in the workspace"],
    ["artifacts", "Generated artifacts stored in the workspace"],
    ["doctrine", "Doctrine files authored for the project"],
    ["skills", "Skill definitions authored for the project"],
    ["templates", "Project templates and scaffolding"],
    [".devory", "Project-local Devory config and governance state"],
    [".devory-governance", "Governance repo data stored with the project"]
  ];
  const fileEntries = [
    ["FACTORY_CONTEXT.md", "Project factory context file"],
    ["devory.standards.yml", "Project standards definition"]
  ];
  const entries = [];
  for (const [subpath, usage] of directoryEntries) {
    const targetPath = path47.join(factoryRoot, subpath);
    if (!isDirectory(targetPath))
      continue;
    entries.push(
      makeDirectoryEntry(
        `project:${subpath}`,
        subpath,
        targetPath,
        usage,
        "PROJECT_DATA",
        false,
        "Project data. This tool will never delete it."
      )
    );
  }
  for (const [filename, usage] of fileEntries) {
    const targetPath = path47.join(factoryRoot, filename);
    if (!isFile(targetPath))
      continue;
    entries.push({
      id: `project:${filename}`,
      label: filename,
      location: targetPath,
      usage,
      classification: "PROJECT_DATA",
      exists: true,
      sizeBytes: safeStat(targetPath)?.size ?? 0,
      canSweep: false,
      cleanupNote: "Project data. This tool will never delete it."
    });
  }
  return entries;
}
async function collectStoredDataLocations(context, factoryRoot) {
  const firstRunCompleted = context.globalState.get(FIRST_RUN_STATE_KEY) === true;
  const entries = [
    makeMementoEntry(
      "global-state:first-run",
      "VS Code global state",
      "Stores the first-run completion flag for Devory onboarding.",
      firstRunCompleted,
      firstRunCompleted,
      firstRunCompleted ? "Clears the stored first-run flag." : "No Devory first-run flag is currently stored."
    ),
    makeDirectoryEntry(
      "local:global-storage",
      "Extension global storage",
      context.globalStorageUri.fsPath,
      "Machine-local extension storage owned by VS Code for Devory.",
      "SAFE_TO_DELETE",
      true,
      "Deletes extension-owned files in global storage."
    )
  ];
  if (context.storageUri) {
    entries.push(
      makeDirectoryEntry(
        "local:workspace-storage",
        "Workspace extension storage",
        context.storageUri.fsPath,
        "Workspace-scoped extension storage owned by VS Code for Devory.",
        "SAFE_TO_DELETE",
        true,
        "Deletes workspace-scoped extension-owned files."
      )
    );
  }
  if (context.logUri) {
    entries.push(
      makeDirectoryEntry(
        "local:logs",
        "Extension log directory",
        context.logUri.fsPath,
        "Extension log files and diagnostic output owned by VS Code for Devory.",
        "SAFE_TO_DELETE",
        true,
        "Deletes extension log files."
      )
    );
  }
  entries.push({
    id: "unknown:factory-root-setting",
    label: "Configured factory root setting",
    location: "VS Code settings (user or workspace settings.json)",
    usage: "Tells Devory which folder to treat as the workspace root.",
    classification: "UNKNOWN",
    exists: true,
    sizeBytes: null,
    canSweep: false,
    cleanupNote: "User-owned configuration. Not cleared by this tool."
  });
  return [...entries, ...buildProjectEntries(factoryRoot)];
}
function formatBytes(bytes) {
  if (bytes === null)
    return "size not measured";
  if (bytes < 1024)
    return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
function getSweepableLocations(locations) {
  return locations.filter((location) => location.classification === "SAFE_TO_DELETE");
}
function getSweepSummaryBytes(locations) {
  return locations.reduce((total, location) => total + (location.sizeBytes ?? 0), 0);
}
async function sweepStoredData(context, locations) {
  const cleared = [];
  const skipped = [];
  for (const location of locations) {
    if (!location.canSweep || location.classification !== "SAFE_TO_DELETE") {
      skipped.push(location);
      continue;
    }
    if (location.id === "global-state:first-run") {
      await context.globalState.update(FIRST_RUN_STATE_KEY, void 0);
      cleared.push(location);
      continue;
    }
    if (location.location === "Managed by VS Code (no stable file path exposed)") {
      skipped.push(location);
      continue;
    }
    fs30.rmSync(location.location, { recursive: true, force: true });
    cleared.push(location);
  }
  return { cleared, skipped };
}
function formatClassification(classification) {
  switch (classification) {
    case "SAFE_TO_DELETE":
      return "SAFE TO DELETE";
    case "PROJECT_DATA":
      return "PROJECT DATA \u2014 DO NOT DELETE";
    case "UNKNOWN":
      return "UNKNOWN / NOT CLEARED BY THIS TOOL";
  }
}

// src/commands/cleanup.ts
function describeSweepableLocation(location) {
  const parts = [location.usage];
  if (location.sizeBytes !== null) {
    parts.push(`About ${formatBytes(location.sizeBytes)}`);
  }
  if (!location.exists) {
    parts.push("Nothing stored right now");
  }
  return parts.join("  ");
}
function renderStoredDataReport(locations, factoryRoot) {
  const lines = [
    "Devory Stored Data Locations",
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
    "",
    "Devory stores most working files as project data in your factory/workspace.",
    "This command only clears local extension data owned by the VS Code extension.",
    "Project folders such as tasks, artifacts, doctrine, skills, templates,",
    ".devory, and .devory-governance are never deleted by this tool.",
    "",
    "SAFE TO DELETE      = owned by the Devory extension. No project files.",
    "PROJECT DATA        = lives in your workspace. This tool will not touch it.",
    "UNKNOWN             = not cleared by this tool.",
    "",
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
    ""
  ];
  if (factoryRoot) {
    lines.push(`Factory root: ${factoryRoot}`);
    lines.push("");
  }
  for (const location of locations) {
    lines.push(`[${formatClassification(location.classification)}]  ${location.label}`);
    lines.push(`  Path    : ${location.location}`);
    lines.push(`  Use     : ${location.usage}`);
    if (location.sizeBytes !== null) {
      lines.push(`  Size    : ${formatBytes(location.sizeBytes)}`);
    }
    lines.push(`  Exists  : ${location.exists ? "yes" : "no"}`);
    lines.push(`  Cleanup : ${location.cleanupNote}`);
    lines.push("");
  }
  lines.push("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  lines.push("");
  lines.push("What Devory WILL delete (via Sweep the Workshop):");
  lines.push("  \u2022 VS Code global state flag (devory.firstRunCompleted)");
  lines.push("  \u2022 Extension global storage folder");
  lines.push("  \u2022 Workspace extension storage folder (if present)");
  lines.push("  \u2022 Extension log directory (if present)");
  lines.push("");
  lines.push("What Devory will NEVER delete:");
  lines.push("  \u2022 tasks/, runs/, artifacts/, doctrine/, skills/, templates/");
  lines.push("  \u2022 .devory/, .devory-governance/");
  lines.push("  \u2022 FACTORY_CONTEXT.md, devory.standards.yml");
  lines.push("  \u2022 Any file that could reasonably be committed to git");
  lines.push("  \u2022 Anything in your workspace or git repository");
  lines.push("");
  lines.push("To remove project data: delete it manually from your repo.");
  return lines.join("\n");
}
async function promptForSweepTargets(safeLocations) {
  const picks = safeLocations.map((location) => ({
    label: location.label,
    description: describeSweepableLocation(location),
    detail: location.location,
    picked: location.exists || location.id === "global-state:first-run",
    location
  }));
  const selected = await vscode33.window.showQuickPick(picks, {
    title: "Devory: Sweep the Workshop \u2014 Select Items to Clear",
    placeHolder: "Only Local Extension Data is listed here. Project data is not shown and will not be touched.",
    canPickMany: true
  });
  return selected?.map((pick) => pick.location);
}
async function showStoredDataLocationsCommand(context, factoryRoot, output) {
  const locations = await collectStoredDataLocations(context, factoryRoot);
  output.clear();
  output.appendLine(renderStoredDataReport(locations, factoryRoot));
  output.show(true);
}
async function sweepWorkshopCommand(context, factoryRoot, output) {
  const locations = await collectStoredDataLocations(context, factoryRoot);
  const safeLocations = getSweepableLocations(locations);
  const reclaimableBytes = getSweepSummaryBytes(safeLocations);
  const action = await vscode33.window.showQuickPick(
    [
      {
        label: "Devory stores most working files as project data in your factory/workspace.",
        kind: vscode33.QuickPickItemKind.Separator,
        actionId: "cancel"
      },
      {
        label: "This command only clears local extension data owned by the VS Code extension.",
        kind: vscode33.QuickPickItemKind.Separator,
        actionId: "cancel"
      },
      {
        label: "Project folders (tasks, artifacts, doctrine, skills, templates, .devory, .devory-governance) are never deleted by this tool.",
        kind: vscode33.QuickPickItemKind.Separator,
        actionId: "cancel"
      },
      {
        label: "Sweep Local Extension Data",
        description: reclaimableBytes > 0 ? `Clear about ${formatBytes(reclaimableBytes)} of extension-owned data` : "Clear extension-owned data and reset Devory local state",
        detail: "Clears VS Code extension storage, global state flags, and log files. Your workspace, tasks, doctrine, skills, and all project files will not be touched.",
        actionId: "sweep"
      },
      {
        label: "View Stored Data Locations",
        description: "Show all paths, purpose, and safety labels",
        detail: "Lists every location Devory uses, labeled as Local Extension Data, Project Data, or Unknown. Nothing is deleted.",
        actionId: "view"
      },
      {
        label: "Cancel",
        actionId: "cancel"
      }
    ],
    {
      title: "Devory: Sweep the Workshop",
      placeHolder: "Choose an action"
    }
  );
  if (!action || action.actionId === "cancel")
    return;
  if (action.actionId === "view") {
    await showStoredDataLocationsCommand(context, factoryRoot, output);
    return;
  }
  const selectedLocations = await promptForSweepTargets(safeLocations);
  if (!selectedLocations || selectedLocations.length === 0)
    return;
  const summary = selectedLocations.map((location) => `\u2022 ${location.label}`).join("\n");
  const confirmed = await vscode33.window.showWarningMessage(
    [
      "This clears only Local Extension Data.",
      "",
      summary,
      "",
      "Devory stores most working files as project data in your factory/workspace.",
      "This command only clears local extension data owned by the VS Code extension.",
      "Project folders such as tasks, artifacts, doctrine, skills, templates,",
      ".devory, and .devory-governance are never deleted by this tool."
    ].join("\n"),
    { modal: true },
    "Sweep"
  );
  if (confirmed !== "Sweep")
    return;
  const result = await sweepStoredData(context, selectedLocations);
  const clearedSummary = result.cleared.length ? result.cleared.map((location) => location.label).join(", ") : "Nothing was cleared";
  await showStoredDataLocationsCommand(context, factoryRoot, output);
  void vscode33.window.showInformationMessage(`Sweep complete. Cleared: ${clearedSummary}.`);
}
async function cleanupLocalDataCommand(context, factoryRoot = "", output) {
  const cleanupOutput = output ?? vscode33.window.createOutputChannel("Devory: Storage");
  await sweepWorkshopCommand(context, factoryRoot, cleanupOutput);
}

// src/lib/run-controller.ts
var import_child_process6 = require("child_process");
init_src();
function defaultSpawn(invocation) {
  return (0, import_child_process6.spawn)(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    shell: process.platform === "win32"
  });
}
var RunController = class {
  constructor(spawnProcess = defaultSpawn) {
    this.spawnProcess = spawnProcess;
  }
  child = null;
  state = "idle";
  stdout = "";
  stderr = "";
  factoryRoot = null;
  runtimeRoot = null;
  pausedRunId = null;
  activeRunId = null;
  getState() {
    return this.state;
  }
  isActive() {
    return this.state === "running";
  }
  canPause() {
    return this.state === "running";
  }
  canResume() {
    return this.state === "paused" && this.pausedRunId !== null;
  }
  async start(factoryRoot, runtimeRoot, args, hooks = {}) {
    if (this.isActive()) {
      return { started: false, reason: "A factory run is already active." };
    }
    clearLocalRunControl(factoryRoot);
    this.factoryRoot = factoryRoot;
    this.runtimeRoot = runtimeRoot;
    this.activeRunId = null;
    this.pausedRunId = null;
    this.stdout = "";
    this.stderr = "";
    const invocation = resolvePackagedRunInvocation(factoryRoot, runtimeRoot, args);
    hooks.onOutput?.(`[Devory] Workspace: ${factoryRoot}
`);
    hooks.onOutput?.(`[Devory] Runner: ${[process.execPath.split(/[\\/]/).pop(), ...invocation.args.map((value) => value.split(/[\\/]/).pop() ?? value)].join(" ")}
`);
    const child = this.spawnProcess(invocation);
    this.child = child;
    this.setState("running", hooks);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      this.stdout += text;
      this.captureRunId(factoryRoot, text, hooks);
      hooks.onOutput?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      this.stderr += text;
      hooks.onOutput?.(text);
    });
    child.on("close", (code, signal) => {
      hooks.onOutput?.(
        signal ? `[Devory] Process killed by signal ${signal}.
` : `[Devory] Exited with code ${code ?? 1}.
`
      );
      const result = {
        exitCode: code ?? 1,
        signal: signal ?? null,
        stdout: this.stdout,
        stderr: this.stderr
      };
      const controlState = this.factoryRoot ? readLocalRunControl(this.factoryRoot) : null;
      const pausedByOperator = controlState?.acknowledged_action === "pause" && controlState.run_id !== null;
      this.child = null;
      this.activeRunId = null;
      if (pausedByOperator) {
        this.pausedRunId = controlState?.run_id ?? null;
        this.setState("paused", hooks);
      } else {
        this.pausedRunId = null;
        this.setState("idle", hooks);
      }
      hooks.onExit?.(result);
    });
    child.on("error", (error) => {
      this.stderr += `${error.message}
`;
      hooks.onOutput?.(`[Devory] Run failed unexpectedly: ${error.message}
`);
    });
    return { started: true };
  }
  pause(hooks = {}) {
    if (!this.child || this.state !== "running") {
      return { ok: false, reason: "No running factory run is active." };
    }
    if (!this.factoryRoot) {
      return { ok: false, reason: "Factory root is not available for the active run." };
    }
    updateLocalRunControl(this.factoryRoot, (current) => ({
      run_id: current?.run_id ?? this.activeRunId,
      requested_action: "pause",
      acknowledged_action: null
    }));
    hooks.onOutput?.("[Devory] Pause requested. The run will pause at the next safe checkpoint.\n");
    return { ok: true };
  }
  async resume(hooks = {}) {
    if (this.state !== "paused" || !this.pausedRunId) {
      return { ok: false, reason: "No paused factory run is available to resume." };
    }
    if (!this.factoryRoot || !this.runtimeRoot) {
      return { ok: false, reason: "Factory runtime is not available for resume." };
    }
    const runId = this.pausedRunId;
    const started = await this.start(this.factoryRoot, this.runtimeRoot, { resumeId: runId }, hooks);
    if (!started.started) {
      return { ok: false, reason: started.reason };
    }
    hooks.onOutput?.(`[Devory] Resuming run ${runId}.
`);
    return { ok: true };
  }
  stop(hooks = {}) {
    if (!this.child || !this.isActive()) {
      return { ok: false, reason: "No active factory run is available to stop." };
    }
    if (!this.factoryRoot) {
      return { ok: false, reason: "Factory root is not available for the active run." };
    }
    updateLocalRunControl(this.factoryRoot, (current) => ({
      run_id: current?.run_id ?? this.activeRunId,
      requested_action: "stop",
      acknowledged_action: null
    }));
    hooks.onOutput?.("[Devory] Stop requested. The run will stop at the next safe checkpoint.\n");
    return { ok: true };
  }
  captureRunId(factoryRoot, text, hooks) {
    const match = text.match(/\[orchestrator\] (?:Created run|Resuming run): ([^\s]+)/);
    if (!match) {
      return;
    }
    const runId = match[1] ?? null;
    if (!runId) {
      return;
    }
    if (this.activeRunId === runId) {
      return;
    }
    this.activeRunId = runId;
    updateLocalRunControl(factoryRoot, (current) => ({
      run_id: runId,
      requested_action: current?.requested_action ?? null,
      acknowledged_action: current?.acknowledged_action ?? null
    }));
    hooks.onRunId?.(runId);
  }
  setState(state, hooks) {
    this.state = state;
    hooks.onStateChange?.(state);
  }
};

// src/extension.ts
function activate(context) {
  const factoryRoot = getFactoryRoot();
  const runtimeRoot = getExtensionRuntimeRoot(context.extensionPath);
  const governanceOutput = vscode34.window.createOutputChannel("Devory: Governance");
  const runOutput = vscode34.window.createOutputChannel("Devory: Run");
  const doctorOutput = vscode34.window.createOutputChannel("Devory: Doctor");
  const cloudOutput = vscode34.window.createOutputChannel("Devory: Cloud");
  const initOutput = vscode34.window.createOutputChannel("Devory: Init");
  const storageOutput = vscode34.window.createOutputChannel("Devory: Storage");
  const runController = new RunController();
  context.subscriptions.push(governanceOutput, runOutput, doctorOutput, cloudOutput, initOutput, storageOutput);
  const showWorkProvider = new ShowWorkProvider(
    () => resolveTasksDir(getFactoryRoot()),
    () => getFactoryPaths(getFactoryRoot()).artifactsDir,
    () => runController.getState()
  );
  context.subscriptions.push(
    vscode34.window.registerWebviewViewProvider(
      ShowWorkProvider.viewId,
      showWorkProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  const syncRunContext = (state) => {
    void vscode34.commands.executeCommand("setContext", "devory.runActive", state === "running");
    void vscode34.commands.executeCommand("setContext", "devory.runPaused", state === "paused");
    void vscode34.commands.executeCommand("setContext", "devory.runRunning", state === "running");
    showWorkProvider.refresh();
  };
  syncRunContext(runController.getState());
  const treeProvider = new TaskTreeProvider(resolveTasksDir(factoryRoot));
  context.subscriptions.push(
    vscode34.window.registerTreeDataProvider("devoryTaskExplorer", treeProvider)
  );
  const factoryTreeProvider = new FactoryTreeProvider(factoryRoot);
  context.subscriptions.push(
    vscode34.window.registerTreeDataProvider("devoryFactoryExplorer", factoryTreeProvider)
  );
  const taskAssistantProvider = new TaskAssistantProvider();
  context.subscriptions.push(
    vscode34.window.registerWebviewViewProvider(
      TaskAssistantProvider.viewId,
      taskAssistantProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  context.subscriptions.push(
    vscode34.window.onDidChangeActiveTextEditor(() => {
      const tasksDir = resolveTasksDir(getFactoryRoot());
      const task = resolveActiveEditorTask(tasksDir);
      taskAssistantProvider.setTask(task);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.focusTaskAssistant", () => {
      void vscode34.commands.executeCommand("devoryTaskAssistant.focus");
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.showWork", () => {
      void vscode34.commands.executeCommand("devoryShowWork.focus");
    })
  );
  const governanceStatusBar = vscode34.window.createStatusBarItem(
    vscode34.StatusBarAlignment.Left,
    98
  );
  governanceStatusBar.command = "devory.showGovernanceStatus";
  context.subscriptions.push(governanceStatusBar);
  const refreshGovernanceStatus = () => {
    const snapshot = readGovernanceStatus(getFactoryRoot());
    governanceStatusBar.text = formatGovernanceStatusBarText(snapshot);
    governanceStatusBar.tooltip = formatGovernanceStatusSummary(snapshot);
    governanceStatusBar.show();
  };
  refreshGovernanceStatus();
  syncCapabilityContext(factoryRoot, runtimeRoot);
  context.subscriptions.push(
    vscode34.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("devory")) {
        const newRoot = getFactoryRoot();
        treeProvider.setTasksDir(resolveTasksDir(newRoot));
        factoryTreeProvider.setFactoryRoot(newRoot);
        syncCapabilityContext(newRoot, runtimeRoot);
        refreshGovernanceStatus();
        taskAssistantProvider.setTask(resolveActiveEditorTask(resolveTasksDir(newRoot)));
      }
    })
  );
  context.subscriptions.push(
    vscode34.workspace.onDidSaveTextDocument((doc) => {
      const normalized = doc.uri.fsPath.replace(/\\/g, "/");
      if (normalized.endsWith("/.devory/governance.json") || normalized.endsWith("/.devory/feature-flags.json") || normalized.endsWith("/.devory-governance/config.json")) {
        refreshGovernanceStatus();
      }
    })
  );
  context.subscriptions.push(
    vscode34.window.onDidChangeWindowState(() => {
      refreshGovernanceStatus();
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.refresh", () => {
      treeProvider.refresh();
      factoryTreeProvider.refresh();
      refreshGovernanceStatus();
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.showGovernanceStatus", async () => {
      const snapshot = readGovernanceStatus(getFactoryRoot());
      const summary = formatGovernanceStatusSummary(snapshot);
      governanceOutput.clear();
      governanceOutput.appendLine(summary);
      governanceOutput.show(true);
      const cloudSummary = summary.split("\n").find((line) => line.startsWith("Cloud commands:"));
      const headline = `Devory governance is ${snapshot.indicator}.`;
      const detail = cloudSummary ? ` ${cloudSummary}` : "";
      await vscode34.window.showInformationMessage(`${headline}${detail}`);
      refreshGovernanceStatus();
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.cloudConnect", async () => {
      await cloudConnectCommand(getFactoryRoot(), cloudOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.openGettingStarted", async () => {
      try {
        await vscode34.commands.executeCommand(
          "workbench.action.openWalkthrough",
          "DevoryAI.devory-vscode#devory.gettingStarted",
          false
        );
      } catch {
        await vscode34.window.showInformationMessage(
          "Devory: open Command Palette and run 'Get Started: Open Walkthrough...' then choose 'Devory.AI: Get started with Devory'."
        );
      }
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskList", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskList", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskListCommand(resolveTasksDir(root));
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskCreate", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskCreate", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskCreateCommand(root);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.generateTasksFromIdea", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskCreate", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      void generateTasksFromIdeaCommand(
        root,
        () => treeProvider.refresh(),
        async (committed) => {
          const latestRoot = getFactoryRoot();
          const latestTasksDir = resolveTasksDir(latestRoot);
          treeProvider.refresh();
          const committedWithTask = committed.map((entry, index) => {
            const task = findTaskById(latestTasksDir, entry.task_id);
            return {
              entry,
              task,
              candidate: {
                taskId: entry.task_id,
                stage: task?.stage ?? toLifecycleStage(entry.target_stage),
                commitIndex: index
              }
            };
          });
          const selectedCandidate = selectFirstCommittedTask(
            committedWithTask.map((value) => value.candidate)
          );
          const selected = selectedCandidate ? committedWithTask.find((value) => value.entry.task_id === selectedCandidate.taskId) : void 0;
          const selectedTask = selected?.task ?? null;
          if (selectedTask) {
            const revealed = await revealTaskInExplorer(treeProvider, treeView, selectedTask);
            if (!revealed) {
              taskAssistantProvider.setTask(selectedTask);
            }
          }
          const firstRunnable = committedWithTask.find((value) => value.task?.stage === "ready")?.task ?? null;
          const selectionText = selectedTask ? `${selectedTask.id} (${selectedTask.stage})` : selectedCandidate ? `${selectedCandidate.taskId} (${selectedCandidate.stage ?? "unknown"})` : "none";
          const runnableText = firstRunnable ? `${firstRunnable.id}` : "none";
          const actions = buildPostCommitActions(selectedTask?.stage ?? selectedCandidate?.stage ?? null);
          const picked = await vscode34.window.showQuickPick(
            actions.map((action) => ({
              label: action.label,
              detail: action.detail,
              action
            })),
            {
              title: `Devory: ${committed.length} committed \xB7 selected ${selectionText} \xB7 runnable now ${runnableText}`,
              placeHolder: "Choose the next step",
              ignoreFocusOut: true
            }
          );
          if (!picked)
            return;
          if (picked.action.id === "open-show-work") {
            await vscode34.commands.executeCommand("devory.showWork");
            return;
          }
          if (!selectedTask) {
            vscode34.window.showInformationMessage(
              "Devory: committed tasks were saved, but no task could be resolved in Task Explorer yet."
            );
            return;
          }
          if (picked.action.id === "reveal-task") {
            const revealed = await revealTaskInExplorer(treeProvider, treeView, selectedTask);
            if (!revealed) {
              taskAssistantProvider.setTask(selectedTask);
            }
            return;
          }
          if (selectedTask.stage === "backlog") {
            vscode34.window.showInformationMessage(
              `Devory: ${selectedTask.id} is in backlog. Promote it to ready before running.`
            );
            await vscode34.commands.executeCommand("devory.taskPromote", selectedTask);
          }
          const refreshedTask = findTaskById(resolveTasksDir(getFactoryRoot()), selectedTask.id);
          if (!refreshedTask || refreshedTask.stage !== "ready") {
            const stageLabel = refreshedTask?.stage ?? "unknown";
            vscode34.window.showInformationMessage(
              `Devory: ${selectedTask.id} is ${stageLabel}. Move it to ready to run.`
            );
            return;
          }
          await revealTaskInExplorer(treeProvider, treeView, refreshedTask);
          taskAssistantProvider.setTask(refreshedTask);
          await vscode34.commands.executeCommand("devory.runStart");
          const openShowWork = await vscode34.window.showInformationMessage(
            `Devory: run start requested for ${refreshedTask.id}. Open Show Work?`,
            "Open Show Work"
          );
          if (openShowWork === "Open Show Work") {
            await vscode34.commands.executeCommand("devory.showWork");
          }
        }
      );
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskMove", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      const tasksDir = resolveTasksDir(root);
      taskMoveCommand(root, tasksDir, () => treeProvider.refresh());
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskPromote", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      const tasksDir = resolveTasksDir(root);
      taskPromoteCommand(root, tasksDir, () => treeProvider.refresh(), target);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.reviewQueue", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskList", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewCommand(resolveTasksDir(root), target);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskApprove", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewActionCommand(
        getFactoryRoot(),
        resolveTasksDir(root),
        "approve",
        () => treeProvider.refresh(),
        target
      );
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskSendBack", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewActionCommand(
        root,
        resolveTasksDir(root),
        "send-back",
        () => treeProvider.refresh(),
        target
      );
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskBlock", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskReviewActionCommand(
        root,
        resolveTasksDir(root),
        "block",
        () => treeProvider.refresh(),
        target
      );
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskRequeue", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskRequeueCommand(root, resolveTasksDir(root), () => treeProvider.refresh(), target);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.taskArchive", (target) => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("taskMove", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      taskArchiveCommand(root, resolveTasksDir(root), () => treeProvider.refresh(), target);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.enrichTask", () => {
      void taskEnrichCommand();
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.addAcceptanceCriteria", () => {
      void addSectionCommand("acceptanceCriteria");
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.addVerification", () => {
      void addSectionCommand("verification");
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.addDependencies", () => {
      void addSectionCommand("dependsOn");
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.addFilesAffected", () => {
      void addSectionCommand("filesAffected");
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.runStart", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("runStart", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      if (runController.getState() === "paused") {
        void runController.resume({
          onOutput: (chunk) => runOutput.append(chunk),
          onStateChange: syncRunContext
        }).then((resumed) => {
          if (!resumed.ok) {
            vscode34.window.showInformationMessage(`Devory: ${resumed.reason}`);
            return;
          }
          vscode34.window.showInformationMessage("Devory: resumed the paused factory run.");
        });
        return;
      }
      if (runController.getState() === "running") {
        vscode34.window.showInformationMessage("Devory: a factory run is already active. Use pause or stop from the Tasks header.");
        return;
      }
      void runStartCommand(
        root,
        resolveTasksDir(root),
        runtimeRoot,
        runOutput,
        runController,
        syncRunContext
      );
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.runResume", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("runStart", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      const { runsDir } = getFactoryPaths(root);
      runResumeCommand(root, runsDir, runtimeRoot, runOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.runPause", () => {
      void runPauseCommand(runController, runOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.runStop", () => {
      void runStopCommand(runController, runOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.runInspect", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("runInspect", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      const { runsDir: rd, artifactsDir } = getFactoryPaths(root);
      runInspectCommand(rd, artifactsDir);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.showRoutingOutcomeSummary", () => {
      void routingOutcomeSummaryCommand(getFactoryRoot(), runOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.factoryDoctor", () => {
      factoryDoctorCommand(getFactoryRoot(), doctorOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.doctrineCreate", () => {
      doctrineCreateCommand(getFactoryRoot(), () => factoryTreeProvider.refresh());
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.skillCreate", () => {
      skillCreateCommand(getFactoryRoot(), runtimeRoot, () => factoryTreeProvider.refresh());
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.agentCreate", () => {
      agentCreateCommand(getFactoryRoot(), () => factoryTreeProvider.refresh());
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.doctrineArchive", (target) => {
      const filePath = typeof target?.filePath === "string" ? target.filePath : typeof target?.resourceUri?.fsPath === "string" ? target.resourceUri.fsPath : "";
      if (!filePath)
        return;
      doctrineArchiveCommand(getFactoryRoot(), filePath, () => factoryTreeProvider.refresh());
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.skillArchive", (target) => {
      const skillMdPath = typeof target?.skillMdPath === "string" ? target.skillMdPath : typeof target?.resourceUri?.fsPath === "string" ? target.resourceUri.fsPath : "";
      if (!skillMdPath)
        return;
      skillArchiveCommand(getFactoryRoot(), skillMdPath, () => factoryTreeProvider.refresh());
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.initWorkspace", () => {
      const root = getFactoryRoot();
      initWorkspaceCommand(
        initOutput,
        () => {
          treeProvider.refresh();
          syncCapabilityContext(root, runtimeRoot);
          markFirstRunComplete(context);
        },
        () => {
        },
        runtimeRoot
      );
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.artifactInspect", () => {
      const root = getFactoryRoot();
      const capabilities = detectWorkspaceCapabilities(root, runtimeRoot);
      const blockedMessage = getUnsupportedCommandMessage("artifactInspect", capabilities);
      if (blockedMessage) {
        vscode34.window.showInformationMessage(blockedMessage);
        return;
      }
      artifactInspectCommand(getFactoryPaths(root).artifactsDir);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.showStoredDataLocations", () => {
      void showStoredDataLocationsCommand(context, getFactoryRoot(), storageOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.sweepWorkshop", () => {
      void sweepWorkshopCommand(context, getFactoryRoot(), storageOutput);
    })
  );
  context.subscriptions.push(
    vscode34.commands.registerCommand("devory.cleanupLocalData", () => {
      void cleanupLocalDataCommand(context, getFactoryRoot(), storageOutput);
    })
  );
  setTimeout(() => {
    const workspaceFolder = vscode34.workspace.workspaceFolders?.[0];
    if (!workspaceFolder)
      return;
    const cwd = workspaceFolder.uri.fsPath;
    const caps = detectWorkspaceCapabilities(factoryRoot, runtimeRoot);
    if (!shouldShowBootstrap(context, caps.hasTasksDir))
      return;
    void runBootstrapFlow(
      context,
      cwd,
      initOutput,
      () => initWorkspaceCommand(
        initOutput,
        () => {
          treeProvider.refresh();
          syncCapabilityContext(factoryRoot, runtimeRoot);
          markFirstRunComplete(context);
        },
        () => {
        },
        runtimeRoot
      )
    );
  }, 2e3);
}
function deactivate() {
}
function syncCapabilityContext(factoryRoot, runtimeRoot) {
  const capabilities = detectWorkspaceCapabilities(factoryRoot, runtimeRoot);
  void vscode34.commands.executeCommand(
    "setContext",
    "devory.capabilityLevel",
    capabilities.capabilityLevel
  );
  void vscode34.commands.executeCommand(
    "setContext",
    "devory.supportsRunExecution",
    capabilities.supportsRunExecution
  );
  void vscode34.commands.executeCommand(
    "setContext",
    "devory.workspaceInitialized",
    capabilities.hasTasksDir
  );
}
function toLifecycleStage(value) {
  if (!value)
    return null;
  return LIFECYCLE_STAGES.includes(value) ? value : null;
}
async function revealTaskInExplorer(treeProvider, treeView2, task) {
  try {
    const rootItems = await treeProvider.getChildren();
    const stageItem = rootItems.find(
      (item) => item instanceof StageItem && item.stage === task.stage
    );
    if (!stageItem)
      return false;
    const stageChildren = await treeProvider.getChildren(stageItem);
    const taskItem = stageChildren.find(
      (item) => item instanceof TaskItem && item.task.id === task.id
    );
    if (!taskItem)
      return false;
    await treeView2.reveal(taskItem, { expand: true, select: true, focus: false });
    return true;
  } catch {
    return false;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
