import type { ExecutionBindingResult } from "./execution-binding.ts";
import type { ProviderTargetEntry } from "./provider-target-resolver.ts";
import type { RoutingPolicy } from "./routing-policy.ts";
import type {
  OllamaProbeResult,
  TargetReadinessSnapshot,
} from "./target-readiness.ts";

export type ProviderSupportLevel =
  | "first_class"
  | "experimental_adapter"
  | "unsupported";

export type ProviderDoctorReachability =
  | "reachable"
  | "unreachable"
  | "unverified"
  | "not_applicable";

export type ProviderDoctorId =
  | "deterministic"
  | "ollama"
  | "claude"
  | "openai"
  | "copilot"
  | "gemini"
  | "continue";

export interface ProviderDoctorRow {
  id: ProviderDoctorId;
  label: string;
  support_level: ProviderSupportLevel;
  supported: boolean;
  configured: boolean;
  reachable: ProviderDoctorReachability;
  target_models_detail: string;
  routeable: boolean;
  routeable_detail: string;
  summary: string;
}

export interface ProviderDoctorSnapshot {
  providers: ProviderDoctorRow[];
  viable_provider_ids: ProviderDoctorId[];
  routeable_provider_ids: ProviderDoctorId[];
}

export interface BuildProviderDoctorSnapshotOptions {
  env?: Record<string, string | undefined>;
  policy?: RoutingPolicy;
  readiness?: TargetReadinessSnapshot;
  target_registry?: ProviderTargetEntry[];
  ollama_probe?: OllamaProbeResult | null;
}

function trimEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
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

function hasCopilotCredential(
  env: Record<string, string | undefined>
): boolean {
  return Boolean(
    trimEnv(env.GITHUB_TOKEN) ??
      trimEnv(env.GH_TOKEN) ??
      trimEnv(env.COPILOT_API_KEY)
  );
}

function getTargetsForProvider(
  targetRegistry: ProviderTargetEntry[],
  providerId: ProviderDoctorId
): ProviderTargetEntry[] {
  switch (providerId) {
    case "deterministic":
      return targetRegistry.filter((entry) => entry.provider_class === "deterministic");
    case "ollama":
      return targetRegistry.filter((entry) => entry.provider_class === "local_ollama");
    case "claude":
      return targetRegistry.filter(
        (entry) =>
          entry.provider_class === "cloud_premium" &&
          entry.model_id?.toLowerCase().startsWith("claude")
      );
    case "openai":
      return targetRegistry.filter(
        (entry) =>
          entry.provider_class === "cloud_premium" &&
          Boolean(
            entry.model_id &&
              /^(gpt|o1|o3|o4)/.test(entry.model_id.toLowerCase())
          )
      );
    default:
      return [];
  }
}

function summarizeTargetModels(
  providerId: ProviderDoctorId,
  targets: ProviderTargetEntry[],
  probe: OllamaProbeResult | null | undefined
): string {
  if (providerId === "deterministic") {
    return "No external model required.";
  }

  if (providerId === "ollama") {
    const expected = unique(
      targets
        .filter((entry) => entry.configured)
        .map((entry) => entry.model_id ?? entry.id)
    );
    const installed = unique(probe?.models ?? []);

    if (expected.length === 0 && installed.length === 0) {
      return "No routed Ollama models configured yet.";
    }
    if (expected.length === 0 && installed.length > 0) {
      return `Installed: ${installed.join(", ")}. No routed Ollama targets configured.`;
    }
    if (probe?.reachable && installed.length === 0) {
      return `Expected: ${expected.join(", ")}. Endpoint reachable, but model inventory is empty.`;
    }
    if (probe?.reachable && installed.length > 0) {
      const missing = expected.filter((modelId) => !installed.includes(modelId));
      return missing.length === 0
        ? `Installed: ${installed.join(", ")}.`
        : `Expected: ${expected.join(", ")}. Installed: ${installed.join(", ")}. Missing: ${missing.join(", ")}.`;
    }
    return `Expected: ${expected.join(", ")}.`;
  }

  if (targets.length === 0) {
    return "No routed targets configured.";
  }

  return `Configured targets: ${unique(
    targets.map((entry) => entry.model_id ?? entry.id)
  ).join(", ")}.`;
}

