import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildInvocation, parseArgs } from "./task-new.ts";

describe("task-new.parseArgs", () => {
  test("parses required and optional flags", () => {
    const result = parseArgs([
      "--id", "factory-404",
      "--title", "Add tests",
      "--project", "devory",
      "--type", "test",
      "--priority", "high",
      "--agent", "fullstack-builder",
      "--lane", "core",
      "--repo-area", "cli",
      "--dry-run",
    ]);

    assert.equal(result.error, null);
    assert.deepEqual(result.args, {
      id: "factory-404",
      title: "Add tests",
      project: "devory",
      type: "test",
      priority: "high",
      agent: "fullstack-builder",
      lane: "core",
      repoArea: "cli",
      dryRun: true,
    });
  });

  test("returns a useful error when required flags are missing", () => {
    const result = parseArgs(["--id", "factory-404"]);

    assert.equal(result.args, null);
    assert.match(result.error ?? "", /--title/);
    assert.match(result.error ?? "", /--project/);
  });
});

describe("task-new.buildInvocation", () => {
  test("builds a tsx invocation with forwarded flags", () => {
    const invocation = buildInvocation({
      id: "factory-404",
      title: "Add tests",
      project: "devory",
      type: "test",
      priority: "high",
      agent: "builder",
      lane: "core",
      repoArea: "cli",
      dryRun: true,
    });

    assert.equal(invocation[0], process.execPath);
    assert.match(invocation[2] ?? "", /scripts\/task-new\.ts$/);
    assert.deepEqual(invocation.slice(3), [
      "--id", "factory-404",
      "--title", "Add tests",
      "--project", "devory",
      "--type", "test",
      "--priority", "high",
      "--agent", "builder",
      "--lane", "core",
      "--repo-area", "cli",
      "--dry-run",
    ]);
  });
});
