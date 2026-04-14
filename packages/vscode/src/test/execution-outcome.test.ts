import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type {
  DryRunEstimate,
  ExecutionBindingResult,
  RunRecord,
  TaskProfile,
} from "@devory/core";
import {
  appendExecutionOutcomeRecord,
  buildRunStartOutcome,
  createExecutionOutcomeSession,
  EXECUTION_OUTCOME_ARTIFACT,
  finalizeExecutionOutcome,
} from "../lib/execution-outcome.js";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeFactoryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-execution-outcome-"));
  tempRoots.push(root);
  return root;
}

function makeBinding(
  overrides: Partial<ExecutionBindingResult> = {}
): ExecutionBindingResult {
  return {
    selected_provider_class: "cloud_premium",
    execution_path: "cloud_api",
    preference_applied: "prefer_local",
    fallback_taken: true,
    originally_targeted_class: "local_ollama",
    fallback_reason: "Local model (Ollama) not available",
    force_local_violated: false,
    warnings: [],
    decomposition_recommended: true,
    decomposition_note: "Task appears broad.",
    route_mode: "local-unavailable-fallback",
    binding_summary: "summary",
    per_task_bindings: [],
    cloud_confirmation_required: false,
    blocked_by_policy: false,
    policy_block_reason: null,
    policy_effects: [],
    selected_target_id: "ollama:deepseek-coder:6.7b",
    actual_target_id: "openai:gpt-5.4",
    selected_adapter_id: "ollama-cli",
    actual_adapter_id: "openai-api",
    adapter_id: "openai-api",
    selected_execution_path: "packaged_runner:ollama",
    actual_execution_path: "packaged_runner:openai",
    adapter_fallback_taken: true,
    adapter_fallback_reason: "Selected adapter changed to openai-api.",
    adapter_resolution_note: "openai adapter selected",
    target_fallback_taken: true,
    target_fallback_reason: "Preferred target is unavailable; using openai:gpt-5.4.",
    target_resolution: null,
    target_readiness_state: "available",
    target_readiness_detail: "Target is available.",
    fallback_cause: "readiness",
    target_fallback_cause: "readiness",
    ...overrides,
  } as ExecutionBindingResult;
}

function makeTaskProfile(
  overrides: Partial<TaskProfile> = {}
): TaskProfile {
  return {
    complexity_tier: "medium",
    context_size_tier: "medium",
    output_size_tier: "small",
    local_viability: "marginal",
    decomposition_candidate: true,
    recommended_provider_class: "cloud",
    signals: {
      body_length: 1000,
      acceptance_criteria_length: 200,
      verification_length: 50,
      files_likely_affected_count: 3,
      dependency_count: 1,
      task_type: "feature",
      context_intensity_hint: "medium",
      has_preferred_models: false,
      has_disallowed_models: false,
    },
    reasons: ["medium complexity"],
    ...overrides,
  } as TaskProfile;
}

function makeEstimate(): DryRunEstimate {
  return {
    runner: "local-packaged-runner",
    model_display_name: "GPT-5.4",
    model_id: "gpt-5.4",
    provider: "openai",
    context_tier: "medium",
    output_tier: "small",
    confidence: "medium",
    estimated_cost_usd: {
      min: 0.12,
      max: 0.34,
    },
    factors: {
      file_count: 2,
      acceptance_criteria_length: 120,
      verification_length: 40,
      task_body_length: 800,
      files_likely_affected_count: 2,
    },
    suggestions: [],
  } as unknown as DryRunEstimate;
}

