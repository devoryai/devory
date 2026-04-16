/**
 * packages/core/src/target-readiness.ts
 *
 * Lightweight concrete target readiness model and bounded detection helpers.
 *
 * The goal is operational truthfulness, not continuous health monitoring.
 * Callers may provide a short-lived readiness snapshot for one routing/binding
 * flow so concrete target resolution can distinguish:
 *   - ready
 *   - configured_but_unverified
 *   - unavailable
 *   - blocked_by_policy
 *   - unknown
 */

import type { RoutingPolicy } from "./routing-policy.ts";
import * as fs from "node:fs";

export type TargetReadinessState =
  | "ready"
  | "configured_but_unverified"
  | "unavailable"
  | "blocked_by_policy"
  | "unknown";

export interface TargetReadinessRecord {
  state: TargetReadinessState;
  detail: string | null;
}

export interface TargetReadinessSnapshot {
  provider_classes: Partial<
    Record<"deterministic" | "local_ollama" | "cloud_premium", TargetReadinessRecord>
  >;
  targets: Record<string, TargetReadinessRecord>;
}

export interface OllamaProbeResult {
  base_url: string;
  reachable: boolean;
  status: number | null;
  models: string[] | null;
  detail: string | null;
}

export interface DetectTargetReadinessOptions {
  env?: Record<string, string | undefined>;
  policy?: RoutingPolicy;
  target_ids?: string[];
  configured_target_ids?: string[];
  ollama_probe?: OllamaProbeResult | null;
}

export interface ProbeOllamaReadinessOptions {
  env?: Record<string, string | undefined>;
  base_url?: string;
  timeout_ms?: number;
  fetch_fn?: typeof fetch;
}

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
const OLLAMA_FALLBACK_BASE_URLS = [
  OLLAMA_DEFAULT_BASE_URL,
  "http://127.0.0.1:11434",
  "http://host.docker.internal:11434",
] as const;

function trimEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOllamaBaseUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) {
    return raw.replace(/\/$/, "");
  }
  return `http://${raw.replace(/\/$/, "")}`;
}

function resolveWslBridgeBaseUrl(
  env: Record<string, string | undefined>
): string | null {
  const explicitHostIp = trimEnv(env.OLLAMA_HOST_IP);
  if (explicitHostIp) {
    return normalizeOllamaBaseUrl(`${explicitHostIp}:11434`);
  }

  const runningInWsl = Boolean(trimEnv(env.WSL_INTEROP) ?? trimEnv(env.WSL_DISTRO_NAME));
  if (!runningInWsl) return null;

  try {
    const resolvConf = fs.readFileSync("/etc/resolv.conf", "utf-8");
    const nameserver = resolvConf.match(/^nameserver\s+([0-9.]+)\s*$/m)?.[1]?.trim();
    return normalizeOllamaBaseUrl(nameserver ? `${nameserver}:11434` : null);
  } catch {
    return null;
  }
}

function inferTargetProviderClass(
  targetId: string
): "deterministic" | "local_ollama" | "cloud_premium" | null {
  if (targetId.startsWith("deterministic:")) return "deterministic";
  if (targetId.startsWith("ollama:")) return "local_ollama";
  if (targetId.startsWith("cloud:")) return "cloud_premium";
  return null;
}

function inferCloudCredentialKind(
  modelId: string | null
): "anthropic" | "openai" | "generic" {
  const normalized = (modelId ?? "").toLowerCase();
  if (normalized.startsWith("claude")) return "anthropic";
  if (
    normalized.startsWith("gpt") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return "openai";
  }
  return "generic";
}

function hasAnthropicCredential(
  env: Record<string, string | undefined>
): boolean {
  return Boolean(
    trimEnv(env.ANTHROPIC_API_KEY) ??
      trimEnv(env.CLAUDE_CODE_OAUTH_TOKEN) ??
      trimEnv(env.ANTHROPIC_AUTH_TOKEN)
  );
}

function hasOpenAICredential(
  env: Record<string, string | undefined>
): boolean {
  return Boolean(trimEnv(env.OPENAI_API_KEY));
}

