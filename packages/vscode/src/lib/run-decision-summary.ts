import {
  EXECUTION_PREFERENCE_LABELS,
  getProviderById,
  type ExecutionBindingResult,
  type ExecutionPreference,
  type ExecutionRoutingDecision,
} from "@devory/core";
import { describeBindingRoutingState } from "./routing-ux-labels.js";

export interface RunDecisionSummaryInput {
  taskCount: number;
  preference: ExecutionPreference;
  representativeDecision: ExecutionRoutingDecision | null;
  binding: ExecutionBindingResult;
}

function formatProviderClassLabel(
  providerClass: string | null,
  preferredLabel?: string | null
): string {
  if (preferredLabel && preferredLabel.trim() !== "") {
    return preferredLabel;
  }
  if (
    providerClass === "deterministic" ||
    providerClass === "local_ollama" ||
    providerClass === "cloud_premium"
  ) {
    return getProviderById(providerClass)?.label ?? providerClass;
  }
  return providerClass ?? "Unknown provider";
}

function formatRouteLine(input: {
  providerLabel: string;
  targetId: string | null;
  adapterId: string | null;
  executionPath: string | null;
}): string {
  const parts = [input.providerLabel];
  if (input.targetId) {
    parts.push(`-> ${input.targetId}`);
  }
  if (input.adapterId) {
    parts.push(`via ${input.adapterId}`);
  }
  if (input.executionPath) {
    parts.push(`[${input.executionPath}]`);
  }
  return parts.join(" ");
}

function buildWhyChosenLine(
  decision: ExecutionRoutingDecision | null,
  binding: ExecutionBindingResult
): string | null {
  const candidates = [
    ...(decision?.explanation_bullets ?? []),
    ...binding.policy_effects,
    binding.target_readiness_detail,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());

  const unique: string[] = [];
  for (const value of candidates) {
    if (!unique.includes(value)) {
      unique.push(value);
    }
  }

  if (unique.length === 0) {
    return null;
  }

  return unique.slice(0, 2).join("; ");
}

export function renderRunDecisionSummary(
  input: RunDecisionSummaryInput
): string {
  const selectedProviderClass =
    input.binding.originally_targeted_class ??
    input.representativeDecision?.selected_provider.id ??
    input.binding.selected_provider_class ??
    null;
  const selectedProviderLabel =
    input.representativeDecision?.selected_provider.id === selectedProviderClass
      ? input.representativeDecision.selected_provider.label
      : formatProviderClassLabel(selectedProviderClass);
  const actualProviderLabel = formatProviderClassLabel(
    input.binding.selected_provider_class
  );

  const selectedRoute = formatRouteLine({
    providerLabel: selectedProviderLabel,
    targetId: input.binding.selected_target_id,
    adapterId: input.binding.selected_adapter_id,
    executionPath: input.binding.selected_execution_path,
  });
  const actualRoute = formatRouteLine({
    providerLabel: actualProviderLabel,
    targetId: input.binding.actual_target_id,
    adapterId: input.binding.actual_adapter_id,
    executionPath: input.binding.actual_execution_path,
  });

  const lines = [
    "Run Decision",
    `Tasks: ${input.taskCount}`,
    `Preference: ${EXECUTION_PREFERENCE_LABELS[input.preference]}`,
    `Selected: ${selectedRoute}`,
    `Actual: ${selectedRoute === actualRoute ? "same as selected" : actualRoute}`,
  ];

  const whyChosen = buildWhyChosenLine(input.representativeDecision, input.binding);
  if (whyChosen) {
    lines.push(`Why: ${whyChosen}`);
  }

  const routingState = describeBindingRoutingState(input.binding);
  if (routingState.label) {
    lines.push(`Status: ${routingState.label}`);
  }
  if (routingState.detail) {
    lines.push(`Next: ${routingState.detail}`);
  }

  if (input.binding.fallback_taken) {
    lines.push(
      `Fallback: ${
        input.binding.fallback_reason ??
        "Devory changed route after readiness or policy checks."
      }`
    );
  } else if (input.binding.target_fallback_taken) {
    lines.push(
      `Target fallback: ${
        input.binding.target_fallback_reason ??
        "Devory changed the concrete target before launch."
      }`
    );
  } else if (input.binding.adapter_fallback_taken) {
    lines.push(
      `Adapter fallback: ${
        input.binding.adapter_fallback_reason ??
        "Devory changed the execution adapter before launch."
      }`
    );
  }

  if (input.binding.decomposition_recommended) {
    lines.push(
      `Note: ${
        input.binding.decomposition_note ??
        "Devory recommends splitting broad work before local execution."
      }`
    );
  }

  return lines.join("\n");
}
