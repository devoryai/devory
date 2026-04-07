import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildInvocation, parseArgs } from "./improve.ts";

describe("improve.parseArgs", () => {
  test("parses a supported improve type", () => {
    const result = parseArgs(["--type", "compliance"]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, { type: "compliance" });
  });

  test("rejects an unsupported improve type", () => {
    const result = parseArgs(["--type", "skills"]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /must be one of/);
  });

  test("requires --type", () => {
    const result = parseArgs([]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /--type is required/);
  });
});

describe("improve.buildInvocation", () => {
  test("targets the improve script", () => {
    const invocation = buildInvocation({ type: "drift" });

    assert.equal(invocation[0], process.execPath);
    assert.match(invocation[2] ?? "", /scripts\/improve\.ts$/);
    assert.deepEqual(invocation.slice(3), ["--type", "drift"]);
  });
});
