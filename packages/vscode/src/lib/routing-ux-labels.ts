import type { ExecutionBindingResult } from "@devory/core";
import type { ExecutionOutcomeRecord } from "./execution-outcome.js";
import type { RoutingTruthRecord } from "./show-work-reader.js";

export interface RoutingStatePresentation {
  label: string;
  detail: string | null;
}

function normalizeSentence(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function describeBindingRoutingState(
  binding: ExecutionBindingResult
): RoutingStatePresentation {
  if (binding.force_local_violated) {
    return {
      label: "blocked",
      detail:
        "Local-only request cannot run because no local provider is available.",
    };
  }
  if (binding.blocked_by_policy) {
    return {
      label: "policy block",
      detail: normalizeSentence(
        binding.policy_block_reason ?? "Routing policy blocked this execution path."
      ),
    };
  }
  if (!binding.actual_adapter_id || !binding.actual_execution_path) {
    return {
      label: "adapter block",
      detail: normalizeSentence(
        binding.adapter_fallback_reason ??
          "No truthful execution adapter path is available for the selected route."
      ),
    };
  }
  if (binding.cloud_confirmation_required) {
    return {
      label: "confirmation required",
      detail: "Waiting for approval before cloud execution.",
    };
  }
  if (binding.fallback_taken) {
    return {
      label: "fallback applied",
      detail: normalizeSentence(
        binding.fallback_reason ??
          "Devory changed route after readiness or policy checks."
      ),
    };
  }
  if (binding.target_fallback_taken) {
    return {
      label: "target fallback",
      detail: normalizeSentence(
        binding.target_fallback_reason ??
          "Devory changed the concrete target before launch."
      ),
    };
  }
  if (binding.adapter_fallback_taken) {
    return {
      label: "adapter fallback",
      detail: normalizeSentence(
        binding.adapter_fallback_reason ??
          "Devory changed the execution adapter before launch."
      ),
    };
  }
  return {
    label: "ready to launch",
    detail: null,
  };
}

export function describeOutcomeRoutingState(
  record: Pick<
    ExecutionOutcomeRecord,
    | "run_result_status"
    | "fallback_taken"
    | "fallback_reason"
    | "failure_reason"
    | "decomposition_recommended"
    | "actual_provider_class"
    | "selected_provider_class"
    | "actual_target_id"
    | "selected_target_id"
    | "actual_adapter_id"
    | "selected_adapter_id"
  >
): RoutingStatePresentation {
  if (record.run_result_status === "blocked") {
    return {
      label: "policy block",
      detail: normalizeSentence(
        record.failure_reason ?? "Execution was prevented before launch."
      ),
    };
  }
  if (record.run_result_status === "cancelled") {
    return {
      label: "cancelled",
      detail: normalizeSentence(record.failure_reason ?? null),
    };
  }
  if (record.fallback_taken) {
    return {
      label: "fallback applied",
      detail: normalizeSentence(record.fallback_reason ?? record.failure_reason ?? null),
    };
  }
  if (
    record.selected_provider_class !== record.actual_provider_class ||
    record.selected_target_id !== record.actual_target_id ||
    record.selected_adapter_id !== record.actual_adapter_id
  ) {
    return {
      label: "route drift",
      detail: normalizeSentence(record.failure_reason ?? null),
    };
  }
  if (record.decomposition_recommended) {
    return {
      label: "decomposition suggested",
      detail: null,
    };
  }
  return {
    label: record.run_result_status ?? "recorded",
    detail: normalizeSentence(record.failure_reason ?? null),
  };
}

export function describeRoutingTruthState(
  routingTruth: Pick<
    RoutingTruthRecord,
    "status" | "fallbackTaken" | "reason" | "decompositionRecommended"
  >
): RoutingStatePresentation {
  if (routingTruth.status === "blocked") {
    return {
      label: "policy block",
      detail: normalizeSentence(routingTruth.reason),
    };
  }
  if (routingTruth.status === "cancelled") {
    return {
      label: "cancelled",
      detail: normalizeSentence(routingTruth.reason),
    };
  }
  if (routingTruth.fallbackTaken) {
    return {
      label: "fallback applied",
      detail: normalizeSentence(routingTruth.reason),
    };
  }
  if (routingTruth.decompositionRecommended) {
    return {
      label: "decomposition suggested",
      detail: normalizeSentence(routingTruth.reason),
    };
  }
  return {
    label: routingTruth.status ?? "recorded",
    detail: normalizeSentence(routingTruth.reason),
  };
}