function cloudCredentialReadiness(
  env: Record<string, string | undefined>,
  modelId: string | null
): TargetReadinessRecord {
  const kind = inferCloudCredentialKind(modelId);
  if (kind === "anthropic") {
    return hasAnthropicCredential(env)
      ? {
          state: "configured_but_unverified",
          detail: "Anthropic credentials detected; API reachability not probed.",
        }
      : {
          state: "unavailable",
          detail:
            "Anthropic credentials missing. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or ANTHROPIC_AUTH_TOKEN.",
        };
  }

  if (kind === "openai") {
    return hasOpenAICredential(env)
      ? {
          state: "configured_but_unverified",
          detail: "OpenAI credentials detected; API reachability not probed.",
        }
      : {
          state: "unavailable",
          detail: "OpenAI credentials missing. Set OPENAI_API_KEY.",
        };
  }

  if (hasAnthropicCredential(env) || hasOpenAICredential(env)) {
    return {
      state: "configured_but_unverified",
      detail: "Cloud credentials detected; model-specific reachability not probed.",
    };
  }

  return {
    state: "unavailable",
    detail: "No supported cloud credentials detected for this target.",
  };
}

function isCloudBlockedByPolicy(policy: RoutingPolicy | undefined): boolean {
  return Boolean(policy && (policy.local_only || !policy.cloud_allowed));
}

function buildBlockedRecord(detail: string): TargetReadinessRecord {
  return { state: "blocked_by_policy", detail };
}

function buildOllamaProviderReadiness(
  env: Record<string, string | undefined>,
  probe: OllamaProbeResult | null | undefined
): TargetReadinessRecord {
  if (probe) {
    if (probe.reachable) {
      return {
        state: "ready",
        detail:
          probe.models !== null
            ? `Ollama reachable at ${probe.base_url}; inventory loaded.`
            : `Ollama reachable at ${probe.base_url}.`,
      };
    }

    return {
      state: "unavailable",
      detail:
        probe.detail ??
        `Ollama probe failed for ${probe.base_url}.`,
    };
  }

  if (
    trimEnv(env.FACTORY_DEFAULT_ENGINE) === "ollama" ||
    trimEnv(env.OLLAMA_BASE_URL) ||
    trimEnv(env.OLLAMA_HOST)
  ) {
    return {
      state: "configured_but_unverified",
      detail: "Ollama endpoint configured but not probed in this flow.",
    };
  }

  return {
    state: "unknown",
    detail: "Ollama endpoint not configured and readiness was not probed.",
  };
}

function buildLocalTargetReadiness(
  targetId: string,
  configured: boolean,
  providerReadiness: TargetReadinessRecord,
  probe: OllamaProbeResult | null | undefined
): TargetReadinessRecord {
  if (!configured) {
    return {
      state: "unavailable",
      detail: "Target not configured for this workspace.",
    };
  }

  if (providerReadiness.state === "blocked_by_policy") return providerReadiness;
  if (providerReadiness.state === "unknown") {
    return {
      state: "configured_but_unverified",
      detail: "Model is configured but current Ollama readiness is unknown.",
    };
  }

  if (probe?.reachable && Array.isArray(probe.models)) {
    const modelId = targetId.slice("ollama:".length);
    const present = probe.models.includes(modelId);
    return present
      ? {
          state: "ready",
          detail: `Model present in Ollama inventory at ${probe.base_url}.`,
        }
      : {
          state: "unavailable",
          detail: `Model ${modelId} not found in Ollama inventory at ${probe.base_url}.`,
        };
  }

  if (providerReadiness.state === "ready") {
    return {
      state: "configured_but_unverified",
      detail: "Ollama is reachable, but model inventory could not be confirmed.",
    };
  }

  if (providerReadiness.state === "configured_but_unverified") {
    return {
      state: "configured_but_unverified",
      detail: "Ollama is configured, but model presence was not verified.",
    };
  }

  return providerReadiness;
}

export function isReadinessSelectable(
  state: TargetReadinessState
): boolean {
  return state === "ready" || state === "configured_but_unverified";
}

