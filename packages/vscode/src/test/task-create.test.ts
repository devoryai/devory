/**
 * packages/vscode/src/test/task-create.test.ts
 *
 * Tests for src/lib/task-create.ts.
 * Uses a temporary directory and injected editor/document adapters.
 *
 * Run: tsx --test packages/vscode/src/test/task-create.test.ts
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  findGoalCursorLine,
  runTaskCreateWorkflow,
  type TextDocumentLike,
} from "../lib/task-create.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-vscode-task-create-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("findGoalCursorLine", () => {
  test("returns the first editable line under the Goal heading", () => {
    assert.equal(findGoalCursorLine("---\n---\n\n## Goal\n\nWrite here\n"), 5);
  });

  test("returns null when the Goal heading is missing", () => {
    assert.equal(findGoalCursorLine("# No goal here\n"), null);
  });
});

describe("runTaskCreateWorkflow", () => {
  test("creates a task and positions the editor at the Goal section", async () => {
    let cursor: { line: number; column: number } | null = null;

    const result = await runTaskCreateWorkflow(
      { id: "factory-121", title: "Extension task create", project: "ai-dev-factory" },
      {
        factoryRoot: tmpDir,
        openTextDocument: async (filePath): Promise<TextDocumentLike> => ({
          getText: () => fs.readFileSync(filePath, "utf-8"),
        }),
        showTextDocument: async () => ({
          setCursor(line, column) {
            cursor = { line, column };
          },
        }),
      }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.openedInEditor, true);
    assert.ok(fs.existsSync(result.filePath));
    assert.deepEqual(cursor, { line: result.cursorLine!, column: 0 });
  });

  test("returns a failure when task creation fails", async () => {
    const result = await runTaskCreateWorkflow(
      { id: "factory-121", title: "Duplicate task", project: "ai-dev-factory" },
      {
        factoryRoot: tmpDir,
        createTaskImpl: () => ({ ok: false, error: "boom" }),
      }
    );

    assert.deepEqual(result, { ok: false, error: "boom" });
  });

  test("still succeeds when the editor cannot open the new file", async () => {
    const result = await runTaskCreateWorkflow(
      { id: "factory-122", title: "Open failure", project: "ai-dev-factory" },
      {
        factoryRoot: tmpDir,
        openTextDocument: async () => {
          throw new Error("editor offline");
        },
        showTextDocument: async () => ({
          setCursor() {
            throw new Error("should not be called");
          },
        }),
      }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.openedInEditor, false);
    assert.ok(fs.existsSync(result.filePath));
    assert.equal(typeof result.cursorLine, "number");
  });
});
