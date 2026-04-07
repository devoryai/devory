import * as fs from "fs";
import * as path from "path";

export interface OutputAppender {
  appendLine(line: string): void;
}

/**
 * Seeds starter doctrine and skill files into a fresh factory workspace.
 * Copies files from runtimeRoot/templates/starter/ into factoryRoot only when
 * the destination does not already contain user-provided content.
 *
 * Does not overwrite files that already exist at the destination.
 * Silently skips if the starter templates are not found in runtimeRoot.
 */
export function seedStarterFiles(
  factoryRoot: string,
  runtimeRoot: string,
  output: OutputAppender
): void {
  const starterDoctrineDir = path.join(runtimeRoot, "templates", "starter", "doctrine");
  const starterSkillsDir = path.join(runtimeRoot, "templates", "starter", "skills");
  const targetDoctrineDir = path.join(factoryRoot, "doctrine");
  const targetSkillsDir = path.join(factoryRoot, "skills");

  try {
    // Seed doctrine only if no .md files already exist there
    let doctrineHasFiles = false;
    try {
      const files = fs.readdirSync(targetDoctrineDir);
      doctrineHasFiles = files.some((f) => f.endsWith(".md"));
    } catch {
      // Directory doesn't exist — treat as empty
    }

    if (!doctrineHasFiles) {
      const starterFiles = fs.readdirSync(starterDoctrineDir);
      fs.mkdirSync(targetDoctrineDir, { recursive: true });
      for (const file of starterFiles) {
        const dest = path.join(targetDoctrineDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(starterDoctrineDir, file), dest);
        }
      }
    }

    // Seed skills only if no subdirectories with SKILL.md already exist
    let skillsHasContent = false;
    try {
      const entries = fs.readdirSync(targetSkillsDir, { withFileTypes: true });
      skillsHasContent = entries
        .filter((e) => e.isDirectory())
        .some((e) => fs.existsSync(path.join(targetSkillsDir, e.name, "SKILL.md")));
    } catch {
      // Directory doesn't exist — treat as empty
    }

    if (!skillsHasContent) {
      const skillDirs = fs
        .readdirSync(starterSkillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory());
      fs.mkdirSync(targetSkillsDir, { recursive: true });
      for (const skillDir of skillDirs) {
        const destSkillDir = path.join(targetSkillsDir, skillDir.name);
        const skillMdDest = path.join(destSkillDir, "SKILL.md");
        if (!fs.existsSync(skillMdDest)) {
          fs.mkdirSync(destSkillDir, { recursive: true });
          fs.copyFileSync(
            path.join(starterSkillsDir, skillDir.name, "SKILL.md"),
            skillMdDest
          );
        }
      }
    }

    output.appendLine("Starter doctrine and skills copied.");
  } catch {
    // Seeding is best-effort; do not fail the overall init command
  }
}