export function resolveOllamaBaseUrl(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string {
  return resolveOllamaBaseUrlCandidates(env)[0] ?? OLLAMA_DEFAULT_BASE_URL;
}

export function resolveOllamaBaseUrlCandidates(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string[] {
  const candidates = [
    normalizeOllamaBaseUrl(trimEnv(env.OLLAMA_BASE_URL)),
    normalizeOllamaBaseUrl(trimEnv(env.OLLAMA_HOST)),
    resolveWslBridgeBaseUrl(env),
    ...OLLAMA_FALLBACK_BASE_URLS,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

async function probeSingleOllamaBaseUrl(
  baseUrl: string,
  timeoutMs: number,
  fetchFn: typeof fetch
): Promise<OllamaProbeResult> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(`${normalizedBaseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        base_url: normalizedBaseUrl,
        reachable: false,
        status: response.status,
        models: null,
        detail: `Ollama probe returned HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      models?: Array<{ name?: unknown; model?: unknown }>;
    };
    const models = Array.isArray(payload.models)
      ? payload.models
          .map((entry) => {
            if (typeof entry.name === "string") return entry.name.trim();
            if (typeof entry.model === "string") return entry.model.trim();
            return "";
          })
          .filter((entry) => entry.length > 0)
      : null;

    return {
      base_url: normalizedBaseUrl,
      reachable: true,
      status: response.status,
      models,
      detail:
        models !== null
          ? `Loaded ${models.length} Ollama model tag${models.length === 1 ? "" : "s"}.`
          : "Ollama reachable but model inventory response was incomplete.",
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Ollama probe timed out after ${timeoutMs}ms.`
          : error.message
        : "Unknown Ollama probe failure.";
    return {
      base_url: normalizedBaseUrl,
      reachable: false,
      status: null,
      models: null,
      detail,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeOllamaReadiness(
  options: ProbeOllamaReadinessOptions = {}
): Promise<OllamaProbeResult> {
  const env =
    options.env ??
    (process.env as Record<string, string | undefined>);
  const baseUrl = (options.base_url ?? resolveOllamaBaseUrl(env)).replace(/\/$/, "");
  const timeoutMs = options.timeout_ms ?? 1200;
  const fetchFn = options.fetch_fn ?? globalThis.fetch;

  if (typeof fetchFn !== "function") {
    return {
      base_url: options.base_url ?? resolveOllamaBaseUrl(env),
      reachable: false,
      status: null,
      models: null,
      detail: "Fetch API is not available for Ollama probing.",
    };
  }
  const candidates = options.base_url
    ? [baseUrl]
    : resolveOllamaBaseUrlCandidates(env);
  let firstFailure: OllamaProbeResult | null = null;

  for (const candidate of candidates) {
    const result = await probeSingleOllamaBaseUrl(candidate, timeoutMs, fetchFn);
    if (result.reachable) {
      return result;
    }
    firstFailure ??= result;
  }

  return {
    base_url: candidates[0] ?? baseUrl,
    reachable: false,
    status: firstFailure?.status ?? null,
    models: null,
    detail:
      candidates.length > 1
        ? `Ollama probe failed for ${candidates.join(", ")}. Last error: ${firstFailure?.detail ?? "unknown failure"}.`
        : firstFailure?.detail ?? `Ollama probe failed for ${baseUrl}.`,
  };
}

export function detectTargetReadiness(
  options: DetectTargetReadinessOptions = {}
): TargetReadinessSnapshot {
  const env =
    options.env ??
    (process.env as Record<string, string | undefined>);
  const policy = options.policy;
  const targetIds = Array.from(new Set(options.target_ids ?? []));
  const configuredTargetIds = new Set(options.configured_target_ids ?? []);
  const probe = options.ollama_probe;

  const providerClasses: TargetReadinessSnapshot["provider_classes"] = {
    deterministic: {
      state: "ready",
      detail: "Deterministic execution is available without provider probing.",
    },
  };

  providerClasses.local_ollama = buildOllamaProviderReadiness(env, probe);
  providerClasses.cloud_premium = isCloudBlockedByPolicy(policy)
    ? buildBlockedRecord(
        policy?.local_only
          ? "Cloud execution is blocked by local-only policy."
          : "Cloud execution is blocked by routing policy."
      )
    : cloudCredentialReadiness(env, null);

  const targets: Record<string, TargetReadinessRecord> = {};
  const disabledTargets = new Set(policy?.disabled_targets ?? []);

  for (const targetId of targetIds) {
    const providerClass = inferTargetProviderClass(targetId);
    if (!providerClass) continue;

    if (disabledTargets.has(targetId)) {
      targets[targetId] = buildBlockedRecord("Target disabled by routing policy.");
      continue;
    }

    const configured =
      providerClass === "deterministic" || configuredTargetIds.has(targetId);

    if (!configured) {
      targets[targetId] = {
        state: "unavailable",
        detail: "Target not configured for this workspace.",
      };
      continue;
    }

    if (providerClass === "deterministic") {
      targets[targetId] = {
        state: "ready",
        detail: "Deterministic execution requires no external runtime.",
      };
      continue;
    }

    if (providerClass === "cloud_premium" && isCloudBlockedByPolicy(policy)) {
      targets[targetId] = buildBlockedRecord(
        policy?.local_only
          ? "Cloud target blocked by local-only policy."
          : "Cloud target blocked because cloud execution is disabled."
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

    const modelId = targetId.startsWith("cloud:")
      ? targetId.slice("cloud:".length)
      : null;
    targets[targetId] = cloudCredentialReadiness(env, modelId);
  }

  return {
    provider_classes: providerClasses,
    targets,
  };
}
