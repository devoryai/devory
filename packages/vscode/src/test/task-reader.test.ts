/**
 * packages/vscode/src/test/task-reader.test.ts
 *
 * Tests for src/lib/task-reader.ts.
 * Uses a temporary in-memory directory created via fs.mkdtempSync.
 *
 * Run: tsx --test packages/vscode/src/test/task-reader.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  LIFECYCLE_STAGES,
  listTasksInStage,
  listAllTasks,
  findTaskById,
  findTaskFile,
} from "../lib/task-reader.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function writeTask(dir: string, filename: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

function makeTaskContent(fields: Record<string, string>): string {
  const fm = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${fm}\n---\nTask body.\n`;
}

// ── Fixture setup ──────────────────────────────────────────────────────────

let tmpDir: string;
let tasksDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-test-tasks-"));
  tasksDir = path.join(tmpDir, "tasks");

  writeTask(
    path.join(tasksDir, "backlog"),
    "factory-001-first-task.md",
    makeTaskContent({ id: "factory-001", title: "First Task", project: "test", status: "backlog", priority: "high" })
  );
  writeTask(
    path.join(tasksDir, "backlog"),
    "factory-002-second-task.md",
    makeTaskContent({ id: "factory-002", title: "Second Task", project: "test", status: "backlog", priority: "medium" })
  );
  writeTask(
    path.join(tasksDir, "ready"),
    "factory-003-ready-task.md",
    makeTaskContent({ id: "factory-003", title: "Ready Task", project: "test", status: "ready", priority: "low" })
  );
  writeTask(
    path.join(tasksDir, "doing"),
    "factory-004-doing-task.md",
    makeTaskContent({ id: "factory-004", title: "Doing Task", project: "test", status: "doing", priority: "high" })
  );
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── LIFECYCLE_STAGES ───────────────────────────────────────────────────────

describe("LIFECYCLE_STAGES", () => {
  test("includes standard stages", () => {
    assert.ok(LIFECYCLE_STAGES.includes("backlog"));
    assert.ok(LIFECYCLE_STAGES.includes("ready"));
    assert.ok(LIFECYCLE_STAGES.includes("doing"));
    assert.ok(LIFECYCLE_STAGES.includes("review"));
    assert.ok(LIFECYCLE_STAGES.includes("blocked"));
    assert.ok(LIFECYCLE_STAGES.includes("done"));
  });
});

// ── listTasksInStage ───────────────────────────────────────────────────────

describe("listTasksInStage", () => {
  test("returns tasks from backlog stage", () => {
    const tasks = listTasksInStage(tasksDir, "backlog");
    assert.equal(tasks.length, 2);
  });

  test("tasks are sorted by id", () => {
    const tasks = listTasksInStage(tasksDir, "backlog");
    assert.equal(tasks[0].id, "factory-001");
    assert.equal(tasks[1].id, "factory-002");
  });

  test("task has expected fields", () => {
    const [task] = listTasksInStage(tasksDir, "backlog");
    assert.equal(task.id, "factory-001");
    assert.equal(task.title, "First Task");
    assert.equal(task.project, "test");
    assert.equal(task.status, "backlog");
    assert.equal(task.priority, "high");
    assert.equal(task.stage, "backlog");
    assert.ok(task.filepath.endsWith(".md"));
  });

  test("returns empty array for stage with no tasks", () => {
    const tasks = listTasksInStage(tasksDir, "done");
    assert.deepEqual(tasks, []);
  });

  test("returns empty array for non-existent stage directory", () => {
    const tasks = listTasksInStage("/definitely/does/not/exist", "backlog");
    assert.deepEqual(tasks, []);
  });

  test("returns 1 task in ready stage", () => {
    const tasks = listTasksInStage(tasksDir, "ready");
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, "factory-003");
  });
});

// ── listAllTasks ───────────────────────────────────────────────────────────

describe("listAllTasks", () => {
  test("returns a record keyed by all lifecycle stages", () => {
    const all = listAllTasks(tasksDir);
    for (const stage of LIFECYCLE_STAGES) {
      assert.ok(stage in all, `missing key: ${stage}`);
    }
  });

  test("backlog contains 2 tasks", () => {
    const all = listAllTasks(tasksDir);
    assert.equal(all.backlog.length, 2);
  });

  test("done contains 0 tasks", () => {
    const all = listAllTasks(tasksDir);
    assert.equal(all.done.length, 0);
  });

  test("total task count is correct", () => {
    const all = listAllTasks(tasksDir);
    const total = Object.values(all).reduce((n, arr) => n + arr.length, 0);
    assert.equal(total, 4);
  });
});

// ── findTaskById ───────────────────────────────────────────────────────────

describe("findTaskById", () => {
  test("finds a task in backlog by id", () => {
    const task = findTaskById(tasksDir, "factory-001");
    assert.ok(task !== null);
    assert.equal(task!.id, "factory-001");
    assert.equal(task!.title, "First Task");
  });

  test("finds a task in doing stage", () => {
    const task = findTaskById(tasksDir, "factory-004");
    assert.ok(task !== null);
    assert.equal(task!.stage, "doing");
  });

  test("returns null for unknown id", () => {
    const task = findTaskById(tasksDir, "factory-999");
    assert.equal(task, null);
  });

  test("returned detail includes meta and body", () => {
    const task = findTaskById(tasksDir, "factory-003");
    assert.ok(task !== null);
    assert.ok(task!.meta !== undefined);
    assert.ok(typeof task!.body === "string");
  });
});

// ── findTaskFile ───────────────────────────────────────────────────────────

describe("findTaskFile", () => {
  test("returns filepath for known task", () => {
    const fp = findTaskFile(tasksDir, "factory-002");
    assert.ok(fp !== null);
    assert.ok(fp!.endsWith(".md"));
  });

  test("returns null for unknown task", () => {
    const fp = findTaskFile(tasksDir, "factory-999");
    assert.equal(fp, null);
  });
});
