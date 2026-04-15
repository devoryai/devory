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
  suggestTaskCreateDefaults,
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

  test("writes to the provided task root and fires onCreated after success", async () => {
    const taskRoot = path.join(tmpDir, "governance-repo");
    let createTaskFactoryRoot: string | null = null;
    let createdCount = 0;

    const result = await runTaskCreateWorkflow(
      { id: "factory-123", title: "Governance create", project: "ai-dev-factory" },
      {
        factoryRoot: tmpDir,
        taskRoot,
        createTaskImpl: (args, options) => {
          createTaskFactoryRoot = options.factoryRoot;
          const filePath = path.join(options.factoryRoot, "tasks", "backlog", "factory-123-governance-create.md");
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, "---\nid: factory-123\n---\n\n## Goal\n\n", "utf-8");
          return { ok: true, filePath, content: fs.readFileSync(filePath, "utf-8") };
        },
        onCreated: () => {
          createdCount += 1;
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(createTaskFactoryRoot, taskRoot);
    assert.equal(createdCount, 1);
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

describe("suggestTaskCreateDefaults", () => {
  test("defaults project to the repo name and keeps sequential numbering from existing tasks", () => {
    const repoRoot = path.join(tmpDir, "devory");
    const backlogDir = path.join(repoRoot, "tasks", "backlog");
    const doneDir = path.join(repoRoot, "tasks", "done");
    fs.mkdirSync(backlogDir, { recursive: true });
    fs.mkdirSync(doneDir, { recursive: true });
    fs.writeFileSync(path.join(backlogDir, "factory-009-something.md"), "# task\n", "utf-8");
    fs.writeFileSync(path.join(doneDir, "factory-120-finished.md"), "# task\n", "utf-8");
    fs.writeFileSync(path.join(doneDir, "other-003-unrelated.md"), "# task\n", "utf-8");

    const defaults = suggestTaskCreateDefaults(repoRoot);

    assert.deepEqual(defaults, {
      id: "factory-121",
      project: "devory",
    });
  });

  test("falls back to a repo-name-based starter id when no tasks exist yet", () => {
    const repoRoot = path.join(tmpDir, "my-app");
    fs.mkdirSync(path.join(repoRoot, "tasks", "backlog"), { recursive: true });

    const defaults = suggestTaskCreateDefaults(repoRoot);

    assert.deepEqual(defaults, {
      id: "my-app-001",
      project: "my-app",
    });
  });
});
