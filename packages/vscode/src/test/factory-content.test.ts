import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  archiveDoctrineFile,
  archiveSkillDirectory,
  createDoctrineFile,
  createSkillFile,
} from "../lib/factory-content.js";

let factoryRoot: string;
let runtimeRoot: string;

beforeEach(() => {
  factoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-factory-content-"));
  runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-factory-runtime-"));
  fs.mkdirSync(path.join(runtimeRoot, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "templates", "skill-template.md"),
    "# Skill Name Here\n",
    "utf-8"
  );
});

afterEach(() => {
  fs.rmSync(factoryRoot, { recursive: true, force: true });
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

describe("createDoctrineFile", () => {
  test("creates a doctrine markdown file", () => {
    const result = createDoctrineFile(factoryRoot, "new-rules");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(fs.existsSync(result.filePath), true);
    assert.match(fs.readFileSync(result.filePath, "utf-8"), /# New Rules/);
  });
});

describe("createSkillFile", () => {
  test("creates a skill directory from the runtime template", () => {
    const result = createSkillFile(factoryRoot, "new-skill", runtimeRoot);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(fs.existsSync(result.filePath), true);
    assert.match(fs.readFileSync(result.filePath, "utf-8"), /Skill Name Here/);
  });
});

describe("archiveDoctrineFile", () => {
  test("moves a doctrine file under doctrine/archive", () => {
    const createResult = createDoctrineFile(factoryRoot, "rules.md");
    assert.equal(createResult.ok, true);
    if (!createResult.ok) return;
    const result = archiveDoctrineFile(factoryRoot, createResult.filePath);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(fs.existsSync(createResult.filePath), false);
    assert.equal(fs.existsSync(result.archivedPath), true);
  });
});

describe("archiveSkillDirectory", () => {
  test("moves a skill directory under skills/archive", () => {
    const createResult = createSkillFile(factoryRoot, "archivable-skill", runtimeRoot);
    assert.equal(createResult.ok, true);
    if (!createResult.ok) return;
    const result = archiveSkillDirectory(factoryRoot, createResult.filePath);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(fs.existsSync(createResult.filePath), false);
    assert.equal(fs.existsSync(path.join(result.archivedPath, "SKILL.md")), true);
  });
});
