import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readShowWorkData } from "../lib/show-work-reader.js";
import type { RunRecord } from "@devory/core";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeWorkspace(): { root: string; tasksDir: string; artifactsDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-show-work-"));
  tempRoots.push(root);
  const tasksDir = path.join(root, "tasks");
  const artifactsDir = path.join(root, "artifacts");
  const runsDir = path.join(root, "runs");
  fs.mkdirSync(path.join(tasksDir, "doing"), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, "review"), { recursive: true });
  fs.mkdirSync(path.join(artifactsDir, "heartbeats"), { recursive: true });
  fs.mkdirSync(path.join(artifactsDir, "routing-outcomes"), { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });
  return { root, tasksDir, artifactsDir };
}

function writeTask(
  tasksDir: string,
  stage: "doing" | "review",
  id: string,
  title: string
): void {
  fs.writeFileSync(
    path.join(tasksDir, stage, `${id}.md`),
    `---\nid: ${id}\ntitle: ${title}\nproject: devory\nstatus: ${stage}\npriority: medium\nagent: fullstack-builder\nfiles_likely_affected:\n  - packages/vscode/src/commands/run-start.ts\n---\n\n## Goal\nTest.\n\n## Context\nTest.\n\n## Acceptance Criteria\n- Test.\n\n## Expected Artifacts\n- Test.\n\n## Failure Conditions\n- Test.\n`,
    "utf-8"
  );
}

function writeHeartbeat(
  artifactsDir: string,
  overrides: Record<string, unknown> = {}
): void {
  fs.writeFileSync(
    path.join(artifactsDir, "heartbeats", "latest.json"),
    JSON.stringify({
      run_id: "run-active",
      current_phase: "executing",
      current_task_id: "factory-411",
      current_adapter: "openai",
      recent_event_summary: "Executing current task.",
      last_heartbeat_at: new Date().toISOString(),
      ...overrides,
    }),
    "utf-8"
  );
}

function writeOutcomeLedger(artifactsDir: string, lines: object[]): void {
  fs.writeFileSync(
    path.join(artifactsDir, "routing-outcomes", "execution-outcomes.jsonl"),
    lines.map((line) => JSON.stringify(line)).join("\n"),
    "utf-8"
  );
}

function writeRun(root: string, run: RunRecord): void {
  fs.writeFileSync(
    path.join(root, "runs", `${run.run_id}.json`),
    JSON.stringify(run),
    "utf-8"
  );
}

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    run_id: "run-active",
    status: "completed",
    task_queue: ["factory-411"],
    tasks_executed: [
      {
        task_id: "factory-411",
        outcome: "success",
        engine: "ollama",
        fallback_taken: false,
        start_time: "2026-04-15T00:05:00.000Z",
        end_time: "2026-04-15T00:06:00.000Z",
        notes: [],
        model_id: "ollama:qwen2.5-coder:14b",
        cost_tier: null,
        spend_units: null,
        cost_guardrail_status: null,
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
            selected_engine: "ollama",
            selected_provider: "local_ollama",
            selected_model: "ollama:qwen2.5-coder:14b",
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
            execution_started_at: "2026-04-15T00:05:00.000Z",
            execution_completed_at: "2026-04-15T00:06:00.000Z",
          },
          usage: {
            prompt_tokens: null,
            completion_tokens: null,
            total_tokens: null,
            spend_units: null,
            estimated_cost_usd: null,
            cost_tier: null,
          },
          outcome: {
            final_stage: "done",
            verification_state: "passed",
            outcome_label: "success",
            operator_summary: null,
            evaluation: null,
          },
        },
        block_state: null,
      },
    ],
    failure: null,
    spend_units_consumed: 0,
    cost_events: [],
    start_time: "2026-04-15T00:05:00.000Z",
    end_time: "2026-04-15T00:06:00.000Z",
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
        engines_used: ["ollama"],
        providers_used: ["local_ollama"],
        models_used: ["ollama:qwen2.5-coder:14b"],
        spend_units_consumed: 0,
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
    progress_events: [
      {
        event_id: "evt-1",
        sequence: 1,
        category: "status",
        status: "active",
        task_id: "factory-411",
        created_at: "2026-04-15T00:05:30.000Z",
        summary: "Using Ollama (qwen2.5-coder:14b)",
        details: [],
      },
    ],
    interruption_state: null,
    ...overrides,
  };
}

