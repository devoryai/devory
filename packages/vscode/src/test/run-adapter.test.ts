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

  test("maps adapter invocation mode onto FACTORY_DEFAULT_ENGINE", () => {
    const invocation = resolvePackagedRunInvocation("/workspace", "/extension/runtime", {
      routingEnv: {
        DEVORY_ADAPTER_INVOCATION_MODE: "ollama",
      },
    });

    assert.equal(invocation.env.FACTORY_DEFAULT_ENGINE, "ollama");
  });

  test("preserves OLLAMA_BASE_URL through the packaged runner handoff", () => {
    const previous = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "http://gpu-host:11434";

    try {
      const invocation = resolvePackagedRunInvocation("/workspace", "/extension/runtime", {
        routingEnv: {
          DEVORY_ADAPTER_INVOCATION_MODE: "ollama",
        },
      });

      assert.equal(invocation.env.OLLAMA_BASE_URL, "http://gpu-host:11434");
    } finally {
      if (previous === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = previous;
      }
    }
  });
});

describe("startFactoryRun", () => {
  test("returns a success message that points users to run inspection", async () => {
    const result = await startFactoryRun("/workspace", "/extension/runtime", { limit: 2 }, async () => ({
      exitCode: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
    }));

    assert.equal(result.ok, true);
    assert.match(result.message, /Inspect Recent Runs/);
  });

  test("returns a failure message with stderr when the runtime exits non-zero", async () => {
    const result = await startFactoryRun("/workspace", "/extension/runtime", {}, async () => ({
      exitCode: 1,
      signal: null,
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
        signal: null,
        stdout: "ok",
        stderr: "",
      })
    );

    assert.equal(result.ok, true);
    assert.match(result.message, /resumed run-177/);
  });

  test("writes workspace and runner command to output before launching", async () => {
    const lines: string[] = [];
    await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      { limit: 2 },
      async () => ({ exitCode: 0, signal: null, stdout: "task done", stderr: "" }),
      (chunk) => lines.push(chunk)
    );

    const joined = lines.join("");
    assert.match(joined, /Workspace: \/workspace/);
    assert.match(joined, /Runner:.*factory-run\.js.*--limit.*2/);
  });

  test("writes exit code completion line to output", async () => {
    const lines: string[] = [];
    await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      {},
      async () => ({ exitCode: 0, signal: null, stdout: "task done", stderr: "" }),
      (chunk) => lines.push(chunk)
    );

    assert.match(lines.join(""), /Exited with code 0/);
  });

  test("writes signal completion line when process is killed", async () => {
    const lines: string[] = [];
    await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      {},
      async () => ({ exitCode: 1, signal: "SIGTERM", stdout: "", stderr: "" }),
      (chunk) => lines.push(chunk)
    );

    assert.match(lines.join(""), /killed by signal SIGTERM/);
  });

  test("writes no-output explanation when process exits cleanly with no stdout or stderr", async () => {
    const lines: string[] = [];
    await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      {},
      async () => ({ exitCode: 0, signal: null, stdout: "", stderr: "" }),
      (chunk) => lines.push(chunk)
    );

    assert.match(lines.join(""), /No output received/);
  });

  test("sets noOutput true when subprocess produced no output", async () => {
    const result = await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      {},
      async () => ({ exitCode: 0, signal: null, stdout: "", stderr: "" })
    );

    assert.equal(result.noOutput, true);
  });

  test("sets noOutput false when subprocess produced output", async () => {
    const chunks: string[] = [];
    const result = await startFactoryRun(
      "/workspace",
      "/extension/runtime",
      {},
      async () => ({ exitCode: 0, signal: null, stdout: "task done", stderr: "" }),
      (chunk) => chunks.push(chunk)
    );

    assert.equal(result.noOutput, false);
  });
});
