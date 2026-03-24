import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  factoryPaths,
  findFactoryContextDir,
  resolveFactoryEnvironment,
  resolveFactoryMode,
  resolveFactoryRoot,
} from "./factory-environment.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-env-test-"));
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
  delete process.env.DEVORY_FACTORY_MODE;
  delete process.env.FACTORY_MODE;
  delete process.env.DEVORY_REMOTE_FACTORY_URL;
  delete process.env.FACTORY_REMOTE_URL;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
  delete process.env.DEVORY_FACTORY_MODE;
  delete process.env.FACTORY_MODE;
  delete process.env.DEVORY_REMOTE_FACTORY_URL;
  delete process.env.FACTORY_REMOTE_URL;
});

describe("findFactoryContextDir", () => {
  test("returns the containing directory when marker exists", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    assert.equal(findFactoryContextDir(tmpDir), tmpDir);
  });

  test("walks up parent directories to find the factory marker", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    const nested = path.join(tmpDir, "nested", "deep");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(findFactoryContextDir(nested), tmpDir);
  });
});

describe("resolveFactoryRoot", () => {
  test("uses DEVORY_FACTORY_ROOT first", () => {
    process.env.DEVORY_FACTORY_ROOT = "/explicit/path";
    process.env.FACTORY_ROOT = "/legacy/path";
    assert.deepEqual(resolveFactoryRoot(tmpDir), {
      root: "/explicit/path",
      source: "env:DEVORY_FACTORY_ROOT",
    });
  });

  test("walks to the factory marker when env vars are absent", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    const nested = path.join(tmpDir, "deep");
    fs.mkdirSync(nested);
    assert.deepEqual(resolveFactoryRoot(nested), {
      root: tmpDir,
      source: "git-walk",
    });
  });
});

describe("resolveFactoryMode", () => {
  test("defaults to local", () => {
    assert.equal(resolveFactoryMode(), "local");
  });

  test("honors explicit hosted mode", () => {
    process.env.DEVORY_FACTORY_MODE = "hosted";
    assert.equal(resolveFactoryMode(), "hosted");
  });

  test("treats remote url configuration as hosted mode", () => {
    process.env.DEVORY_REMOTE_FACTORY_URL = "https://factory.example.com";
    assert.equal(resolveFactoryMode(), "hosted");
  });
});

describe("resolveFactoryEnvironment", () => {
  test("returns root, mode, and derived paths together", () => {
    fs.writeFileSync(path.join(tmpDir, "FACTORY_CONTEXT.md"), "# context");
    process.env.DEVORY_FACTORY_MODE = "hosted";

    const result = resolveFactoryEnvironment(tmpDir);
    assert.equal(result.root, tmpDir);
    assert.equal(result.source, "git-walk");
    assert.equal(result.mode, "hosted");
    assert.deepEqual(result.paths, factoryPaths(tmpDir));
  });
});
