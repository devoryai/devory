import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH,
  applyHumanInterruptionPolicyOverrides,
  getTaskHumanInterruptionPolicyOverrides,
  loadDefaultHumanInterruptionPolicy,
  loadWorkspaceHumanInterruptionPolicy,
  normalizeHumanInterruptionPolicyOverrides,
  resolveHumanInterruptionPolicy,
} from "./human-interruption-policy.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-policy-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadDefaultHumanInterruptionPolicy", () => {
  test("loads shipped defaults from the bundled policy file", () => {
    const policy = loadDefaultHumanInterruptionPolicy();
    assert.equal(policy.default_interruption_level, "level_1");
    assert.equal(policy.default_input_mode, "local-api");
    assert.equal(policy.default_fallback_behavior, "continue-other-work");
    assert.equal(policy.notification_mode, "digest");
    assert.equal(policy.digest_cadence_minutes, 30);
    assert.equal(policy.interruption_thresholds.destructive_change, "level_3");
  });
});

describe("normalizeHumanInterruptionPolicyOverrides", () => {
  test("normalizes partial valid input and ignores invalid fields", () => {
    const overrides = normalizeHumanInterruptionPolicyOverrides({
      default_input_mode: "cli",
      notification_mode: "immediate",
      digest_cadence_minutes: "bogus",
      interruption_thresholds: {
        approval: "level_3",
        credentials: "nope",
      },
    });

    assert.deepEqual(overrides, {
      default_input_mode: "cli",
      notification_mode: "immediate",
      interruption_thresholds: {
        approval: "level_3",
      },
    });
  });

  test("rejects non-object policy input", () => {
    assert.throws(
      () => normalizeHumanInterruptionPolicyOverrides(["not", "an", "object"]),
      /human interruption policy config must be a JSON object/
    );
  });
});

describe("loadWorkspaceHumanInterruptionPolicy", () => {
  test("returns null when no workspace config exists", () => {
    assert.equal(loadWorkspaceHumanInterruptionPolicy(tmpDir), null);
  });

  test("loads partial workspace overrides", () => {
    const configPath = path.join(tmpDir, HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        default_input_mode: "cli",
        timeout_seconds: 600,
        interruption_thresholds: {
          confirmation: "level_2",
        },
      })
    );

    assert.deepEqual(loadWorkspaceHumanInterruptionPolicy(tmpDir), {
      default_input_mode: "cli",
      timeout_seconds: 600,
      interruption_thresholds: {
        confirmation: "level_2",
      },
    });
  });

  test("throws on invalid workspace JSON", () => {
    const configPath = path.join(tmpDir, HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "{ invalid json ");

    assert.throws(
      () => loadWorkspaceHumanInterruptionPolicy(tmpDir),
      /failed to parse config\/human-interruption-policy\.json/
    );
  });
});

describe("getTaskHumanInterruptionPolicyOverrides", () => {
  test("reads supported per-task frontmatter override keys", () => {
    const overrides = getTaskHumanInterruptionPolicyOverrides({
      human_default_interruption_level: "level_2",
      human_default_input_mode: "cli",
      human_allowed_input_modes: ["cli", "digest"],
      human_default_fallback_behavior: "pause-affected-lane",
      human_timeout_seconds: "900",
      human_timeout_on_expiry: "skip-task",
      human_notification_mode: "immediate",
      human_digest_cadence_minutes: "15",
      human_threshold_approval: "level_3",
    });

    assert.deepEqual(overrides, {
      default_interruption_level: "level_2",
      default_input_mode: "cli",
      allowed_input_modes: ["cli", "digest"],
      default_fallback_behavior: "pause-affected-lane",
      timeout_seconds: 900,
      timeout_on_expiry: "skip-task",
      notification_mode: "immediate",
      digest_cadence_minutes: 15,
      interruption_thresholds: {
        approval: "level_3",
      },
    });
  });
});

describe("resolveHumanInterruptionPolicy", () => {
  test("applies shipped defaults, then workspace config, then task overrides", () => {
    const configPath = path.join(tmpDir, HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        default_input_mode: "cli",
        timeout_seconds: 600,
        notification_mode: "digest",
        digest_cadence_minutes: 10,
      })
    );

    const resolution = resolveHumanInterruptionPolicy(tmpDir, {
      human_default_input_mode: "digest",
      human_notification_mode: "immediate",
      human_threshold_external_side_effect: "level_3",
    });

    assert.deepEqual(resolution.applied_layers, [
      "shipped-defaults",
      "workspace-config",
      "task-frontmatter",
    ]);
    assert.equal(resolution.policy.default_input_mode, "digest");
    assert.equal(resolution.policy.timeout_seconds, 600);
    assert.equal(resolution.policy.notification_mode, "immediate");
    assert.equal(resolution.policy.digest_cadence_minutes, null);
    assert.equal(
      resolution.policy.interruption_thresholds.external_side_effect,
      "level_3"
    );
  });

  test("keeps safe defaults when partial overrides omit fields", () => {
    const policy = applyHumanInterruptionPolicyOverrides(
      loadDefaultHumanInterruptionPolicy(),
      {
        default_input_mode: "cli",
      }
    );

    assert.equal(policy.default_input_mode, "cli");
    assert.equal(policy.default_interruption_level, "level_1");
    assert.equal(policy.timeout_seconds, 1800);
  });
});
