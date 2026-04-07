import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildInvocation, parseArgs } from "./pr-prep.ts";

describe("pr-prep.parseArgs", () => {
  test("parses an optional file and dry-run flag", () => {
    const result = parseArgs(["tasks/review/factory-405.md", "--dry-run"]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, {
      file: "tasks/review/factory-405.md",
      dryRun: true,
    });
  });

  test("rejects unknown flags", () => {
    const result = parseArgs(["--bogus"]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /Unknown flag/);
  });
});

describe("pr-prep.buildInvocation", () => {
  test("builds the delegated script invocation", () => {
    const invocation = buildInvocation({
      file: "tasks/review/factory-405.md",
      dryRun: true,
    });

    assert.equal(invocation[0], process.execPath);
    assert.match(invocation[2] ?? "", /scripts\/pr-preparer\.ts$/);
    assert.deepEqual(invocation.slice(3), ["tasks/review/factory-405.md", "--dry-run"]);
  });
});
