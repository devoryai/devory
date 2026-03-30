/**
 * packages/cli/src/lib/workspace.test.ts
 *
 * Tests for the shared workspace mutation APIs.
 * Run: tsx --test packages/cli/src/lib/workspace.test.ts
 */

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  applyReviewAction,
  buildTaskFilename,
  checkTransition,
  createTask,
  moveTask,
} from "./workspace.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-api-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTask(stage: string, filename: string, content: string): string {
  const dir = path.join(tmpDir, "tasks", stage);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function taskContent(fields: Record<string, string>): string {
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")}\n---\n\nTask body.\n`;
}

describe("checkTransition", () => {
  test("accepts an allowed lifecycle transition", () => {
    assert.deepEqual(checkTransition("backlog", "ready"), { allowed: true });
  });

  test("rejects an invalid lifecycle transition", () => {
    const result = checkTransition("backlog", "done");
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /not allowed/);
  });
});

describe("createTask", () => {
  test("creates a backlog task file and returns its content", () => {
    const result = createTask(
      { id: "factory-120", title: "Shared mutation API", project: "ai-dev-factory" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(fs.existsSync(result.filePath));
    assert.equal(
      path.basename(result.filePath),
      buildTaskFilename("factory-120", "Shared mutation API")
    );
    assert.match(result.content, /status: backlog/);
  });

  test("supports dry-run without writing a file", () => {
    const result = createTask(
      { id: "factory-121", title: "Dry run task", project: "ai-dev-factory" },
      { factoryRoot: tmpDir, dryRun: true }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(fs.existsSync(result.filePath), false);
    assert.match(result.content, /## Goal/);
  });

  test("rejects duplicate task filenames", () => {
    const filename = buildTaskFilename("factory-122", "Duplicate task");
    writeTask("backlog", filename, taskContent({
      id: "factory-122",
      title: "Duplicate task",
      project: "ai-dev-factory",
      status: "backlog",
      agent: "backend-builder",
    }));

    const result = createTask(
      { id: "factory-122", title: "Duplicate task", project: "ai-dev-factory" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /File already exists/);
  });
});

describe("moveTask", () => {
  test("moves a task to the next lifecycle stage and rewrites status", () => {
    const filename = "factory-123-move-me.md";
    const sourcePath = writeTask("backlog", filename, taskContent({
      id: "factory-123",
      title: "Move me",
      project: "ai-dev-factory",
      status: "backlog",
      agent: "backend-builder",
    }));

    const result = moveTask(
      { task: sourcePath, to: "ready" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(fs.existsSync(sourcePath), false);
    assert.equal(path.basename(result.toPath), filename);
    const movedContent = fs.readFileSync(result.toPath, "utf-8");
    assert.match(movedContent, /status: ready/);

    const runArtifacts = fs.readdirSync(path.join(tmpDir, "runs"));
    assert.equal(runArtifacts.length, 1);
    assert.match(runArtifacts[0], /factory-123-move\.md$/);
  });

  test("rejects invalid lifecycle transitions", () => {
    const sourcePath = writeTask("backlog", "factory-124-invalid.md", taskContent({
      id: "factory-124",
      title: "Invalid move",
      project: "ai-dev-factory",
      status: "backlog",
      agent: "backend-builder",
    }));

    const result = moveTask(
      { task: sourcePath, to: "done" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /not allowed/);
    assert.equal(fs.existsSync(path.join(tmpDir, "runs")), false);
  });

  test("returns validation errors when required metadata is missing", () => {
    const sourcePath = writeTask("ready", "factory-125-missing-agent.md", taskContent({
      id: "factory-125",
      title: "Missing agent",
      project: "ai-dev-factory",
      status: "ready",
    }));

    const result = moveTask(
      { task: sourcePath, to: "doing" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "Validation failed");
    assert.deepEqual(result.validationErrors, ['Missing required field: "agent"']);
  });
});

describe("applyReviewAction", () => {
  test("moves a review task through the shared review action service and records artifacts", () => {
    const sourcePath = writeTask("review", "factory-126-review.md", taskContent({
      id: "factory-126",
      title: "Review me",
      project: "ai-dev-factory",
      status: "review",
      agent: "backend-builder",
    }));

    const result = applyReviewAction(
      { task: sourcePath, action: "approve", reason: "Looks good" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.toStatus, "done");
    assert.equal(fs.existsSync(sourcePath), false);
    assert.equal(fs.existsSync(result.toPath), true);

    const runArtifacts = fs.readdirSync(path.join(tmpDir, "runs"));
    assert.equal(runArtifacts.some((name) => name.endsWith("factory-126-move.md")), true);
    assert.equal(runArtifacts.some((name) => name.endsWith("factory-126-review.md")), true);

    const reviewArtifactName = runArtifacts.find((name) => name.endsWith("factory-126-review.md"));
    assert.ok(reviewArtifactName, "expected a review audit artifact");
    const reviewArtifact = fs.readFileSync(
      path.join(tmpDir, "runs", reviewArtifactName!),
      "utf-8"
    );
    assert.match(reviewArtifact, /action: approve/);
    assert.match(reviewArtifact, /reason: Looks good/);
  });

  test("rejects invalid review actions consistently", () => {
    const sourcePath = writeTask("review", "factory-127-review.md", taskContent({
      id: "factory-127",
      title: "Reject invalid review action",
      project: "ai-dev-factory",
      status: "review",
      agent: "backend-builder",
    }));

    const result = applyReviewAction(
      { task: sourcePath, action: "block", reason: "" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /reason is required/i);
  });

  test("rejects review actions for tasks outside the review stage", () => {
    const sourcePath = writeTask("doing", "factory-128-not-review.md", taskContent({
      id: "factory-128",
      title: "Not in review",
      project: "ai-dev-factory",
      status: "doing",
      agent: "backend-builder",
    }));

    const result = applyReviewAction(
      { task: sourcePath, action: "approve", reason: "" },
      { factoryRoot: tmpDir }
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /must be in review/i);
  });
});
