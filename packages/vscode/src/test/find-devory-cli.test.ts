/**
 * packages/vscode/src/test/find-devory-cli.test.ts
 *
 * Tests for src/lib/find-devory-cli.ts.
 * Uses real temp directories — Node 24 makes fs/child_process methods
 * non-configurable, so sinon cannot stub them directly.
 *
 * Run: tsx --test packages/vscode/src/test/find-devory-cli.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devory-cli-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Creates a fake devory binary at the given path. */
function touchExecutable(p: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "#!/bin/sh\necho devory\n", { mode: 0o755 });
}

describe("findDevoryCli", () => {
  let tmp: string;
  let savedPath: string | undefined;

  beforeEach(() => {
    tmp = makeTmpDir();
    savedPath = process.env.PATH;
  });

  afterEach(() => {
    process.env.PATH = savedPath;
    rmTmpDir(tmp);
  });

  it("should return the local node_modules/.bin/devory when it exists", async () => {
    const localBin = path.join(tmp, "node_modules", ".bin", "devory");
    touchExecutable(localBin);

    const { findDevoryCli } = await import("../lib/find-devory-cli.js");
    const result = await findDevoryCli(tmp);
    assert.strictEqual(result, localBin);
  });

  it("should fall back to a parent node_modules when local is absent", async () => {
    // /tmp/root/node_modules/.bin/devory exists
    // /tmp/root/packages/app is the cwd (no local node_modules)
    const appDir = path.join(tmp, "packages", "app");
    fs.mkdirSync(appDir, { recursive: true });
    const parentBin = path.join(tmp, "node_modules", ".bin", "devory");
    touchExecutable(parentBin);

    const { findDevoryCli } = await import("../lib/find-devory-cli.js");
    const result = await findDevoryCli(appDir);
    assert.strictEqual(result, parentBin);
  });

  it("should fall back to the global binary via which/where when no local install exists", async () => {
    // Place a fake devory on PATH
    const binDir = path.join(tmp, "fake-bin");
    const fakeBin = path.join(binDir, "devory");
    touchExecutable(fakeBin);
    process.env.PATH = binDir + path.delimiter + (savedPath ?? "");

    const { findDevoryCli } = await import("../lib/find-devory-cli.js");
    const result = await findDevoryCli(tmp);
    assert.strictEqual(result, fakeBin);
  });

  it("should throw when the CLI is not found anywhere", async () => {
    // No node_modules in tmp; PATH set to an empty dir so which/where fails
    const emptyBinDir = path.join(tmp, "empty-bin");
    fs.mkdirSync(emptyBinDir);
    process.env.PATH = emptyBinDir;

    const { findDevoryCli } = await import("../lib/find-devory-cli.js");
    await assert.rejects(
      () => findDevoryCli(tmp),
      /devory CLI not found/
    );
  });
});
