/**
 * packages/vscode/src/test/run-adapter.test.ts
 *
 * Tests for src/lib/run-adapter.ts.
 *
 * Run: tsx --test packages/vscode/src/test/run-adapter.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";

import {
  resolvePackagedRunInvocation,
  startFactoryRun,
} from "../lib/run-adapter.js";

describe("resolvePackagedRunInvocation", () => {
  test("targets the packaged runner entry under the extension runtime payload", () => {
    const invocation = resolvePackagedRunInvocation("/workspace", "/extension/runtime", { limit: 3 });
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args, [
      path.join("/extension/runtime", "packages", "runner", "src", "factory-run.js"),
      "--limit",
      "3",
    ]);
    assert.equal(invocation.cwd, "/workspace");
    assert.equal(
      invocation.env.DEVORY_RUNTIME_ROOT,
      "/extension/runtime"
    );
  });

  test("includes --resume when resuming an existing run", () => {
    const invocation = resolvePackagedRunInvocation("/workspace", "/extension/runtime", {
      resumeId: "run-177",
    });

    assert.deepEqual(invocation.args, [
      path.join("/extension/runtime", "packages", "runner", "src", "factory-run.js"),
      "--resume",
      "run-177",
    ]);
  });
});

describe("startFactoryRun", () => {
  test("returns a success message that points users to run inspection", async () => {
    const result = await startFactoryRun("/workspace", "/extension/runtime", { limit: 2 }, async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));

    assert.equal(result.ok, true);
    assert.match(result.message, /Inspect Recent Runs/);
  });

  test("returns a failure message with stderr when the runtime exits non-zero", async () => {
    const result = await startFactoryRun("/workspace", "/extension/runtime", {}, async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "boom",
    }));

    assert.equal(result.ok, false);
    assert.match(result.message, /factory run failed/);
    assert.match(result.message, /boom/);
  });

  test("returns a resume-specific success message for resumed runs", async () => {
    const result = await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      { resumeId: "run-177" },
      async () => ({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      })
    );

    assert.equal(result.ok, true);
    assert.match(result.message, /resumed run-177/);
  });
});