function summarizeRouteability(
  providerId: ProviderDoctorId,
  targets: ProviderTargetEntry[],
  policy: RoutingPolicy | undefined
): { routeable: boolean; detail: string } {
  if (providerId === "copilot") {
    return {
      routeable: false,
      detail: "Experimental adapter only; not used as an automatic routing target.",
    };
  }

  if (providerId === "gemini" || providerId === "continue") {
    return {
      routeable: false,
      detail: "Not a current Devory execution target.",
    };
  }

  const routeableTargets = targets.filter(
    (entry) => entry.available && entry.adapter_available
  );
  if (routeableTargets.length > 0) {
    return {
      routeable: true,
      detail: `Routeable now via ${routeableTargets
        .map((entry) => entry.id)
        .join(", ")}.`,
    };
  }

  const configuredTargets = targets.filter((entry) => entry.configured);
  if (configuredTargets.length === 0) {
    return {
      routeable: false,
      detail: "No configured routed targets available for this provider.",
    };
  }

  const blockedTargets = configuredTargets.filter(
    (entry) => entry.readiness_state === "blocked_by_policy"
  );
  if (blockedTargets.length === configuredTargets.length) {
    return {
      routeable: false,
      detail:
        policy?.local_only
          ? "Configured targets are blocked by local-only policy."
          : "Configured targets are blocked by routing policy.",
    };
  }

  const missingTargets = configuredTargets.filter(
    (entry) => entry.readiness_state === "unavailable"
  );
  if (missingTargets.length === configuredTargets.length) {
    return {
      routeable: false,
      detail: "Configured targets exist, but none are runnable right now.",
    };
  }

  return {
    routeable: false,
    detail: "Configured targets exist, but readiness could not be verified.",
  };
}

function summarizeRow(
  row: Omit<ProviderDoctorRow, "summary">
): string {
  const support =
    row.support_level === "first_class"
      ? "first-class"
      : row.support_level === "experimental_adapter"
        ? "experimental"
        : "unsupported";
  const configured = row.configured ? "configured" : "not configured";
  const routeable = row.routeable ? "routeable" : "not routeable";
  const reachable =
    row.reachable === "reachable"
      ? "reachable"
      : row.reachable === "unreachable"
        ? "unreachable"
        : row.reachable === "unverified"
          ? "reachability unverified"
          : "reachability n/a";
  return `${support}; ${configured}; ${reachable}; ${routeable}. ${row.routeable_detail}`;
}

export function buildProviderDoctorSnapshot(
  options: BuildProviderDoctorSnapshotOptions = {}
): ProviderDoctorSnapshot {
  const env =
    options.env ??
    (process.env as Record<string, string | undefined>);
  const targetRegistry = options.target_registry ?? [];
  const policy = options.policy;
  const probe = options.ollama_probe;

  const ollamaTargets = getTargetsForProvider(targetRegistry, "ollama");
  const claudeTargets = getTargetsForProvider(targetRegistry, "claude");
  const openaiTargets = getTargetsForProvider(targetRegistry, "openai");

  const ollamaRouteability = summarizeRouteability("ollama", ollamaTargets, policy);
  const claudeRouteability = summarizeRouteability("claude", claudeTargets, policy);
  const openaiRouteability = summarizeRouteability("openai", openaiTargets, policy);

  const rowsWithoutSummary: Array<Omit<ProviderDoctorRow, "summary">> = [
    {
      id: "deterministic",
      label: "Deterministic",
      support_level: "first_class",
      supported: true,
      configured: true,
      reachable: "not_applicable",
      target_models_detail: summarizeTargetModels("deterministic", [], probe),
      routeable: true,
      routeable_detail: "Always routeable as the no-model fallback lane.",
    },
    {
      id: "ollama",
      label: "Ollama",
      support_level: "first_class",
      supported: true,
      configured:
        Boolean(trimEnv(env.FACTORY_DEFAULT_ENGINE) === "ollama") ||
        Boolean(trimEnv(env.OLLAMA_BASE_URL) ?? trimEnv(env.OLLAMA_HOST)) ||
        ollamaTargets.some((entry) => entry.configured),
      reachable: probe
        ? probe.reachable
          ? "reachable"
          : "unreachable"
        : "unverified",
      target_models_detail: summarizeTargetModels("ollama", ollamaTargets, probe),
      routeable: ollamaRouteability.routeable,
      routeable_detail: ollamaRouteability.detail,
    },
    {
      id: "claude",
      label: "Claude",
      support_level: "first_class",
      supported: true,
      configured: hasAnthropicCredential(env),
      reachable: hasAnthropicCredential(env) ? "unverified" : "unreachable",
      target_models_detail: summarizeTargetModels("claude", claudeTargets, probe),
      routeable: claudeRouteability.routeable,
      routeable_detail: claudeRouteability.detail,
    },
    {
      id: "openai",
      label: "OpenAI",
      support_level: "first_class",
      supported: true,
      configured: hasOpenAICredential(env),
      reachable: hasOpenAICredential(env) ? "unverified" : "unreachable",
      target_models_detail: summarizeTargetModels("openai", openaiTargets, probe),
      routeable: openaiRouteability.routeable,
      routeable_detail: openaiRouteability.detail,
    },
    {
      id: "copilot",
      label: "Copilot",
      support_level: "experimental_adapter",
      supported: true,
      configured: hasCopilotCredential(env),
      reachable: hasCopilotCredential(env) ? "unverified" : "unreachable",
      target_models_detail: "CLI adapter exists, but it is not a first-class routed target.",
      routeable: false,
      routeable_detail: "Experimental adapter only; automatic routing does not select it.",
    },
    {
      id: "gemini",
      label: "Gemini",
      support_level: "unsupported",
      supported: false,
      configured: false,
      reachable: "not_applicable",
      target_models_detail: "No Devory execution target is implemented for Gemini.",
      routeable: false,
      routeable_detail: "Unsupported as a Devory execution target right now.",
    },
    {
      id: "continue",
      label: "Continue",
      support_level: "unsupported",
      supported: false,
      configured: false,
      reachable: "not_applicable",
      target_models_detail: "No Devory execution target is implemented for Continue.",
      routeable: false,
      routeable_detail: "Unsupported as a Devory execution target right now.",
    },
  ];

  const providers = rowsWithoutSummary.map((row) => ({
    ...row,
    summary: summarizeRow(row),
  }));

  return {
    providers,
    viable_provider_ids: providers
      .filter((row) => row.routeable)
      .map((row) => row.id),
    routeable_provider_ids: providers
      .filter((row) => row.routeable && row.support_level === "first_class")
      .map((row) => row.id),
  };
}

