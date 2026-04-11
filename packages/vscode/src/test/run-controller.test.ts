import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readLocalRunControl } from "@devory/core";
import { RunController } from "../lib/run-controller.js";

class FakeStream extends EventEmitter {
  emitData(value: string) {
    this.emit("data", Buffer.from(value));
  }
}

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  public killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeFactoryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-run-controller-"));
  tempRoots.push(root);
  return root;
}

describe("RunController", () => {
  test("tracks start, graceful pause, and resume lifecycle", async () => {
    const firstChild = new FakeChild();
    const secondChild = new FakeChild();
    const factoryRoot = makeFactoryRoot();
    const runtimeRoot = "/runtime";
    const states: string[] = [];
    let spawnCount = 0;
    const controller = new RunController(() => {
      spawnCount += 1;
      return (spawnCount === 1 ? firstChild : secondChild) as never;
    });

    const started = await controller.start(factoryRoot, runtimeRoot, {}, {
      onStateChange: (state) => states.push(state),
    });

    assert.equal(started.started, true);
    assert.equal(controller.getState(), "running");

    firstChild.stdout.emitData("[orchestrator] Created run: run-123\n");
    const paused = controller.pause();
    assert.equal(paused.ok, true);
    assert.equal(readLocalRunControl(factoryRoot)?.requested_action, "pause");

    fs.writeFileSync(
      path.join(factoryRoot, ".devory", "local-run-control.json"),
      JSON.stringify({
        version: 1,
        run_id: "run-123",
        requested_action: null,
        acknowledged_action: "pause",
        updated_at: new Date().toISOString(),
      }),
      "utf-8",
    );
    firstChild.emit("close", 0, null);
    assert.equal(controller.getState(), "paused");

    const resumed = await controller.resume({
      onStateChange: (state) => states.push(state),
    });
    assert.equal(resumed.ok, true);
    assert.equal(controller.getState(), "running");
    secondChild.stdout.emitData("[orchestrator] Resuming run: run-123 (previous status: paused_for_review)\n");
    secondChild.emit("close", 0, null);
    assert.equal(controller.getState(), "idle");
    assert.deepEqual(states[0], "running");
    assert.ok(states.includes("paused"));
    assert.deepEqual(states.at(-1), "idle");
  });

  test("writes a graceful stop request instead of killing immediately", async () => {
    const child = new FakeChild();
    const factoryRoot = makeFactoryRoot();
    const controller = new RunController(() => child as never);

    await controller.start(factoryRoot, "/runtime", {});
    child.stdout.emitData("[orchestrator] Created run: run-777\n");

    const stopped = controller.stop();
    assert.equal(stopped.ok, true);
    assert.equal(child.killed, false);
    assert.equal(readLocalRunControl(factoryRoot)?.requested_action, "stop");
  });

  test("refuses to start a second run while one is active", async () => {
    const child = new FakeChild();
    const factoryRoot = makeFactoryRoot();
    const controller = new RunController(() => child as never);

    await controller.start(factoryRoot, "/runtime", {});
    const second = await controller.start(factoryRoot, "/runtime", {});

    assert.equal(second.started, false);
  });
});
