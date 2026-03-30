import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  buildExecutionPolicyInjection,
  EXECUTION_POLICY_WORKSPACE_PATH,
  loadDefaultExecutionPolicy,
  normalizeExecutionPolicyOverrides,
  resolveExecutionPolicy,
} from "./execution-policy.ts";

describe("execution policy", () => {
  test("loads conservative shipped defaults", () => {
    const policy = loadDefaultExecutionPolicy();

    assert.equal(policy.version, "execution-policy-v1");
    assert.equal(policy.network.allow, false);
    assert.equal(policy.package_installs.allow, false);
    assert.equal(policy.filesystem.require_approval_outside_writable_roots, true);
    assert.ok(policy.commands.require_approval.includes("npm install"));
  });

  test("applies partial workspace and run overrides deterministically", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-policy-"));
    const configPath = path.join(root, EXECUTION_POLICY_WORKSPACE_PATH);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          network: {
            allow: true,
            allowed_hosts: ["api.openai.com"],
          },
          test_execution: {
            require_approval_commands: ["npm run e2e"],
          },
        },
        null,
        2
      ),
      "utf-8"
    );

    const resolution = resolveExecutionPolicy(root, {
      commands: {
        allow: ["npm run lint"],
      },
      package_installs: {
        allow: true,
        allowed_managers: ["npm", "invalid-manager"],
      },
    });

    assert.deepEqual(resolution.applied_layers, [
      "shipped-defaults",
      "workspace-config",
      "run-override",
    ]);
    assert.equal(resolution.policy.network.allow, true);
    assert.deepEqual(resolution.policy.network.allowed_hosts, ["api.openai.com"]);
    assert.deepEqual(resolution.policy.commands.allow, ["npm run lint"]);
    assert.deepEqual(resolution.policy.package_installs.allowed_managers, ["npm"]);
    assert.deepEqual(resolution.policy.test_execution.require_approval_commands, [
      "npm run e2e",
    ]);

    const injection = buildExecutionPolicyInjection(resolution);
    assert.equal(injection.injection_source, "agent-context");
    assert.equal(injection.workspace_config_path, configPath);
  });

  test("rejects invalid root config and normalizes invalid fields conservatively", () => {
    assert.throws(
      () => normalizeExecutionPolicyOverrides("bad-config"),
      /execution policy config must be a JSON object/
    );

    const normalized = normalizeExecutionPolicyOverrides({
      package_installs: {
        allow: true,
        allowed_managers: ["npm", "totally-made-up"],
      },
      escalation: {
        unmatched_command: "not-real",
        invalid_policy: "fallback_to_defaults",
      },
    });

    assert.deepEqual(normalized.package_installs?.allowed_managers, ["npm"]);
    assert.equal(normalized.escalation?.unmatched_command, undefined);
    assert.equal(normalized.escalation?.invalid_policy, "fallback_to_defaults");
  });
});
