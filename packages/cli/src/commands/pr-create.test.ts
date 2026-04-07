import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseArgs, run } from "./pr-create.ts";

let tmpDir = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-pr-create-"));
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.GITHUB_TOKEN;
});

describe("pr-create.parseArgs", () => {
  test("parses task, branch, base, and confirm", () => {
    const result = parseArgs([
      "--task", "tasks/review/factory-405.md",
      "--branch", "task/factory-405",
      "--base", "main",
      "--confirm",
    ]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, {
      task: "tasks/review/factory-405.md",
      branch: "task/factory-405",
      base: "main",
      confirm: true,
    });
  });

  test("requires task and branch", () => {
    const result = parseArgs(["--task", "tasks/review/factory-405.md"]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /--branch/);
  });
});

describe("pr-create.run", () => {
  test("returns 1 when the task file is missing", () => {
    const code = run({
      task: path.join(tmpDir, "missing.md"),
      branch: "task/factory-405",
      base: "main",
      confirm: false,
    });

    assert.equal(code, 1);
  });

  test("stays in preview mode without confirm", () => {
    const taskPath = path.join(tmpDir, "factory-405.md");
    fs.writeFileSync(
      taskPath,
      [
        "---",
        "id: factory-405",
        "title: Add tests for pr-create",
        "project: devory",
        "repo: .",
        "branch: task/factory-405",
        "type: test",
        "priority: high",
        "status: review",
        "agent: fullstack-builder",
        "---",
        "",
        "## Goal",
        "",
        "Add coverage.",
      ].join("\n"),
      "utf8"
    );

    const code = run({
      task: taskPath,
      branch: "task/factory-405",
      base: "main",
      confirm: false,
    });

    assert.equal(code, 0);
  });
});
