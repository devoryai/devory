import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildInvocation, parseArgs } from "./artifacts.ts";

describe("artifacts.parseArgs", () => {
  test("accepts no arguments", () => {
    const result = parseArgs([]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, {});
  });
});

describe("artifacts.buildInvocation", () => {
  test("targets the artifact index script", () => {
    const invocation = buildInvocation({});

    assert.equal(invocation[0], process.execPath);
    assert.match(invocation[2] ?? "", /scripts\/build-artifact-index\.ts$/);
    assert.deepEqual(invocation.slice(3), []);
  });
});
