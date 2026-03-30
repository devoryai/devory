import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  RUN_LEDGER_VERSION,
  normalizeRunRecord,
  normalizeTaskRecord,
} from "./run-ledger.ts";

describe("normalizeTaskRecord", () => {
  test("fills routing evidence placeholders for legacy task records", () => {
    const task = normalizeTaskRecord({
      task_id: "factory-001",
      outcome: "success",
      engine: "claude",
      fallback_taken: false,
      start_time: "2026-03-28T10:00:00.000Z",
      end_time: "2026-03-28T10:01:00.000Z",
      notes: ["ok"],
    });

    assert.ok(task);
    assert.equal(task?.routing_evidence.routing_decision, null);
    assert.equal(task?.routing_evidence.input_snapshot.routing_decision_id, null);
    assert.deepEqual(task?.routing_evidence.input_snapshot.related_routing_decision_ids, []);
    assert.equal(task?.routing_evidence.requested_role, null);
    assert.equal(task?.routing_evidence.selection.selected_engine, "claude");
    assert.equal(task?.routing_evidence.fallback.taken, false);
    assert.equal(task?.routing_evidence.usage.spend_units, null);
    assert.equal(task?.routing_evidence.outcome.outcome_label, "success");
    assert.equal(task?.routing_evidence.outcome.evaluation, null);
    assert.equal(task?.block_state, null);
  });
});

