import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildInvocation, parseArgs } from "./task-move.ts";

describe("task-move.parseArgs", () => {
  test("parses task and target stage", () => {
    const result = parseArgs(["--task", "tasks/ready/factory-404.md", "--to", "doing"]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, {
      task: "tasks/ready/factory-404.md",
      to: "doing",
    });
  });

  test("returns an error when required flags are missing", () => {
    const result = parseArgs(["--task", "tasks/ready/factory-404.md"]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /--to/);
  });
});

describe("task-move.buildInvocation", () => {
  test("builds the script invocation", () => {
    const invocation = buildInvocation({
      task: "tasks/ready/factory-404.md",
      to: "doing",
    });

    assert.equal(invocation[0], process.execPath);
    assert.match(invocation[2] ?? "", /scripts\/task-move\.ts$/);
    assert.deepEqual(invocation.slice(3), ["--task", "tasks/ready/factory-404.md", "--to", "doing"]);
  });
});
