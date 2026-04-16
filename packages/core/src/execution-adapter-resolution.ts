import type { RoutingPolicy } from "./routing-policy.ts";
import type {
  ProviderTargetEntry,
  ProviderTargetAdapterId,
} from "./provider-target-resolver.ts";
import {
  isReadinessSelectable,
  type TargetReadinessState,
} from "./target-readiness.ts";

export type ExecutionAdapterId =
  | "deterministic"
  | "ollama"
  | "claude"
  | "openai";

export type ExecutionAdapterInvocationMode =
  | "dry-run"
  | "ollama"
  | "claude"
  | "openai";

export type AdapterExecutionPath =
  | "packaged_runner:dry-run"
  | "packaged_runner:ollama"
  | "packaged_runner:claude"
  | "packaged_runner:openai";

export interface ResolvedExecutionAdapter {
  target_id: string;
  target_model_id: string | null;
  provider_adapter_id: ProviderTargetAdapterId;
  adapter_id: ExecutionAdapterId;
  adapter_label: string;
  invocation_mode: ExecutionAdapterInvocationMode;
  execution_path: AdapterExecutionPath;
  configured: boolean;
  available: boolean;
  reason: string | null;
  note: string | null;
}

export interface ResolveExecutionAdapterOptions {
  target: ProviderTargetEntry | null;
  readiness_state?: TargetReadinessState;
  policy?: RoutingPolicy;
}

const TARGET_ADAPTERS: Record<
  string,
  Omit<
    ResolvedExecutionAdapter,
    | "target_id"
    | "target_model_id"
    | "provider_adapter_id"
    | "configured"
    | "available"
    | "reason"
  >
> = {
  "deterministic:factory-default": {
    adapter_id: "deterministic",
    adapter_label: "Deterministic runner",
    invocation_mode: "dry-run",
    execution_path: "packaged_runner:dry-run",
    note: "Resolved onto the packaged dry-run lane.",
  },
  "ollama:qwen2.5-coder:14b": {
    adapter_id: "ollama",
    adapter_label: "Local Ollama runner",
    invocation_mode: "ollama",
    execution_path: "packaged_runner:ollama",
    note: "Resolved onto the packaged Ollama lane.",
  },
  "ollama:deepseek-coder:6.7b": {
    adapter_id: "ollama",
    adapter_label: "Local Ollama runner",
    invocation_mode: "ollama",
    execution_path: "packaged_runner:ollama",
    note: "Resolved onto the packaged Ollama lane.",
  },
  "cloud:claude-sonnet-4-6": {
    adapter_id: "claude",
    adapter_label: "Claude cloud runner",
    invocation_mode: "claude",
    execution_path: "packaged_runner:claude",
    note: "Resolved onto the packaged Claude lane.",
  },
  "cloud:gpt-5-mini": {
    adapter_id: "openai",
    adapter_label: "OpenAI cloud runner",
    invocation_mode: "openai",
    execution_path: "packaged_runner:openai",
    note: "Resolved onto the packaged OpenAI lane.",
  },
};

function buildUnsupportedReason(
  target: ProviderTargetEntry,
  readinessState: TargetReadinessState
): string {
  if (readinessState === "blocked_by_policy") {
    return `Concrete target "${target.id}" is blocked by policy.`;
  }
  if (readinessState === "unavailable") {
    return `Concrete target "${target.id}" is not runnable in the current workspace.`;
  }
  return `No execution adapter binding is implemented for concrete target "${target.id}".`;
}

export function resolveExecutionAdapter(
  options: ResolveExecutionAdapterOptions
): ResolvedExecutionAdapter | null {
  const target = options.target;
  if (target === null) return null;

  const readinessState = options.readiness_state ?? target.readiness_state;
  const mapped = TARGET_ADAPTERS[target.id];

  if (!mapped) {
    const selectable = isReadinessSelectable(readinessState);
    const blockedByPolicy =
      readinessState === "blocked_by_policy" ||
      (target.provider_class === "cloud_premium" &&
        Boolean(options.policy && (options.policy.local_only || !options.policy.cloud_allowed)));
    return {
      target_id: target.id,
      target_model_id: target.model_id,
      provider_adapter_id: target.adapter_id,
      adapter_id:
        target.provider_class === "deterministic"
          ? "deterministic"
          : target.provider_class === "local_ollama"
            ? "ollama"
            : target.model_id?.startsWith("claude")
              ? "claude"
              : "openai",
      adapter_label:
        target.provider_class === "deterministic"
          ? "Deterministic runner"
          : target.provider_class === "local_ollama"
            ? "Local Ollama runner"
            : "Cloud runner",
      invocation_mode:
        target.provider_class === "deterministic"
          ? "dry-run"
          : target.provider_class === "local_ollama"
            ? "ollama"
            : target.model_id?.startsWith("claude")
              ? "claude"
              : "openai",
      execution_path:
        target.provider_class === "deterministic"
          ? "packaged_runner:dry-run"
          : target.provider_class === "local_ollama"
            ? "packaged_runner:ollama"
            : target.model_id?.startsWith("claude")
              ? "packaged_runner:claude"
              : "packaged_runner:openai",
      configured: target.configured,
      available: selectable && !blockedByPolicy,
      reason:
        selectable && !blockedByPolicy
          ? null
          : buildUnsupportedReason(target, readinessState),
      note:
        selectable && !blockedByPolicy
          ? `Resolved dynamically onto the packaged ${
              target.provider_class === "deterministic"
                ? "dry-run"
                : target.provider_class === "local_ollama"
                  ? "Ollama"
                  : target.model_id?.startsWith("claude")
                    ? "Claude"
                    : "OpenAI"
            } lane.`
          : null,
    };
  }

  const blockedByPolicy =
    readinessState === "blocked_by_policy" ||
    (target.provider_class === "cloud_premium" &&
      Boolean(options.policy && (options.policy.local_only || !options.policy.cloud_allowed)));

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
    reason: blockedByPolicy
      ? `Execution adapter for "${target.id}" is blocked by policy.`
      : null,
    note: mapped.note,
  };
}
