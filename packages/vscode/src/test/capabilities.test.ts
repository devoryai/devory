/**
 * packages/vscode/src/test/capabilities.test.ts
 *
 * Tests for src/lib/capabilities.ts.
 *
 * Run: tsx --test packages/vscode/src/test/capabilities.test.ts
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  detectWorkspaceCapabilities,
  getUnsupportedCommandMessage,
} from "../lib/capabilities.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-vscode-caps-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function touch(relPath: string): void {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, "", "utf-8");
}

describe("detectWorkspaceCapabilities", () => {
  test("classifies an empty workspace as none", () => {
    const caps = detectWorkspaceCapabilities(tmpDir, null);
    assert.equal(caps.capabilityLevel, "none");
    assert.equal(caps.supportsTaskBrowse, false);
    assert.equal(caps.supportsRunExecution, false);
  });

  test("classifies a browse-only workspace as read-only", () => {
    fs.mkdirSync(path.join(tmpDir, "runs"), { recursive: true });
    const caps = detectWorkspaceCapabilities(tmpDir, null);
    assert.equal(caps.capabilityLevel, "read-only");
    assert.equal(caps.supportsRunInspect, true);
    assert.equal(caps.supportsTaskMutations, false);
  });

  test("classifies a task workspace without run runtime as local-mutations", () => {
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
    const caps = detectWorkspaceCapabilities(tmpDir, null);
    assert.equal(caps.capabilityLevel, "local-mutations");
    assert.equal(caps.supportsTaskMutations, true);
    assert.equal(caps.supportsRunExecution, false);
  });

  test("classifies a fully runnable workspace as full-run", () => {
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
    const runtimeDir = path.join(tmpDir, "extension-runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, "runtime-manifest.json"), "", "utf-8");
    touch("extension-runtime/packages/runner/src/factory-run.js");
    const caps = detectWorkspaceCapabilities(tmpDir, runtimeDir);
    assert.equal(caps.capabilityLevel, "full-run");
    assert.equal(caps.supportsRunExecution, true);
  });
});

describe("getUnsupportedCommandMessage", () => {
  test("explains missing run runtime clearly", () => {
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
    const message = getUnsupportedCommandMessage(
      "runStart",
      detectWorkspaceCapabilities(tmpDir, null)
    );
    assert.match(
      message ?? "",
      /Install or package the extension with its bundled runtime/
    );
  });

  test("allows task creation when task mutations are supported", () => {
    fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
    const message = getUnsupportedCommandMessage(
      "taskCreate",
      detectWorkspaceCapabilities(tmpDir, null)
    );
    assert.equal(message, null);
  });
});
