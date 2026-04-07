import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseArgs, run } from "./init.ts";

let tmpDir = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-init-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("init.parseArgs", () => {
  test("defaults to cwd and no force", () => {
    const result = parseArgs([]);

    assert.equal(result.error, null);
    assert.equal(result.args.force, false);
    assert.equal(result.args.dir, process.cwd());
  });

  test("parses --dir and --force", () => {
    const result = parseArgs(["--dir", tmpDir, "--force"]);

    assert.equal(result.error, null);
    assert.equal(result.args.dir, tmpDir);
    assert.equal(result.args.force, true);
  });
});

describe("init.run", () => {
  test("creates a fresh workspace layout", () => {
    const code = run({ dir: tmpDir, force: false });

    assert.equal(code, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, "FACTORY_CONTEXT.md")), true);
    assert.equal(fs.existsSync(path.join(tmpDir, "tasks", "backlog")), true);
    assert.equal(fs.existsSync(path.join(tmpDir, "templates", "task-template.md")), true);
    assert.equal(fs.existsSync(path.join(tmpDir, "README.md")), true);
  });

  test("returns 1 when the workspace already exists without force", () => {
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });

    const code = run({ dir: tmpDir, force: false });

    assert.equal(code, 1);
  });

  test("reinitializes without overwriting existing files when forced", () => {
    const readmePath = path.join(tmpDir, "README.md");
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
    fs.writeFileSync(readmePath, "custom readme\n", "utf8");

    const code = run({ dir: tmpDir, force: true });

    assert.equal(code, 0);
    assert.equal(fs.readFileSync(readmePath, "utf8"), "custom readme\n");
    assert.equal(fs.existsSync(path.join(tmpDir, "devory.standards.yml")), true);
  });
});