function makeRunRecord(
  overrides: Partial<RunRecord> = {}
): RunRecord {
  return {
    run_id: "orchestrator-run-1",
    status: "completed",
    task_queue: ["factory-401"],
    tasks_executed: [
      {
        task_id: "factory-401",
        outcome: "success",
        engine: "openai",
        fallback_taken: false,
        start_time: "2026-04-14T10:00:00.000Z",
        end_time: "2026-04-14T10:02:00.000Z",
        notes: [],
        model_id: "gpt-5.4",
        cost_tier: "medium",
        spend_units: 1,
        cost_guardrail_status: "allow",
        cost_guardrail_notes: [],
        routing_evidence: {
          routing_decision: null,
          requested_role: null,
          input_snapshot: {
            routing_decision_id: null,
            related_routing_decision_ids: [],
            requested_role: null,
            requested_engine: null,
            requested_pipeline: null,
            task_branch: null,
            normalized_summary: null,
            normalized_input: null,
          },
          selection: {
            selected_engine: "openai",
            selected_provider: "openai",
            selected_model: "gpt-5.4",
            rationale: [],
          },
          fallback: {
            taken: false,
            reason: null,
            attempted_path: [],
          },
          retries: {
            attempts: 0,
            resumed_from_run_id: null,
            history: [],
          },
          timing: {
            queued_at: null,
            routing_started_at: null,
            routing_completed_at: null,
            execution_started_at: "2026-04-14T10:00:00.000Z",
            execution_completed_at: "2026-04-14T10:02:00.000Z",
          },
          usage: {
            prompt_tokens: null,
            completion_tokens: null,
            total_tokens: null,
            spend_units: 1,
            estimated_cost_usd: null,
            cost_tier: "medium",
          },
          outcome: {
            final_stage: "review",
            verification_state: null,
            outcome_label: "success",
            operator_summary: null,
            evaluation: null,
          },
        },
        block_state: null,
      },
    ],
    failure: null,
    spend_units_consumed: 1,
    cost_events: [],
    start_time: "2026-04-14T10:00:00.000Z",
    end_time: "2026-04-14T10:02:00.000Z",
    routing_ledger: {
      version: "routing-evidence-v1",
      compatibility_mode: "native",
      run_summary: {
        total_tasks: 1,
        tasks_executed_count: 1,
        tasks_remaining_count: 0,
        success_count: 1,
        failure_count: 0,
        review_count: 0,
        fallback_count: 0,
        retry_count: 0,
        engines_used: ["openai"],
        providers_used: ["openai"],
        models_used: ["gpt-5.4"],
        spend_units_consumed: 1,
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
      },
      outcome_placeholders: {
        requested_by: null,
        operator_summary: null,
        post_run_review: null,
      },
    },
    unattended_execution: null,
    progress_events: [],
    interruption_state: null,
    ...overrides,
  } as RunRecord;
}