describe("readShowWorkData", () => {
  test("returns null routing truth when no outcome ledger exists", () => {
    const { tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "doing", "factory-411", "Show Work Truth");

    const data = readShowWorkData(tasksDir, artifactsDir);

    assert.equal(data.doingTasks.length, 1);
    assert.equal(data.routingTruth, null);
    assert.ok(Array.isArray(data.providerReadiness));
    assert.ok(data.providerReadiness.length > 0);
  });

  test("prefers the latest routing record for the active heartbeat run", () => {
    const { root, tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "doing", "factory-411", "Show Work Truth");
    writeHeartbeat(artifactsDir, { run_id: "run-active" });
    writeRun(root, makeRun());
    writeOutcomeLedger(artifactsDir, [
      {
        version: "execution-outcome-v1",
        outcome_id: "old",
        sequence: 1,
        recorded_at: "2026-04-15T00:00:00.000Z",
        run_id: "run-other",
        task_ids: ["factory-410"],
        selected_provider_class: "local_ollama",
        selected_target_id: "ollama:qwen2.5-coder:14b",
        selected_adapter_id: "ollama",
        actual_provider_class: "local_ollama",
        actual_target_id: "ollama:qwen2.5-coder:14b",
        actual_adapter_id: "ollama",
        preference_used: "auto",
        fallback_taken: false,
        fallback_reason: null,
        readiness_state: "ready",
        execution_path: "packaged_runner:ollama",
        estimated_cost_usd_min: null,
        estimated_cost_usd_max: null,
        run_result_status: "completed",
        failure_reason: null,
        learnable: true,
        decomposition_recommended: false,
      },
      {
        version: "execution-outcome-v1",
        outcome_id: "active",
        sequence: 2,
        recorded_at: "2026-04-15T00:05:00.000Z",
        run_id: "run-active",
        task_ids: ["factory-411"],
        selected_provider_class: "local_ollama",
        selected_target_id: "ollama:qwen2.5-coder:14b",
        selected_adapter_id: "ollama",
        actual_provider_class: "cloud_premium",
        actual_target_id: "cloud:gpt-5-mini",
        actual_adapter_id: "openai",
        preference_used: "auto",
        fallback_taken: true,
        fallback_reason: "Local model (Ollama) not available",
        readiness_state: "unavailable",
        execution_path: "packaged_runner:openai",
        estimated_cost_usd_min: null,
        estimated_cost_usd_max: null,
        run_result_status: "completed",
        failure_reason: null,
        learnable: true,
        decomposition_recommended: false,
      },
    ]);

    const data = readShowWorkData(tasksDir, artifactsDir);

    assert.equal(data.routingTruth?.runId, "run-active");
    assert.equal(data.lastRunSummary?.taskCount, 1);
    assert.equal(
      data.lastRunSummary?.primaryProvider,
      "ollama:qwen2.5-coder:14b"
    );
    assert.equal(data.lastRunSummary?.fallbackOccurred, true);
    assert.equal(data.recentActivity[0]?.detail, "Local model (Ollama) not available");
    assert.equal(
      data.routingTruth?.selectedRoute,
      "local_ollama -> ollama:qwen2.5-coder:14b via ollama"
    );
    assert.equal(
      data.routingTruth?.actualRoute,
      "cloud_premium -> cloud:gpt-5-mini via openai"
    );
    assert.equal(data.routingTruth?.fallbackTaken, true);
    assert.equal(
      data.routingTruth?.reason,
      "Local model (Ollama) not available"
    );
  });

  test("falls back to the most recent routing record when no active heartbeat run exists", () => {
    const { root, tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "review", "factory-412", "Route Messaging");
    writeRun(
      root,
      makeRun({
        run_id: "run-2",
        status: "failed",
        failure: {
          task_id: "factory-412",
          reason: "Cloud execution is disabled by policy.",
          timestamp: "2026-04-15T00:06:30.000Z",
        },
        routing_ledger: {
          version: "routing-evidence-v1",
          compatibility_mode: "native",
          run_summary: {
            total_tasks: 1,
            tasks_executed_count: 0,
            tasks_remaining_count: 1,
            success_count: 0,
            failure_count: 0,
            review_count: 0,
            fallback_count: 0,
            retry_count: 0,
            engines_used: [],
            providers_used: ["cloud_premium"],
            models_used: ["cloud:gpt-5-mini"],
            spend_units_consumed: 0,
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
      })
    );
    writeOutcomeLedger(artifactsDir, [
      {
        version: "execution-outcome-v1",
        outcome_id: "old",
        sequence: 1,
        recorded_at: "2026-04-15T00:00:00.000Z",
        run_id: "run-1",
        task_ids: ["factory-410"],
        selected_provider_class: "local_ollama",
        selected_target_id: "ollama:qwen2.5-coder:14b",
        selected_adapter_id: "ollama",
        actual_provider_class: "local_ollama",
        actual_target_id: "ollama:qwen2.5-coder:14b",
        actual_adapter_id: "ollama",
        preference_used: "auto",
        fallback_taken: false,
        fallback_reason: null,
        readiness_state: "ready",
        execution_path: "packaged_runner:ollama",
        estimated_cost_usd_min: null,
        estimated_cost_usd_max: null,
        run_result_status: "completed",
        failure_reason: null,
        learnable: true,
        decomposition_recommended: false,
      },
      {
        version: "execution-outcome-v1",
        outcome_id: "new",
        sequence: 2,
        recorded_at: "2026-04-15T00:06:00.000Z",
        run_id: "run-2",
        task_ids: ["factory-412"],
        selected_provider_class: "cloud_premium",
        selected_target_id: "cloud:gpt-5-mini",
        selected_adapter_id: "openai",
        actual_provider_class: "cloud_premium",
        actual_target_id: "cloud:gpt-5-mini",
        actual_adapter_id: "openai",
        preference_used: "force_cloud",
        fallback_taken: false,
        fallback_reason: null,
        readiness_state: "ready",
        execution_path: "packaged_runner:openai",
        estimated_cost_usd_min: null,
        estimated_cost_usd_max: null,
        run_result_status: "blocked",
        failure_reason: "Cloud execution is disabled by policy.",
        learnable: false,
        decomposition_recommended: true,
      },
    ]);

    const data = readShowWorkData(tasksDir, artifactsDir);

    assert.equal(data.routingTruth?.runId, "run-2");
    assert.equal(data.routingTruth?.status, "blocked");
    assert.equal(data.lastRunSummary?.result, "Failed");
    assert.equal(
      data.failureSummary?.reason,
      "Cloud execution is disabled by policy."
    );
    assert.equal(
      data.failureSummary?.fallback,
      "No fallback available under current policy."
    );
    assert.equal(
      data.routingTruth?.reason,
      "Cloud execution is disabled by policy."
    );
    assert.equal(data.routingTruth?.decompositionRecommended, true);
  });

  test("prefers the runtime failure over fallback text when a fallback run fails", () => {
    const { tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "review", "factory-413", "Fallback Failure");
    writeOutcomeLedger(artifactsDir, [
      {
        version: "execution-outcome-v1",
        outcome_id: "fallback-failed",
        sequence: 1,
        recorded_at: "2026-04-15T00:07:00.000Z",
        run_id: "run-3",
        task_ids: ["factory-413"],
        selected_provider_class: "local_ollama",
        selected_target_id: "ollama:qwen2.5-coder:14b",
        selected_adapter_id: "ollama",
        actual_provider_class: "cloud_premium",
        actual_target_id: "cloud:gpt-5-mini",
        actual_adapter_id: "openai",
        preference_used: "prefer_local",
        fallback_taken: true,
        fallback_reason: "Local model (Ollama) not available",
        readiness_state: "configured_but_unverified",
        execution_path: "packaged_runner:openai",
        estimated_cost_usd_min: null,
        estimated_cost_usd_max: null,
        run_result_status: "failed",
        failure_reason: "Process exited with code 1",
        learnable: false,
        decomposition_recommended: false,
      },
    ]);

    const data = readShowWorkData(tasksDir, artifactsDir);

    assert.equal(data.routingTruth?.status, "failed");
    assert.equal(data.routingTruth?.reason, "Process exited with code 1");
    assert.equal(data.failureSummary?.reason, "Process exited with code 1.");
  });
});