describe("normalizeRunRecord", () => {
  test("normalizes legacy runs into the durable ledger schema", () => {
    const run = normalizeRunRecord({
      run_id: "run-001",
      status: "completed",
      task_queue: ["factory-001"],
      tasks_executed: [
        {
          task_id: "factory-001",
          outcome: "success",
          engine: "claude",
          fallback_taken: true,
          start_time: "2026-03-28T10:00:00.000Z",
          end_time: "2026-03-28T10:01:00.000Z",
          notes: ["fallback path used"],
          model_id: "claude-sonnet",
          spend_units: 7,
        },
      ],
      failure: null,
      start_time: "2026-03-28T10:00:00.000Z",
      end_time: "2026-03-28T10:02:00.000Z",
    });

    assert.ok(run);
    assert.equal(run?.routing_ledger.version, RUN_LEDGER_VERSION);
    assert.equal(run?.routing_ledger.compatibility_mode, "legacy-normalized");
    assert.equal(run?.routing_ledger.run_summary.total_tasks, 1);
    assert.equal(run?.routing_ledger.run_summary.fallback_count, 1);
    assert.equal(run?.tasks_executed[0].routing_evidence.selection.selected_model, "claude-sonnet");
    assert.equal(run?.tasks_executed[0].routing_evidence.usage.spend_units, 7);
    assert.equal(run?.unattended_execution, null);
    assert.deepEqual(run?.progress_events, []);
    assert.equal(run?.interruption_state, null);
  });

  test("preserves native ledger summaries when present", () => {
    const run = normalizeRunRecord({
      run_id: "run-002",
      status: "failed",
      task_queue: ["factory-002"],
      tasks_executed: [],
      failure: {
        task_id: "factory-002",
        reason: "boom",
        timestamp: "2026-03-28T10:01:00.000Z",
      },
      spend_units_consumed: 0,
      cost_events: [],
      start_time: "2026-03-28T10:00:00.000Z",
      end_time: "2026-03-28T10:01:00.000Z",
      routing_ledger: {
        version: RUN_LEDGER_VERSION,
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
          providers_used: ["anthropic"],
          models_used: ["claude-sonnet"],
          spend_units_consumed: 0,
          prompt_tokens: null,
          completion_tokens: null,
          total_tokens: null,
        },
        outcome_placeholders: {
          requested_by: "operator",
          operator_summary: null,
          post_run_review: null,
        },
      },
    });

    assert.ok(run);
    assert.equal(run?.routing_ledger.compatibility_mode, "native");
    assert.deepEqual(run?.routing_ledger.run_summary.providers_used, ["anthropic"]);
    assert.deepEqual(run?.routing_ledger.run_summary.models_used, ["claude-sonnet"]);
    assert.equal(run?.routing_ledger.outcome_placeholders.requested_by, "operator");
  });

  test("preserves unified routing decision records when present", () => {
    const run = normalizeRunRecord({
      run_id: "run-003",
      status: "completed",
      task_queue: ["factory-003"],
      tasks_executed: [
        {
          task_id: "factory-003",
          outcome: "success",
          engine: "claude",
          fallback_taken: false,
          start_time: "2026-03-28T10:00:00.000Z",
          end_time: "2026-03-28T10:01:00.000Z",
          notes: [],
          model_id: "claude-sonnet",
          routing_evidence: {
            routing_decision: {
              version: "routing-decision-v1",
              policy: "deterministic-rule-based",
              deterministic: true,
              status: "selected",
              linkage: {
                decision_id: "route-factory-003-run-003-pipeline-stage-attempt-na",
                task_id: "factory-003",
                run_id: "run-003",
                pipeline_run_id: null,
                stage_name: "implementation",
                attempt_number: null,
              },
              normalized_input: null,
              engine: "claude",
              provider: "anthropic",
              model_id: "claude-sonnet",
              model_display_name: "Claude Sonnet",
              rationale: ["selected deterministically"],
              failure_reasons: [],
              fallback_path: {
                taken: false,
                selected_model_id: "claude-sonnet",
                candidate_model_ids: ["claude-haiku"],
                rejected_primary_candidates: [],
                reasons: [],
              },
            },
            requested_role: "backend-builder",
            input_snapshot: {
              routing_decision_id: "route-factory-003-run-003-pipeline-stage-attempt-na",
              related_routing_decision_ids: ["route-factory-003-run-003-pipeline-stage-attempt-na"],
              requested_role: "backend-builder",
              requested_engine: "claude",
              requested_pipeline: null,
              task_branch: "feature/factory-003",
              normalized_summary: "Do the thing",
              normalized_input: null,
            },
            selection: {
              selected_engine: "claude",
              selected_provider: "anthropic",
              selected_model: "claude-sonnet",
              rationale: ["selected deterministically"],
            },
            fallback: {
              taken: false,
              reason: null,
              attempted_path: ["claude-sonnet"],
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
              execution_started_at: "2026-03-28T10:00:00.000Z",
              execution_completed_at: "2026-03-28T10:01:00.000Z",
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
              final_stage: "review",
              verification_state: null,
              outcome_label: "success",
              operator_summary: null,
            },
          },
        },
      ],
      failure: null,
      spend_units_consumed: 0,
      cost_events: [],
      start_time: "2026-03-28T10:00:00.000Z",
      end_time: "2026-03-28T10:01:00.000Z",
    });

    assert.ok(run);
    assert.equal(
      run?.tasks_executed[0].routing_evidence.routing_decision?.linkage.decision_id,
      "route-factory-003-run-003-pipeline-stage-attempt-na"
    );
    assert.equal(
      run?.tasks_executed[0].routing_evidence.input_snapshot.routing_decision_id,
      "route-factory-003-run-003-pipeline-stage-attempt-na"
    );
  });

  test("preserves interruption metadata for native runs", () => {
    const run = normalizeRunRecord({
      run_id: "run-004",
      status: "paused_for_review",
      task_queue: ["factory-004"],
      tasks_executed: [
        {
          task_id: "factory-004",
          outcome: "skipped_for_review",
          engine: "claude",
          fallback_taken: false,
          start_time: "2026-03-28T10:00:00.000Z",
          end_time: "2026-03-28T10:01:00.000Z",
          notes: ["human question raised"],
          block_state: {
            kind: "human-question",
            question_id: "hq-004",
            dependency_task_id: null,
            reason: "Need operator choice.",
            since: "2026-03-28T10:01:00.000Z",
            interruption_level: "level_2",
            fallback_behavior: "pause-affected-lane",
          },
        },
      ],
      failure: null,
      spend_units_consumed: 0,
      cost_events: [],
      start_time: "2026-03-28T10:00:00.000Z",
      end_time: "2026-03-28T10:01:00.000Z",
      interruption_state: {
        active: true,
        question_id: "hq-004",
        blocking_task_id: "factory-004",
        lane_id: "default",
        interruption_level: "level_2",
        fallback_behavior: "pause-affected-lane",
        run_disposition: "pause",
        lane_state: "paused",
        updated_at: "2026-03-28T10:01:00.000Z",
      },
    });

    assert.equal(run?.interruption_state?.question_id, "hq-004");
    assert.equal(run?.interruption_state?.run_disposition, "pause");
    assert.equal(run?.tasks_executed[0]?.block_state?.kind, "human-question");
    assert.equal(run?.tasks_executed[0]?.block_state?.interruption_level, "level_2");
  });

  test("preserves unattended execution snapshots and progress events", () => {
    const run = normalizeRunRecord({
      run_id: "run-005",
      status: "running",
      task_queue: ["factory-005"],
      tasks_executed: [],
      failure: null,
      spend_units_consumed: 0,
      cost_events: [],
      start_time: "2026-03-28T10:00:00.000Z",
      end_time: null,
      unattended_execution: {
        run_id: "run-005",
        status: "active",
        worker_health: "healthy",
        heartbeat: {
          captured_at: "2026-03-28T10:00:05.000Z",
          age_ms: 1000,
        },
        progress: {
          latest_event_id: "evt-1",
          latest_event_at: "2026-03-28T10:00:05.000Z",
          sequence: 1,
          category: "session_started",
          summary: "Worker session started.",
        },
        checkpoint: {},
        recovery: {
          state: "not_attempted",
          attempts: 0,
        },
        escalation: {
          required: false,
        },
      },
      progress_events: [
        {
          event_id: "evt-1",
          sequence: 1,
          category: "session_started",
          status: "starting",
          task_id: "factory-005",
          created_at: "2026-03-28T10:00:05.000Z",
          summary: "Worker session started.",
          details: ["adapter boot complete"],
        },
      ],
    });

    assert.equal(run?.unattended_execution?.status, "active");
    assert.equal(run?.progress_events.length, 1);
    assert.equal(run?.progress_events[0]?.category, "session_started");
    assert.equal(run?.progress_events[0]?.status, "starting");
  });
});