describe("execution outcome helpers", () => {
  test("creates a compact start record that preserves selected vs actual routing data", () => {
    const session = createExecutionOutcomeSession("2026-04-14T10:00:00.000Z");
    const record = buildRunStartOutcome(
      session,
      {
        timestamp: "2026-04-14T10:00:01.000Z",
        task_ids: ["factory-401"],
        task_profiles: [makeTaskProfile()],
        binding: makeBinding(),
        estimate: makeEstimate(),
        preference_used: "prefer_local",
      },
      "orchestrator-run-1"
    );

    assert.equal(record.run_id, "orchestrator-run-1");
    assert.equal(record.selected_provider_class, "local_ollama");
    assert.equal(record.actual_provider_class, "cloud_premium");
    assert.equal(record.selected_target_id, "ollama:deepseek-coder:6.7b");
    assert.equal(record.actual_target_id, "openai:gpt-5.4");
    assert.equal(record.selected_adapter_id, "ollama-cli");
    assert.equal(record.actual_adapter_id, "openai-api");
    assert.equal(record.fallback_taken, true);
    assert.equal(record.fallback_reason, "Local model (Ollama) not available");
    assert.equal(record.run_result_status, null);
    assert.equal(record.failure_reason, null);
    assert.equal(record.learnable, null);
    assert.equal(record.task_profile_summary?.decomposition_candidates, 1);
    assert.equal(record.estimated_cost_usd_min, 0.12);
    assert.equal(record.estimated_cost_usd_max, 0.34);
  });

  test("finalizes records on success using the persisted run record", () => {
    const session = createExecutionOutcomeSession("2026-04-14T10:00:00.000Z");
    const started = buildRunStartOutcome(
      session,
      {
        timestamp: "2026-04-14T10:00:01.000Z",
        task_ids: ["factory-401"],
        task_profiles: [makeTaskProfile()],
        binding: makeBinding(),
        estimate: makeEstimate(),
        preference_used: "prefer_local",
      },
      "orchestrator-run-1"
    );

    const finalized = finalizeExecutionOutcome(
      started,
      { ...session, next_sequence: 2 },
      {
        timestamp: "2026-04-14T10:02:00.000Z",
        run_id: "orchestrator-run-1",
        run_record: makeRunRecord(),
        exit_code: 0,
        signal: null,
        no_output: false,
      }
    );

    assert.equal(finalized.sequence, 2);
    assert.equal(finalized.run_result_status, "completed");
    assert.equal(finalized.failure_reason, null);
    assert.equal(finalized.learnable, true);
  });

  test("finalizes records on failure and preserves surfaced failure reason", () => {
    const session = createExecutionOutcomeSession("2026-04-14T10:00:00.000Z");
    const started = buildRunStartOutcome(
      session,
      {
        timestamp: "2026-04-14T10:00:01.000Z",
        task_ids: ["factory-401"],
        task_profiles: [makeTaskProfile()],
        binding: makeBinding(),
        estimate: makeEstimate(),
        preference_used: "prefer_local",
      },
      "orchestrator-run-1"
    );

    const finalized = finalizeExecutionOutcome(
      started,
      { ...session, next_sequence: 2 },
      {
        timestamp: "2026-04-14T10:02:00.000Z",
        run_id: "orchestrator-run-1",
        run_record: makeRunRecord({
          status: "failed",
          failure: {
            task_id: "factory-401",
            reason: "Runner crashed during execution.",
            timestamp: "2026-04-14T10:02:00.000Z",
          },
          tasks_executed: [
            {
              ...makeRunRecord().tasks_executed[0]!,
              outcome: "failure",
            },
          ],
        }),
        exit_code: 1,
        signal: null,
        no_output: false,
      }
    );

    assert.equal(finalized.run_result_status, "failed");
    assert.equal(finalized.failure_reason, "Runner crashed during execution.");
    assert.equal(finalized.learnable, false);
  });

  test("finalizes records on cancel when the process is stopped", () => {
    const session = createExecutionOutcomeSession("2026-04-14T10:00:00.000Z");
    const started = buildRunStartOutcome(
      session,
      {
        timestamp: "2026-04-14T10:00:01.000Z",
        task_ids: ["factory-401"],
        task_profiles: [makeTaskProfile()],
        binding: makeBinding(),
        estimate: makeEstimate(),
        preference_used: "prefer_local",
      },
      "orchestrator-run-1"
    );

    const finalized = finalizeExecutionOutcome(
      started,
      { ...session, next_sequence: 2 },
      {
        timestamp: "2026-04-14T10:02:00.000Z",
        run_id: "orchestrator-run-1",
        run_record: makeRunRecord({
          status: "failed",
          failure: {
            task_id: "factory-401",
            reason: "Run stopped by operator at a safe checkpoint.",
            timestamp: "2026-04-14T10:02:00.000Z",
          },
        }),
        exit_code: 0,
        signal: null,
        no_output: false,
      }
    );

    assert.equal(finalized.run_result_status, "cancelled");
    assert.equal(finalized.failure_reason, "Run stopped by operator at a safe checkpoint.");
    assert.equal(finalized.learnable, null);
  });

  test("captures blocked and no-op outcomes without inventing unavailable fields", () => {
    const session = createExecutionOutcomeSession("2026-04-14T10:00:00.000Z");
    const blockedStart = buildRunStartOutcome(
      session,
      {
        timestamp: "2026-04-14T10:00:01.000Z",
        task_ids: ["factory-401"],
        task_profiles: [],
        binding: makeBinding({
          selected_target_id: null,
          actual_target_id: null,
          selected_adapter_id: null,
          actual_adapter_id: null,
          actual_execution_path: null,
          target_readiness_detail: null,
        }),
        estimate: null,
        preference_used: "force_local",
      },
      null
    );

    const blocked = finalizeExecutionOutcome(
      blockedStart,
      { ...session, next_sequence: 2 },
      {
        timestamp: "2026-04-14T10:00:02.000Z",
        exit_code: 0,
        signal: null,
        no_output: false,
        failure_reason: "Force local is selected, but no local provider is available.",
      }
    );

    const noop = finalizeExecutionOutcome(
      blockedStart,
      { ...session, next_sequence: 3 },
      {
        timestamp: "2026-04-14T10:00:03.000Z",
        exit_code: 0,
        signal: null,
        no_output: true,
      }
    );

    assert.equal(blocked.selected_target_id, null);
    assert.equal(blocked.actual_target_id, null);
    assert.equal(blocked.selected_adapter_id, null);
    assert.equal(blocked.actual_adapter_id, null);
    assert.equal(blocked.task_profile_summary, null);
    assert.equal(blocked.estimated_cost_usd_min, null);
    assert.equal(blocked.estimated_cost_usd_max, null);
    assert.equal(blocked.failure_reason, "Force local is selected, but no local provider is available.");
    assert.equal(noop.run_result_status, "no-op");
    assert.equal(noop.failure_reason, null);
  });

  test("appends JSONL outcome snapshots under the routing outcomes artifact path", () => {
    const factoryRoot = makeFactoryRoot();
    const session = createExecutionOutcomeSession("2026-04-14T10:00:00.000Z");
    const record = buildRunStartOutcome(
      session,
      {
        timestamp: "2026-04-14T10:00:01.000Z",
        task_ids: ["factory-401"],
        task_profiles: [makeTaskProfile()],
        binding: makeBinding(),
        estimate: makeEstimate(),
        preference_used: "prefer_local",
      },
      "orchestrator-run-1"
    );

    const artifactPath = appendExecutionOutcomeRecord(factoryRoot, record);
    const raw = fs.readFileSync(artifactPath, "utf-8").trim();

    assert.equal(
      artifactPath,
      path.join(factoryRoot, EXECUTION_OUTCOME_ARTIFACT)
    );
    assert.deepEqual(JSON.parse(raw), record);
  });
});
