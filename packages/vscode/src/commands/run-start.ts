/**
 * packages/vscode/src/commands/run-start.ts
 *
 * devory.runStart — configure and start a factory run via the packaged
 * local runtime adapter.
 *
 * Before starting the run this command:
 *  1. Estimates cost via the dry-run estimator (existing behavior)
 *  2. Profiles each ready task and computes a routing decision for each
 *  3. Shows a compact routing summary in the output channel
 *  4. Offers a minimal manual execution preference picker
 *  5. Binds the routing decision to an actual execution path (execution binding layer)
 *  6. Blocks on force_local violations; surfaces decomposition recommendations
 *  7. Asks for an optional task limit
 *  8. Logs a compact routing record (selected vs. actual provider) before spawn
 *  9. Passes routing env vars (DEVORY_*) into the runner subprocess
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  estimateDryRunForTaskSources,
  formatRoutingDecisionSummary,
  formatRoutingPolicySummary,
  parseFrontmatter,
  profileTask,
  routeExecution,
  summarizeRoutingDecisions,
  EXECUTION_PREFERENCE_LABELS,
  VALID_EXECUTION_PREFERENCES,
  bindExecution,
  buildExecutionBindingEnv,
  buildRegistryFromEnvironment,
  buildProviderTargetRegistry,
  detectTargetReadiness,
  detectOllamaConfigured,
  probeOllamaReadiness,
  formatBindingRecord,
  resolveRoutingPolicy,
} from "@devory/core";
import type {
  ExecutionPreference,
  ExecutionRoutingDecision,
  RoutingPolicy,
  TargetReadinessRecord,
} from "@devory/core";
import type { ManagedRunState, RunController } from "../lib/run-controller.js";
import {
  appendExecutionOutcomeRecord,
  buildRunStartOutcome,
  createExecutionOutcomeSession,
  finalizeExecutionOutcome,
  type ExecutionOutcomeRecord,
} from "../lib/execution-outcome.js";
import { renderRunDecisionSummary } from "../lib/run-decision-summary.js";
import { getRunById } from "../lib/run-reader.js";
import { listTasksInStage } from "../lib/task-reader.js";

// ---------------------------------------------------------------------------
// Preference quick-pick items
// ---------------------------------------------------------------------------

interface PreferencePickItem extends vscode.QuickPickItem {
  preference: ExecutionPreference;
}

const PREFERENCE_ITEMS: PreferencePickItem[] = VALID_EXECUTION_PREFERENCES.map(
  (pref) => ({
    label: EXECUTION_PREFERENCE_LABELS[pref],
    preference: pref,
    description:
      pref === "auto"
        ? "Devory picks the best lane (local-first)"
        : pref === "prefer_local"
        ? "Use local model if available, otherwise cloud"
        : pref === "force_local"
        ? "Local only — warn if unavailable or complex"
        : pref === "allow_cloud"
        ? "Explicitly permit cloud routing"
        : pref === "force_cloud"
        ? "Always use cloud API"
        : "No model — deterministic/scripted only",
  })
);

function formatTargetSummary(
  providerClass: string,
  targetId: string | null,
  readiness: TargetReadinessRecord | null | undefined,
  adapterId: string | null,
  executionPath: string | null
): string {
  const suffix = readiness ? ` (${readiness.state})` : "";
  const adapterPart = adapterId ? ` -> adapter: ${adapterId}` : "";
  const pathPart = executionPath ? ` [${executionPath}]` : "";
  return targetId !== null
    ? `Routed to: ${providerClass} -> ${targetId}${adapterPart}${suffix}${pathPart}`
    : `Routed to: ${providerClass}${adapterPart}${suffix}${pathPart}`;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function runStartCommand(
  factoryRoot: string,
  tasksDir: string,
  runtimeRoot: string,
  runOutput: vscode.OutputChannel,
  controller: RunController,
  onStateChange: (state: ManagedRunState) => void,
): Promise<void> {
  const outcomeSession = createExecutionOutcomeSession(new Date().toISOString());
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const readyTasks = listTasksInStage(tasksDir, "ready");

  // --- Routing policy: load and surface ---
  let policy: RoutingPolicy | undefined;
  try {
    const resolution = resolveRoutingPolicy(factoryRoot);
    policy = resolution.policy;
  } catch {
    // Malformed workspace config — log and proceed with shipped defaults
    runOutput.appendLine(
      "[Devory] ⚠ Could not load routing-policy config; using defaults."
    );
  }

  // Surface policy constraints and provider availability honestly
  const ollamaConfigured = detectOllamaConfigured();
  const ollamaStatus = ollamaConfigured ? "configured" : "not configured";
  const policySummary = policy ? formatRoutingPolicySummary(policy) : "";
  if (policySummary || !ollamaConfigured) {
    const policyNote = policySummary
      ? `Policy: ${policySummary}`
      : "Policy: default";
    runOutput.appendLine(
      `[Devory] ${policyNote} · Ollama: ${ollamaStatus}`
    );
  }

  // Build environment-aware provider registry.
  // Uses configured Ollama detection and policy's cloud_allowed flag.
  const cloudAllowed = policy ? (policy.cloud_allowed && !policy.local_only) : true;
  const baseEnv = process.env as Record<string, string | undefined>;
  const initialRegistry = buildRegistryFromEnvironment(
    baseEnv,
    cloudAllowed
  );
  const initialTargetRegistry = buildProviderTargetRegistry({
    policy,
    provider_registry: initialRegistry,
    env: baseEnv,
  });
  const candidateTargetIds = initialTargetRegistry.map((entry) => entry.id);
  const ollamaProbe = await probeOllamaReadiness({
    env: baseEnv,
    timeout_ms: 1200,
  });
  const readiness = detectTargetReadiness({
    env: baseEnv,
    policy,
    target_ids: candidateTargetIds,
    configured_target_ids: initialTargetRegistry
      .filter((entry) => entry.configured)
      .map((entry) => entry.id),
    ollama_probe: ollamaProbe,
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
  } else if (
    cloudReadiness?.state === "unavailable" &&
    cloudReadiness.detail
  ) {
    runOutput.appendLine(`[Devory] Cloud target unavailable: ${cloudReadiness.detail}`);
  }

  // Parse task sources for estimate + routing
  const taskSources = readyTasks.slice(0, 8).map((task) => {
    try {
      const content = fs.readFileSync(task.filepath, "utf-8");
      const parsed = parseFrontmatter(content);
      return { meta: parsed.meta, body: parsed.body };
    } catch {
      return {};
    }
  });
  const taskProfiles = taskSources.map((source) => profileTask(source));

  // --- Dry-run cost estimate (existing behavior) ---
  const estimate = estimateDryRunForTaskSources(taskSources, {
    fallback_runner: "local-packaged-runner",
  });
  const estimateCost = `$${estimate.estimated_cost_usd.min.toFixed(2)} - $${estimate.estimated_cost_usd.max.toFixed(2)}`;
  const estimateParts = [
    `Dry Run Estimate: ${estimate.runner}/${estimate.model_display_name}`,
    `context ${estimate.context_tier}`,
    `output ${estimate.output_tier}`,
    `cost estimate ${estimateCost}`,
    `${estimate.confidence} confidence`,
  ];
  if (estimate.model_id === null) {
    estimateParts.push("fallback pricing model");
  }
  if (estimate.confidence === "low") {
    estimateParts.push("metadata incomplete");
  }
  const estimateDetail = `${estimateParts.join(" · ")}.`;
  runOutput.appendLine(`[Devory] ${estimateDetail}`);

  // --- Task profiling and routing (policy-aware) ---
  const routingDecisions: ExecutionRoutingDecision[] = taskProfiles.map(
    (profile) =>
      routeExecution(profile, "auto", {
        dryRunEstimate: estimate,
        registry: envRegistry,
        policy,
      })
  );
  const routingSummary = summarizeRoutingDecisions(routingDecisions);

  // Log compact routing summary
  runOutput.appendLine(`[Devory] Routing: ${routingSummary.summary_line}`);
  if (routingDecisions.length > 0) {
    // Show the first task's decision detail as a representative example
    const firstDecision = routingDecisions[0];
    runOutput.appendLine(
      `[Devory] ${formatRoutingDecisionSummary(firstDecision)}`
    );
    if (firstDecision.decomposition_recommended) {
      runOutput.appendLine(
        `[Devory] ⚠ Decomposition suggested: ${firstDecision.decomposition_note ?? ""}`
      );
    }
    for (const warning of firstDecision.warnings) {
      runOutput.appendLine(`[Devory] ⚠ ${warning}`);
    }
  }

  if (readyTasks.length > 0) {
    void vscode.window.showInformationMessage(
      `${estimateDetail} ${routingSummary.summary_line} Estimate only; execution is not blocked.`
    );
  } else {
    void vscode.window.showInformationMessage(
      `${estimateDetail} No ready tasks found right now; starting a run may complete with no runnable work.`
    );
  }

  // --- Manual execution preference picker ---
  const preferenceItems: PreferencePickItem[] = PREFERENCE_ITEMS.map(
    (item) => ({
      ...item,
      // Mark the current auto-selected provider and policy default in the label
      ...(item.preference === "auto"
        ? {
            description: [
              item.description,
              `currently → ${routingDecisions[0]?.selected_provider.label ?? "unknown"}`,
              policy && policy.default_preference !== "auto"
                ? `policy default: ${policy.default_preference}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }
        : {}),
    })
  );

  const preferenceSelection = await vscode.window.showQuickPick(
    preferenceItems,
    {
      title: "Devory: Execution Preference",
      placeHolder: "Select how Devory should route this run (Esc = cancel)",
      canPickMany: false,
    }
  );
  if (preferenceSelection === undefined) return; // user cancelled

  const chosenPreference: ExecutionPreference = preferenceSelection.preference;

  // Recompute routing with chosen preference and log the outcome
  let finalDecisions: ExecutionRoutingDecision[] = routingDecisions;
  if (chosenPreference !== "auto") {
    finalDecisions = taskProfiles.map((profile) =>
      routeExecution(profile, chosenPreference, {
        dryRunEstimate: estimate,
        registry: envRegistry,
        policy,
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
        runOutput.appendLine(`[Devory] ⚠ ${warning}`);
      }
    }
  }

  // --- Execution binding: map routing decision to actual execution path ---
  const binding = bindExecution(finalDecisions, chosenPreference, {
    policy,
    task_profiles: taskProfiles,
    task_metas: taskSources.map((source) => source.meta ?? null),
    readiness,
  });

  const runTargetSummary = formatTargetSummary(
    binding.selected_provider_class,
    binding.actual_target_id,
    binding.target_resolution
      ? {
          state: binding.target_readiness_state,
          detail: binding.target_readiness_detail,
        }
      : null,
    binding.actual_adapter_id,
    binding.actual_execution_path
  );
  const taskIds = readyTasks.map((task) => path.basename(task.filepath, ".md"));
  const representativeDecision = finalDecisions[0] ?? null;
  const runDecisionSummary = renderRunDecisionSummary({
    taskCount: readyTasks.length,
    preference: chosenPreference,
    representativeDecision,
    binding,
  });
  const baseOutcomeRecord = buildRunStartOutcome(
    outcomeSession,
    {
      timestamp: new Date().toISOString(),
      task_ids: taskIds,
      task_profiles: taskProfiles,
      binding,
      estimate,
      preference_used: chosenPreference,
    },
    null
  );
  let startedOutcomeRecord: ExecutionOutcomeRecord | null = null;
  const appendOutcome = (record: ExecutionOutcomeRecord): void => {
    appendExecutionOutcomeRecord(factoryRoot, record);
    runOutput.appendLine(
      `[Devory] Routing outcome recorded: ${record.run_result_status ?? "started"}`
    );
  };
  const appendFinalOutcome = (
    status: ExecutionOutcomeRecord["run_result_status"],
    failureReason: string | null
  ): void => {
    const finalRecord = finalizeExecutionOutcome(baseOutcomeRecord, {
      ...outcomeSession,
      next_sequence: outcomeSession.next_sequence + (startedOutcomeRecord ? 1 : 0),
    }, {
      timestamp: new Date().toISOString(),
      run_id: startedOutcomeRecord?.run_id ?? null,
      run_record:
        startedOutcomeRecord?.run_id
          ? getRunById(path.join(factoryRoot, "runs"), startedOutcomeRecord.run_id)
          : null,
      no_output: status === "no-op",
      exit_code:
        status === "failed"
          ? 1
          : 0,
      signal: status === "cancelled" ? "SIGTERM" : null,
      failure_reason: failureReason,
    });
    appendOutcome({
      ...finalRecord,
      run_result_status: status,
      failure_reason: failureReason,
      learnable:
        status === "completed" ? true : status === "failed" || status === "blocked" || status === "no-op" ? false : null,
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
  } else if (
    binding.target_readiness_state === "configured_but_unverified" &&
    binding.target_readiness_detail
  ) {
    runOutput.appendLine(`[Devory] ${binding.target_readiness_detail}`);
  }
  if (binding.policy_effects.some((effect) => effect.toLowerCase().includes("cloud"))) {
    const firstPolicyNote = binding.policy_effects.find((effect) =>
      effect.toLowerCase().includes("cloud")
    );
    if (firstPolicyNote) {
      runOutput.appendLine(`[Devory] Policy note: ${firstPolicyNote}`);
    }
  }

  // Surface decomposition recommendation before run
  if (binding.decomposition_recommended) {
    runOutput.appendLine(
      `[Devory] ⚠ Decomposition: ${binding.decomposition_note ?? "One or more tasks are broad for local execution. Consider splitting first."}`
    );
  }

  for (const line of runDecisionSummary.split("\n")) {
    runOutput.appendLine(`[Devory] ${line}`);
  }

  const reopenPreferencePicker = (): void => {
    void vscode.commands.executeCommand("devory.runStart");
  };

  const forceLocalStopMsg =
    "Force local is selected, but no local provider (Ollama) is available. " +
    "Start Ollama or switch to a different execution preference.";
  const policyBlockMsg =
    binding.selected_provider_class === "cloud_premium" &&
    ollamaReadiness?.state === "unavailable"
      ? "No ready local targets found; cloud escalation is not allowed."
      : binding.policy_block_reason ??
        "Routing policy has blocked this execution path.";
  const adapterBlockMsg =
    binding.adapter_fallback_reason ??
    "Preferred target is resolved, but no truthful execution adapter path exists.";

  // Check for force_local violation — stop the run rather than silently cloud-escalate
  if (binding.force_local_violated) {
    runOutput.appendLine(`[Devory] ✖ Routing blocked: ${forceLocalStopMsg}`);
    appendFinalOutcome("blocked", forceLocalStopMsg);
    const action = await vscode.window.showWarningMessage(
      `Devory:\n${runDecisionSummary}`,
      { modal: true },
      "Change Preference",
      "Cancel Run"
    );
    if (action !== "Change Preference") {
      return;
    }
    reopenPreferencePicker();
    return;
  }

  // Check for policy block — cloud or fallback disallowed by policy
  if (binding.blocked_by_policy) {
    runOutput.appendLine(`[Devory] ✖ Policy block: ${policyBlockMsg}`);
    appendFinalOutcome("blocked", policyBlockMsg);
    const action = await vscode.window.showWarningMessage(
      `Devory:\n${runDecisionSummary}`,
      { modal: true },
      "Change Preference",
      "Cancel Run"
    );
    if (action === "Change Preference") {
      reopenPreferencePicker();
    }
    return;
  }

  if (!binding.actual_adapter_id || !binding.actual_execution_path) {
    runOutput.appendLine(`[Devory] ✖ Adapter block: ${adapterBlockMsg}`);
    appendFinalOutcome("blocked", adapterBlockMsg);
    void vscode.window.showWarningMessage(
      `Devory:\n${runDecisionSummary}`,
      { modal: true }
    );
    return;
  }

  // Check for cloud confirmation requirement
  if (binding.cloud_confirmation_required) {
    runOutput.appendLine(
      "[Devory] ⚠ Cloud confirmation required before launch."
    );
    const confirmed = await vscode.window.showWarningMessage(
      `Devory:\n${runDecisionSummary}`,
      { modal: true },
      "Proceed",
      "Change Preference",
      "Cancel"
    );
    if (confirmed === "Change Preference") {
      reopenPreferencePicker();
      return;
    }
    if (confirmed !== "Proceed") {
      appendFinalOutcome("cancelled", "Cloud execution confirmation declined.");
      return;
    }
  } else {
    const proceed = await vscode.window.showInformationMessage(
      `Devory:\n${runDecisionSummary}`,
      { modal: true },
      "Continue",
      "Change Preference",
      "Cancel"
    );
    if (proceed === "Change Preference") {
      reopenPreferencePicker();
      return;
    }
    if (proceed !== "Continue") {
      return;
    }
  }

  // --- Ask for optional limit (existing behavior) ---
  const limitStr = await vscode.window.showInputBox({
    title: "Devory: Start Factory Run",
    prompt: "Max tasks to run (leave blank for no limit)",
    placeHolder: "e.g. 3",
    validateInput: (v) => {
      if (!v.trim()) return null;
      const n = Number(v);
      return isNaN(n) || n < 1 ? "Enter a positive integer or leave blank" : null;
    },
  });
  if (limitStr === undefined) {
    appendFinalOutcome("cancelled", "Run start cancelled before launch.");
    return;
  }

  const limit = limitStr.trim() ? Number(limitStr.trim()) : undefined;

  runOutput.clear();
  runOutput.appendLine(`[Devory] Starting factory run${limit !== undefined ? ` (limit: ${limit})` : ""}…`);
  runOutput.appendLine(`[Devory] ${estimateDetail}`);
  runOutput.appendLine(`[Devory] Routing: ${routingSummary.summary_line}`);
  for (const line of runDecisionSummary.split("\n")) {
    runOutput.appendLine(`[Devory] ${line}`);
  }

  // Compact routing record — shows selected vs. actual before the run starts
  runOutput.appendLine(`[Devory] ${formatBindingRecord(binding)}`);
  if (binding.fallback_taken) {
    runOutput.appendLine(
      `[Devory] ⚠ Routing mismatch: intended=${binding.originally_targeted_class ?? "unknown"}, ` +
        `actual=${binding.selected_provider_class}` +
        (binding.fallback_reason ? ` (${binding.fallback_reason})` : "")
    );
  }
  for (const warning of binding.warnings) {
    if (!warning.toLowerCase().includes("decomposition")) {
      // Decomposition already surfaced above; skip to avoid duplication
      runOutput.appendLine(`[Devory] ⚠ ${warning}`);
    }
  }

  runOutput.show(true);

  // Build routing env vars to pass into the runner subprocess
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
          next_sequence: outcomeSession.next_sequence,
        },
        {
          timestamp: new Date().toISOString(),
          task_ids: taskIds,
          task_profiles: taskProfiles,
          binding,
          estimate,
          preference_used: chosenPreference,
        },
        runId
      );
      appendOutcome(startedOutcomeRecord);
    },
    onExit: (result) => {
      const runRecord =
        startedOutcomeRecord?.run_id
          ? getRunById(path.join(factoryRoot, "runs"), startedOutcomeRecord.run_id)
          : null;
      const finalRecord = finalizeExecutionOutcome(
        startedOutcomeRecord ?? baseOutcomeRecord,
        {
          ...outcomeSession,
          next_sequence: outcomeSession.next_sequence + (startedOutcomeRecord ? 1 : 0),
        },
        {
          timestamp: new Date().toISOString(),
          run_id: startedOutcomeRecord?.run_id ?? null,
          run_record: runRecord,
          exit_code: result.exitCode,
          signal: result.signal,
          no_output: result.stdout.length === 0 && result.stderr.length === 0,
          failure_reason: result.stderr || result.stdout || null,
        }
      );
      appendOutcome(finalRecord);
      if (controller.getState() === "paused") {
        vscode.window.showInformationMessage(
          "Devory: factory run paused at a safe checkpoint. Use Play to resume.",
        );
        return;
      }
      const noOutput = result.stdout.length === 0 && result.stderr.length === 0;
      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Devory: factory run failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`,
        );
        return;
      }
      if (noOutput) {
        runOutput.append("[Devory] No output received — no ready tasks detected.\n");
      }
      vscode.window.showInformationMessage(
        "Devory: factory run completed. Use Devory: Inspect Recent Runs to review the result.",
      );
    },
  });

  if (!started.started) {
    const startFailureReason = started.reason;
    appendFinalOutcome("blocked", startFailureReason);
    vscode.window.showInformationMessage(`Devory: ${startFailureReason}`);
  }
}
