const REQUIRED_SECTIONS = [
  "## When to Use",
  "## What This Skill Covers",
  "## What This Skill Does Not Cover",
  "## Inputs",
  "## Procedure",
  "## Outputs / Verification",
  "## Common Mistakes",
] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function extractSectionContent(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return [];
  }

  const content: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ") || line.startsWith("# ")) {
      break;
    }
    if (line.trim() !== "") {
      content.push(line.trim());
    }
  }

  return content;
}

function hasRequiredFrontmatterKeys(markdown: string): string[] {
  const errors: string[] = [];
  const lines = markdown.split("\n");

  if (lines[0]?.trim() !== "---") {
    errors.push("Missing YAML frontmatter opening delimiter (---)");
    return errors;
  }

  const closeIndex = lines.indexOf("---", 1);
  if (closeIndex === -1) {
    errors.push("Missing YAML frontmatter closing delimiter (---)");
    return errors;
  }

  const frontmatter = lines.slice(1, closeIndex).join("\n");
  const requiredKeys = ["name", "version", "tags"];
  for (const key of requiredKeys) {
    const pattern = new RegExp(`^${key}:\\s*.+$`, "m");
    if (!pattern.test(frontmatter)) {
      errors.push(`Missing required frontmatter key: "${key}"`);
    }
  }

  return errors;
}

export function validateSkillFile(skillName: string, content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!SKILL_NAME_PATTERN.test(skillName)) {
    errors.push(
      `Skill name "${skillName}" is invalid. Expected lowercase kebab-case matching ^[a-z][a-z0-9-]*$`
    );
  }

  const trimmedContent = content.trim();
  if (trimmedContent === "") {
    errors.push("SKILL.md is empty");
    return { valid: false, errors, warnings };
  }

  errors.push(...hasRequiredFrontmatterKeys(content));

  const lineCount = content.split("\n").length;
  if (lineCount > 500) {
    warnings.push(
      `SKILL.md is ${lineCount} lines. Consider keeping skills focused (soft limit: 500 lines).`
    );
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  const procedureContent = extractSectionContent(content, "## Procedure");
  const numberedProcedureItems = procedureContent.filter((line) => /^\d+\.\s+/.test(line));
  if (numberedProcedureItems.length > 0 && numberedProcedureItems.length < 3) {
    errors.push('"## Procedure" must contain at least 3 numbered list items');
  }

  const commonMistakesContent = extractSectionContent(content, "## Common Mistakes");
  const commonMistakeItems = commonMistakesContent.filter((line) => line.startsWith("- "));
  if (commonMistakeItems.length > 0 && commonMistakeItems.length < 3) {
    errors.push('"## Common Mistakes" must contain at least 3 list items');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