function suggestionListForProvider(
  provider: ProviderDoctorRow | undefined,
  binding: ExecutionBindingResult
): string[] {
  if (!provider) return [];

  if (provider.id === "ollama") {
    const suggestions = [
      "Refresh provider readiness after Ollama starts or after models finish pulling.",
    ];
    if (provider.target_models_detail.includes("Missing:")) {
      suggestions.push("Install or switch to one of the routed Ollama models shown in the readiness details.");
    } else {
      suggestions.push("Open settings and point Devory at the reachable Ollama endpoint if needed.");
    }
    suggestions.push("Switch execution preference to a configured cloud provider if local execution is not required.");
    return suggestions;
  }

  if (provider.id === "claude") {
    return [
      "Add Anthropic credentials, then refresh provider readiness.",
      "Switch to another configured provider if you want to run immediately.",
    ];
  }

  if (provider.id === "openai") {
    return [
      "Set OPENAI_API_KEY, then refresh provider readiness.",
      "Switch to another configured provider if you want to run immediately.",
    ];
  }

  if (provider.id === "copilot") {
    return [
      "Use a first-class routed provider instead of relying on the experimental Copilot adapter.",
      "Open settings and choose a supported execution preference or model target.",
    ];
  }

  if (binding.blocked_by_policy) {
    return [
      "Open routing policy settings and allow the blocked execution path, or choose a permitted provider.",
    ];
  }

  return ["Open settings and choose a different configured provider or target."];
}

export interface ExecutionPreflightBlock {
  title: string;
  detail: string;
  suggestions: string[];
}

export function describeExecutionPreflightBlock(
  binding: ExecutionBindingResult,
  snapshot: ProviderDoctorSnapshot
): ExecutionPreflightBlock | null {
  const provider = snapshot.providers.find((entry) => {
    if (binding.selected_provider_class === "deterministic") return entry.id === "deterministic";
    if (binding.selected_provider_class === "local_ollama") return entry.id === "ollama";

    const targetModelId =
      binding.actual_target_id?.slice("cloud:".length) ??
      binding.selected_target_id?.slice("cloud:".length) ??
      "";
    if (targetModelId.toLowerCase().startsWith("claude")) return entry.id === "claude";
    if (/^(gpt|o1|o3|o4)/.test(targetModelId.toLowerCase())) return entry.id === "openai";
    return entry.id === "openai";
  });

  if (!binding.force_local_violated && !binding.blocked_by_policy && binding.actual_adapter_id) {
    return null;
  }

  const detailParts = [
    binding.policy_block_reason,
    binding.adapter_fallback_reason,
    binding.target_readiness_detail,
    provider?.target_models_detail,
    provider?.routeable_detail,
  ].filter((value): value is string => Boolean(value && value.trim() !== ""));

  const title = binding.force_local_violated
    ? "No viable local execution target is ready."
    : binding.blocked_by_policy
      ? "Routing policy blocks the selected execution target."
      : "No viable execution target is ready.";

  return {
    title,
    detail: detailParts[0] ?? "Devory could not find a truthful routed target for this run.",
    suggestions: suggestionListForProvider(provider, binding),
  };
}
