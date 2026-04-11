import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";

import { buildCliSpawnEnv } from "../lib/cli-spawn-env.js";

describe("buildCliSpawnEnv", () => {
  it("sets DEVORY_FACTORY_ROOT and prepends workspace node_modules/.bin", () => {
    const cwd = path.join(path.sep, "tmp", "workspace");
    const env = buildCliSpawnEnv(cwd);
    const firstPath = (env.PATH ?? "").split(path.delimiter)[0];

    assert.equal(env.DEVORY_FACTORY_ROOT, cwd);
    assert.equal(firstPath, path.join(cwd, "node_modules", ".bin"));
  });

  it("includes CLI binary directory when provided", () => {
    const cwd = path.join(path.sep, "tmp", "workspace");
    const cliBin = path.join(path.sep, "tmp", "workspace", "node_modules", ".bin", "devory");
    const env = buildCliSpawnEnv(cwd, cliBin);
    const entries = (env.PATH ?? "").split(path.delimiter);

    assert.ok(entries.includes(path.dirname(cliBin)));
  });

  it("deduplicates repeated PATH entries", () => {
    const cwd = path.join(path.sep, "tmp", "workspace");
    const cliBin = path.join(cwd, "node_modules", ".bin", "devory");
    const env = buildCliSpawnEnv(cwd, cliBin);
    const entries = (env.PATH ?? "").split(path.delimiter);
    const localBin = path.join(cwd, "node_modules", ".bin");

    assert.equal(entries.filter((entry) => entry === localBin).length, 1);
  });
});
