import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  factoryPaths,
  findFactoryCandidateDir,
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
  delete process.env.VERCEL;
  delete process.env.NEXT_PUBLIC_APP_ENV;
  delete process.env.APP_ENV;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
  delete process.env.DEVORY_FACTORY_MODE;
  delete process.env.FACTORY_MODE;
  delete process.env.DEVORY_REMOTE_FACTORY_URL;
  delete process.env.FACTORY_REMOTE_URL;
  delete process.env.VERCEL;
  delete process.env.NEXT_PUBLIC_APP_ENV;
  delete process.env.APP_ENV;
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

describe("findFactoryCandidateDir", () => {
  test("walks up to a Devory monorepo root from nested apps directories", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "ai-dev-factory", workspaces: ["apps/*", "packages/*"] }),
    );
    const nested = path.join(tmpDir, "apps", "devory");
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(findFactoryCandidateDir(nested), tmpDir);
  });

  test("recognizes a factory root from .devory config files when FACTORY_CONTEXT is absent", () => {
    fs.mkdirSync(path.join(tmpDir, ".devory"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".devory", "feature-flags.json"),
      '{"governance_repo_enabled": true}\n',
    );
    const nested = path.join(tmpDir, "apps");
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(findFactoryCandidateDir(nested), tmpDir);
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

  test("falls back to factory structure when nested under apps without direct marker access", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "ai-dev-factory", workspaces: ["apps/*", "packages/*"] }),
    );
    fs.mkdirSync(path.join(tmpDir, ".devory"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".devory", "governance.json"),
      '{"governance_repo_path":"/tmp/gov"}\n',
    );
    const nested = path.join(tmpDir, "apps", "devory");
    fs.mkdirSync(nested, { recursive: true });

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

  test("treats cloud app environment as hosted mode", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "cloud";
    assert.equal(resolveFactoryMode(), "hosted");
  });

  test("treats vercel runtime as hosted mode", () => {
    process.env.VERCEL = "1";
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
