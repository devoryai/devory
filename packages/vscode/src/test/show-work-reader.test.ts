import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readShowWorkData } from "../lib/show-work-reader.js";

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
  fs.mkdirSync(path.join(tasksDir, "doing"), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, "review"), { recursive: true });
  fs.mkdirSync(path.join(artifactsDir, "heartbeats"), { recursive: true });
  fs.mkdirSync(path.join(artifactsDir, "routing-outcomes"), { recursive: true });
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

describe("readShowWorkData", () => {
  test("returns null routing truth when no outcome ledger exists", () => {
    const { tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "doing", "factory-411", "Show Work Truth");

    const data = readShowWorkData(tasksDir, artifactsDir);

    assert.equal(data.doingTasks.length, 1);
    assert.equal(data.routingTruth, null);
  });

  test("prefers the latest routing record for the active heartbeat run", () => {
    const { tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "doing", "factory-411", "Show Work Truth");
    writeHeartbeat(artifactsDir, { run_id: "run-active" });
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
    const { tasksDir, artifactsDir } = makeWorkspace();
    writeTask(tasksDir, "review", "factory-412", "Route Messaging");
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
    assert.equal(
      data.routingTruth?.reason,
      "Cloud execution is disabled by policy."
    );
    assert.equal(data.routingTruth?.decompositionRecommended, true);
  });
});
