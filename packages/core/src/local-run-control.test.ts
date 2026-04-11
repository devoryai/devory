import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  clearLocalRunControl,
  readLocalRunControl,
  resolveLocalRunControlPath,
  updateLocalRunControl,
} from "./local-run-control.js";

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-local-run-control-"));
  tempRoots.push(root);
  return root;
}

describe("local-run-control", () => {
  test("writes and reads persisted run control state", () => {
    const factoryRoot = makeFactoryRoot();

    const written = updateLocalRunControl(factoryRoot, () => ({
      run_id: "run-123",
      requested_action: "pause",
      acknowledged_action: null,
    }));

    assert.equal(written.run_id, "run-123");
    assert.equal(written.requested_action, "pause");
    assert.equal(resolveLocalRunControlPath(factoryRoot), path.join(factoryRoot, ".devory", "local-run-control.json"));

    const reloaded = readLocalRunControl(factoryRoot);
    assert.equal(reloaded?.run_id, "run-123");
    assert.equal(reloaded?.requested_action, "pause");
    assert.equal(reloaded?.acknowledged_action, null);
  });

  test("clears stale requests and acknowledgements", () => {
    const factoryRoot = makeFactoryRoot();

    updateLocalRunControl(factoryRoot, () => ({
      run_id: "run-456",
      requested_action: "stop",
      acknowledged_action: "stop",
    }));

    const cleared = clearLocalRunControl(factoryRoot);
    assert.equal(cleared.run_id, null);
    assert.equal(cleared.requested_action, null);
    assert.equal(cleared.acknowledged_action, null);
  });
});
