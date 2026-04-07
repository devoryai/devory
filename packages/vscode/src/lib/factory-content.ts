import * as fs from "fs";
import * as path from "path";

const DOCTRINE_TEMPLATE = `# Doctrine Title

## Purpose

Describe the durable rule, standard, or philosophy this doctrine file defines.

## Rules

- Rule 1
- Rule 2

## Notes

Add examples, boundaries, or references if they help future authors apply this doctrine consistently.
`;

export const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export type FactoryContentCreateResult =
  | { ok: true; filePath: string }
  | { ok: false; error: string };

export type ArchiveFactoryContentResult =
  | { ok: true; archivedPath: string }
  | { ok: false; error: string };

function toFriendlyTitle(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readSkillTemplate(factoryRoot: string, runtimeRoot?: string): string {
  const candidates = [
    path.join(factoryRoot, "templates", "skill-template.md"),
    runtimeRoot ? path.join(runtimeRoot, "templates", "skill-template.md") : null,
  ].filter((candidate): candidate is string => candidate !== null);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.readFileSync(candidate, "utf-8");
    }
  }

  return [
    "---",
    "name: Skill Name Here",
    "version: 1",
    "tags: []",
    "---",
    "",
    "# Skill Name Here",
    "",
    "## When to Use",
    "",
    "This skill applies when the task involves any of the following:",
    "",
    "- [Condition 1 — be specific]",
    "- [Condition 2 — be specific]",
    "",
    "## What This Skill Covers",
    "",
    "This skill covers:",
    "",
    "- [Specific pattern or decision covered]",
    "- [Specific procedure or guidance covered]",
    "",
    "## What This Skill Does Not Cover",
    "",
    "- [Excluded topic]: see [doctrine file or other skill]",
    "",
    "## Inputs",
    "",
    "Before following this skill, confirm you have:",
    "",
    "- [Required input 1]",
    "- [Required input 2]",
    "",
    "## Procedure",
    "",
    "1. [First step — imperative verb, concrete action]",
    "2. [Second step]",
    "3. [Third step]",
    "",
    "## Outputs / Verification",
    "",
    "Expected outputs:",
    "- [Artifact 1]",
    "",
    "Verification:",
    "- [Command or check that confirms correct execution]",
    "",
    "## Common Mistakes",
    "",
    "1. **[Mistake name]** — [What it looks like and why it is a problem.]",
    "2. **[Mistake name]** — [What it looks like and why it is a problem.]",
    "3. **[Mistake name]** — [What it looks like and why it is a problem.]",
    "",
  ].join("\n");
}

export function createDoctrineFile(
  factoryRoot: string,
  name: string
): FactoryContentCreateResult {
  const trimmedName = name.trim().replace(/\\/g, "/");
  if (!trimmedName) {
    return { ok: false, error: "Doctrine file name is required." };
  }

  const filename = trimmedName.endsWith(".md") ? trimmedName : `${trimmedName}.md`;
  if (filename.includes("/") || filename.includes("..")) {
    return { ok: false, error: "Doctrine file name must be a single markdown filename." };
  }

  const doctrineDir = path.join(factoryRoot, "doctrine");
  const filePath = path.join(doctrineDir, filename);
  if (fs.existsSync(filePath)) {
    return { ok: false, error: `Doctrine file already exists: doctrine/${filename}` };
  }

  fs.mkdirSync(doctrineDir, { recursive: true });
  fs.writeFileSync(
    filePath,
    DOCTRINE_TEMPLATE.replace("Doctrine Title", toFriendlyTitle(filename.replace(/\.md$/, ""))),
    "utf-8"
  );
  return { ok: true, filePath };
}

export function createSkillFile(
  factoryRoot: string,
  skillName: string,
  runtimeRoot?: string
): FactoryContentCreateResult {
  const trimmedName = skillName.trim();
  if (!SKILL_NAME_PATTERN.test(trimmedName)) {
    return {
      ok: false,
      error: `Invalid skill name "${skillName}". Expected lowercase kebab-case matching ^[a-z][a-z0-9-]*$`,
    };
  }

  const skillDir = path.join(factoryRoot, "skills", trimmedName);
  const skillFile = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(skillDir)) {
    return { ok: false, error: `Skill already exists: skills/${trimmedName}` };
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillFile, readSkillTemplate(factoryRoot, runtimeRoot), "utf-8");
  return { ok: true, filePath: skillFile };
}

export function archiveDoctrineFile(
  factoryRoot: string,
  filePath: string
): ArchiveFactoryContentResult {
  const resolved = path.resolve(filePath);
  const doctrineDir = path.join(factoryRoot, "doctrine");
  const archiveDir = path.join(doctrineDir, "archive");
  const expectedPrefix = `${path.resolve(doctrineDir)}${path.sep}`;

  if (!resolved.startsWith(expectedPrefix)) {
    return { ok: false, error: "Only doctrine files inside doctrine/ can be archived." };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: `Doctrine file not found: ${resolved}` };
  }

  const archivedPath = path.join(archiveDir, path.basename(resolved));
  if (fs.existsSync(archivedPath)) {
    return {
      ok: false,
      error: `Archive destination already exists: doctrine/archive/${path.basename(resolved)}`,
    };
  }

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(resolved, archivedPath);
  return { ok: true, archivedPath };
}

export function archiveSkillDirectory(
  factoryRoot: string,
  skillMdPath: string
): ArchiveFactoryContentResult {
  const resolved = path.resolve(skillMdPath);
  const skillsDir = path.join(factoryRoot, "skills");
  const archiveDir = path.join(skillsDir, "archive");
  const skillDir = path.dirname(resolved);
  const skillName = path.basename(skillDir);
  const expectedPrefix = `${path.resolve(skillsDir)}${path.sep}`;

  if (!resolved.startsWith(expectedPrefix)) {
    return { ok: false, error: "Only skills inside skills/ can be archived." };
  }
  if (!fs.existsSync(resolved) || path.basename(resolved) !== "SKILL.md") {
    return { ok: false, error: `Skill file not found: ${resolved}` };
  }

  const archivedPath = path.join(archiveDir, skillName);
  if (fs.existsSync(archivedPath)) {
    return {
      ok: false,
      error: `Archive destination already exists: skills/archive/${skillName}`,
    };
  }

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(skillDir, archivedPath);
  return { ok: true, archivedPath };
}
