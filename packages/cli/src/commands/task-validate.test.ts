import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildInvocation, parseArgs } from "./task-validate.ts";

describe("task-validate.parseArgs", () => {
  test("parses file mode with strict validation", () => {
    const result = parseArgs(["--file", "tasks/backlog/factory-404.md", "--status", "backlog", "--strict"]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, {
      file: "tasks/backlog/factory-404.md",
      folder: undefined,
      root: undefined,
      status: "backlog",
      strict: true,
    });
  });

  test("parses folder mode", () => {
    const result = parseArgs(["--folder", "tasks/review"]);

    assert.equal(result.error, null);
    assert.equal(result.args?.folder, "tasks/review");
  });

  test("requires one of file, folder, or root", () => {
    const result = parseArgs([]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /Provide at least one/);
  });
});

describe("task-validate.buildInvocation", () => {
  test("forwards provided options to the validation script", () => {
    const invocation = buildInvocation({
      file: "tasks/backlog/factory-404.md",
      status: "backlog",
      strict: true,
    });

    assert.equal(invocation[0], process.execPath);
    assert.match(invocation[2] ?? "", /scripts\/validate-task\.ts$/);
    assert.deepEqual(invocation.slice(3), [
      "--file", "tasks/backlog/factory-404.md",
      "--status", "backlog",
      "--strict",
    ]);
  });
});
