/**
 * packages/vscode/src/test/cli-bridge.test.ts
 *
 * The CLI bridge is intentionally empty now that the extension uses
 * in-process helpers and the packaged runtime adapter instead.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as cliBridge from "../lib/cli-bridge.js";

describe("cli-bridge", () => {
  test("exports no runtime helpers", () => {
    assert.deepEqual(cliBridge, {});
  });
});
