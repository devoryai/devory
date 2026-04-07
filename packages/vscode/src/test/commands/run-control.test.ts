import "../support/install-command-test-hooks.ts";

import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { resetState, state } from "../support/command-test-state.js";

function makeOutputChannel() {
  return {
    clear() {
      state.outputCleared += 1;
    },
    appendLine(line: string) {
      state.outputLines.push(line);
    },
    append(chunk: string) {
      state.outputChunks.push(chunk);
    },
    show() {
      state.outputShown += 1;
    },
  };
}

beforeEach(() => {
  resetState();
});

describe("VS Code run control commands", () => {
  test("runStartCommand shows an error without a factory root", async () => {
    const { runStartCommand } = await import("../../commands/run-start.ts");

    await runStartCommand("", "/runtime", makeOutputChannel() as any);

    assert.match(state.errorMessages[0] ?? "", /factory root not found/i);
  });

  test("runStartCommand starts a run with a numeric limit", async () => {
    state.inputBoxValues.push("3");
    state.runStartResult = {
      ok: true,
      message: "Devory: factory run completed.",
      stdout: "",
      stderr: "",
    };

    const { runStartCommand } = await import("../../commands/run-start.ts");
    await runStartCommand("/workspace", "/runtime", makeOutputChannel() as any);

    assert.deepEqual(state.runStartCalls[0], {
      factoryRoot: "/workspace",
      runtimeRoot: "/runtime",
      args: { limit: 3 },
    });
    assert.equal(state.outputCleared, 1);
    assert.equal(state.outputShown, 1);
    assert.match(state.infoMessages[0] ?? "", /factory run completed/i);
  });

  test("runStartCommand exits quietly when the user cancels input", async () => {
    state.inputBoxValues.push(undefined);

    const { runStartCommand } = await import("../../commands/run-start.ts");
    await runStartCommand("/workspace", "/runtime", makeOutputChannel() as any);

    assert.equal(state.runStartCalls.length, 0);
  });
});
