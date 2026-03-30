/**
 * packages/vscode/src/test/control-command-flow.test.ts
 *
 * Integration-style coverage for editor-targeted control command flows.
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findTaskByFile } from "../lib/task-reader.js";
import { runTaskPromoteWorkflow } from "../lib/task-control.js";

let tmpDir: string;
let tasksDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-vscode-command-flow-"));
  tasksDir = path.join(tmpDir, "tasks");
  const readyDir = path.join(tasksDir, "ready");
  fs.mkdirSync(readyDir, { recursive: true });
  fs.writeFileSync(
    path.join(readyDir, "factory-179-command-flow.md"),
    `---\nid: factory-179\ntitle: Command Flow\nproject: ai-dev-factory\nstatus: ready\npriority: high\n---\n\nBody.\n`,
    "utf-8"
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("editor-targeted control command flow", () => {
  test("resolves an open task file and promotes it through the shared workflow", () => {
    const taskPath = path.join(tasksDir, "ready", "factory-179-command-flow.md");
    const task = findTaskByFile(tasksDir, taskPath);
    assert.ok(task, "expected to resolve the selected task file");

    let changed = false;
    const result = runTaskPromoteWorkflow(
      {
        task: path.relative(tmpDir, taskPath).replace(/\\/g, "/"),
        label: task!.id,
        fromStage: task!.stage,
      },
      {
        factoryRoot: tmpDir,
        moveTaskImpl: () => ({
          ok: true,
          fromPath: taskPath,
          toPath: path.join(tasksDir, "doing", "factory-179-command-flow.md"),
          fromStatus: "ready",
          toStatus: "doing",
        }),
        onChanged: () => {
          changed = true;
        },
      }
    );

    assert.deepEqual(result, {
      ok: true,
      message: "Devory: promoted factory-179 → doing.",
    });
    assert.equal(changed, true);
  });
});
