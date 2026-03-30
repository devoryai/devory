import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  applyUnattendedStallPolicyOverrides,
  loadDefaultUnattendedStallPolicy,
  loadWorkspaceUnattendedStallPolicy,
  normalizeUnattendedStallPolicyOverrides,
  resolveUnattendedStallPolicy,
} from "./unattended-stall-policy.ts";

describe("unattended stall policy", () => {
  test("loads conservative shipped defaults", () => {
    const policy = loadDefaultUnattendedStallPolicy();
    assert.equal(policy.version, "unattended-stall-policy-v1");
    assert.equal(policy.heartbeat_missing_after_ms, 300000);
    assert.equal(policy.repeated_failure_without_progress_threshold, 3);
  });

  test("normalizes and applies partial overrides deterministically", () => {
    const overrides = normalizeUnattendedStallPolicyOverrides({
      heartbeat_missing_after_ms: 900000,
      looping_event_threshold: 5,
      invalid_field: -1,
    });
    const policy = applyUnattendedStallPolicyOverrides(
      loadDefaultUnattendedStallPolicy(),
      overrides
    );

    assert.equal(policy.heartbeat_missing_after_ms, 900000);
    assert.equal(policy.looping_event_threshold, 5);
    assert.equal(policy.progress_stalled_after_ms, 600000);
  });

  test("loads workspace config and run overrides", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-stall-policy-"));
    const configDir = path.join(root, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "unattended-stall-policy.json"),
      JSON.stringify({
        heartbeat_stale_after_ms: 180000,
        progress_stalled_after_ms: 1200000,
      }),
      "utf-8"
    );

    const workspace = loadWorkspaceUnattendedStallPolicy(root);
    const resolution = resolveUnattendedStallPolicy(root, {
      waiting_progress_grace_ms: 1500000,
    });

    assert.equal(workspace?.heartbeat_stale_after_ms, 180000);
    assert.equal(resolution.policy.progress_stalled_after_ms, 1200000);
    assert.equal(resolution.policy.waiting_progress_grace_ms, 1500000);
    assert.deepEqual(resolution.applied_layers, [
      "shipped-defaults",
      "workspace-config",
      "run-override",
    ]);
  });
});
