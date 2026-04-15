import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseExecutionOutcomeLine,
  readExecutionOutcomeLedger,
  renderExecutionOutcomeSummary,
  summarizeExecutionOutcomes,
} from "../lib/execution-outcome-summary.js";
import type { ExecutionOutcomeRecord } from "../lib/execution-outcome.js";

function makeRecord(
  overrides: Partial<ExecutionOutcomeRecord> = {}
): ExecutionOutcomeRecord {
  return {
    version: "execution-outcome-v1",
    outcome_id: "routing-outcome-1",
    sequence: 1,
    recorded_at: "2026-04-14T12:00:00.000Z",
    run_id: "orchestrator-run-1",
    task_ids: ["factory-401"],
    task_profile_summary: null,
    selected_provider_class: "local_ollama",
    selected_target_id: "ollama:deepseek-coder:6.7b",
    selected_adapter_id: "ollama-cli",
    actual_provider_class: "cloud_premium",
    actual_target_id: "openai:gpt-5.4",
    actual_adapter_id: "openai-api",
    preference_used: "prefer_local",
    fallback_taken: true,
    fallback_reason: "Local model (Ollama) not available",
    readiness_state: "available",
    execution_path: "packaged_runner:openai",
    estimated_cost_usd_min: 0.1,
    estimated_cost_usd_max: 0.3,
    run_result_status: "completed",
    failure_reason: null,
    learnable: true,
    decomposition_recommended: false,
    ...overrides,
  };
}

describe("execution outcome summary", () => {
  test("aggregates provider, target, fallback, blocked, and status counts", () => {
    const records = [
      makeRecord(),
      makeRecord({
        outcome_id: "routing-outcome-2",
        sequence: 2,
        selected_provider_class: "cloud_premium",
        selected_target_id: "openai:gpt-5.4",
        actual_provider_class: "cloud_premium",
        actual_target_id: "openai:gpt-5.4",
        fallback_taken: false,
        fallback_reason: null,
        run_result_status: "failed",
        failure_reason: "Runner crashed during execution.",
      }),
      makeRecord({
        outcome_id: "routing-outcome-3",
        sequence: 3,
        selected_provider_class: "deterministic",
        selected_target_id: null,
        actual_provider_class: "deterministic",
        actual_target_id: null,
        fallback_taken: false,
        fallback_reason: null,
        run_result_status: "blocked",
        failure_reason: "Cloud execution is disabled by policy.",
      }),
    ];

    const summary = summarizeExecutionOutcomes(records);

    assert.equal(summary.total_records, 3);
    assert.equal(summary.fallback_count, 1);
    assert.equal(summary.blocked_count, 1);
    assert.equal(summary.route_drift_count, 1);
    assert.deepEqual(summary.selected_provider_counts, {
      cloud_premium: 1,
      deterministic: 1,
      local_ollama: 1,
    });
    assert.deepEqual(summary.actual_provider_counts, {
      cloud_premium: 2,
      deterministic: 1,
    });
    assert.deepEqual(summary.target_counts, {
      "openai:gpt-5.4": 2,
    });
    assert.deepEqual(summary.status_counts, {
      blocked: 1,
      completed: 1,
      failed: 1,
    });
    assert.deepEqual(summary.state_counts, {
      "fallback applied": 1,
      "route drift": 1,
      "policy block": 1,
    });
  });

  test("supports recent-record filtering deterministically", () => {
    const records = [
      makeRecord({ outcome_id: "routing-outcome-1", sequence: 1, run_result_status: "completed" }),
      makeRecord({ outcome_id: "routing-outcome-2", sequence: 2, run_result_status: "failed" }),
      makeRecord({ outcome_id: "routing-outcome-3", sequence: 3, run_result_status: "cancelled" }),
    ];

    const summary = summarizeExecutionOutcomes(records, 0, { last_n: 2 });

    assert.equal(summary.total_records, 2);
    assert.deepEqual(summary.status_counts, {
      cancelled: 1,
      failed: 1,
    });
  });

  test("groups fallback and block reasons from ledger-supported fields", () => {
    const records = [
      makeRecord({
        outcome_id: "routing-outcome-1",
        fallback_reason: "Local model (Ollama) not available",
      }),
      makeRecord({
        outcome_id: "routing-outcome-2",
        fallback_reason: "Local model (Ollama) not available",
        sequence: 2,
      }),
      makeRecord({
        outcome_id: "routing-outcome-3",
        sequence: 3,
        fallback_reason: null,
        failure_reason: "Cloud execution is disabled by policy.",
        run_result_status: "blocked",
      }),
    ];

    const summary = summarizeExecutionOutcomes(records);

    assert.deepEqual(summary.top_reasons, [
      { reason: "Local model (Ollama) not available", count: 2 },
      { reason: "Cloud execution is disabled by policy.", count: 1 },
    ]);
  });

  test("handles empty ledgers and malformed lines", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-outcome-summary-"));
    const filePath = path.join(tempDir, "execution-outcomes.jsonl");
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify(makeRecord()),
        "{not-json",
        "",
      ].join("\n"),
      "utf-8"
    );

    const ledger = readExecutionOutcomeLedger(filePath);
    const emptySummary = summarizeExecutionOutcomes([]);

    assert.equal(ledger.records.length, 1);
    assert.equal(ledger.malformed_lines, 1);
    assert.equal(emptySummary.total_records, 0);
    assert.deepEqual(emptySummary.selected_provider_counts, {});
    assert.deepEqual(emptySummary.status_counts, {});

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("parses valid lines and rejects malformed or wrong-version entries", () => {
    const valid = parseExecutionOutcomeLine(JSON.stringify(makeRecord()));
    const invalidJson = parseExecutionOutcomeLine("{bad");
    const wrongVersion = parseExecutionOutcomeLine(
      JSON.stringify({
        ...makeRecord(),
        version: "other-version",
      })
    );

    assert.equal(valid?.version, "execution-outcome-v1");
    assert.equal(invalidJson, null);
    assert.equal(wrongVersion, null);
  });

  test("renders a compact report with counts and reasons", () => {
    const summary = summarizeExecutionOutcomes([
      makeRecord(),
      makeRecord({
        outcome_id: "routing-outcome-2",
        sequence: 2,
        fallback_taken: false,
        fallback_reason: null,
        run_result_status: "failed",
        failure_reason: "Runner crashed during execution.",
      }),
    ]);

    const report = renderExecutionOutcomeSummary(summary, { last_n: 2 });

    assert.match(report, /Devory Routing Outcome Summary/);
    assert.match(report, /Filters: last 2/);
    assert.match(report, /Total records: 2/);
    assert.match(report, /Fallbacks: 1/);
    assert.match(report, /Selected vs actual drift:/);
    assert.match(report, /Routing States/);
    assert.match(report, /Run Result Statuses/);
    assert.match(report, /Runner crashed during execution\./);
  });
});
