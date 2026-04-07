import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { archiveDoctrineFile, archiveSkillDirectory, createDoctrineFile, createSkillFile } from "../lib/factory-content.js";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devory-factory-content-"));
}

test("createDoctrineFile creates a markdown file under doctrine", () => {
  const root = tempRoot();
  const result = createDoctrineFile(root, "architecture-rules");
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, "doctrine", "architecture-rules.md")), true);
});

test("createSkillFile creates skills/<name>/SKILL.md", () => {
  const root = tempRoot();
  const result = createSkillFile(root, "database-migration");
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, "skills", "database-migration", "SKILL.md")), true);
});

test("archiveDoctrineFile moves a doctrine file into doctrine/archive", () => {
  const root = tempRoot();
  const file = path.join(root, "doctrine", "rules.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "# Rules\n", "utf-8");
  const result = archiveDoctrineFile(root, file);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, "doctrine", "archive", "rules.md")), true);
});

test("archiveSkillDirectory moves a skill directory into skills/archive", () => {
  const root = tempRoot();
  const skillMd = path.join(root, "skills", "db", "SKILL.md");
  fs.mkdirSync(path.dirname(skillMd), { recursive: true });
  fs.writeFileSync(skillMd, "# Skill\n", "utf-8");
  const result = archiveSkillDirectory(root, skillMd);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, "skills", "archive", "db", "SKILL.md")), true);
});
