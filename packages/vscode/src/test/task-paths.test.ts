import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { resolveTasksDir } from "../lib/task-paths.js";

let tempRoot = "";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-vscode-task-paths-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("resolveTasksDir", () => {
  test("returns local tasks path when governance is not configured", () => {
    const resolved = resolveTasksDir(tempRoot);
    assert.equal(resolved, path.join(tempRoot, "tasks"));
  });

  test("returns governance repo tasks path when governance mode is on", () => {
    const governanceRepo = path.join(tempRoot, "governance");

    writeJson(path.join(tempRoot, ".devory", "feature-flags.json"), {
      governance_repo_enabled: true,
    });
    writeJson(path.join(tempRoot, ".devory", "governance.json"), {
      schema_version: "1",
      governance_repo_path: governanceRepo,
      workspace_id: "task-paths-test",
      bound_working_repo: tempRoot,
      bound_at: new Date().toISOString(),
    });
    writeJson(path.join(governanceRepo, ".devory-governance", "config.json"), {
      schema_version: "1",
      workspace_id: "task-paths-test",
      created_at: new Date().toISOString(),
    });

    const resolved = resolveTasksDir(tempRoot);
    assert.equal(resolved, path.join(governanceRepo, "tasks"));
  });
});
