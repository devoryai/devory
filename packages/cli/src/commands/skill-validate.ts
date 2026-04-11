import * as fs from "node:fs";
import * as path from "node:path";
import { resolveFactoryRoot, validateSkillFile } from "@devory/core";

export const NAME = "skill validate";
export const USAGE = "devory skill validate <name> [--root <dir>] | devory skill validate --all [--root <dir>]";

export interface SkillValidateArgs {
  skillName?: string;
  all?: boolean;
  root?: string;
}

export function parseArgs(
  argv: string[]
): { args: SkillValidateArgs; error: null } | { args: null; error: string } {
  const args: SkillValidateArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--all") {
      args.all = true;
    } else if (token === "--root") {
      args.root = argv[i + 1] ?? "";
      i += 1;
    } else if (!token.startsWith("--") && args.skillName === undefined) {
      args.skillName = token;
    } else {
      return { args: null, error: `Unknown argument: ${token}` };
    }
  }

  if (!args.all && !args.skillName) {
    return { args: null, error: "Provide either <name> or --all" };
  }

  if (args.all && args.skillName) {
    return { args: null, error: "Use either <name> or --all, not both" };
  }

  return { args, error: null };
}

function listSkillNames(factoryRoot: string): string[] {
  const skillsDir = path.join(factoryRoot, "skills");
  if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function validateOneSkill(skillName: string, factoryRoot: string): { passed: boolean; warnings: number } {
  const skillFile = path.join(factoryRoot, "skills", skillName, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    console.error(`FAIL ${skillName}`);
    console.error(`  - Missing file: skills/${skillName}/SKILL.md`);
    return { passed: false, warnings: 0 };
  }

  const content = fs.readFileSync(skillFile, "utf-8");
  const validation = validateSkillFile(skillName, content);

  if (!validation.valid) {
    console.error(`FAIL ${skillName}`);
    validation.errors.forEach((error) => console.error(`  - ${error}`));
    validation.warnings.forEach((warning) => console.warn(`  ~ ${warning}`));
    return { passed: false, warnings: validation.warnings.length };
  }

  console.log(`OK   ${skillName}`);
  validation.warnings.forEach((warning) => console.warn(`  ~ ${warning}`));
  return { passed: true, warnings: validation.warnings.length };
}

export function run(args: SkillValidateArgs): number {
  const rootStart = args.root ? path.resolve(args.root) : process.cwd();
  const factoryRoot = resolveFactoryRoot(rootStart).root;

  const targets = args.all ? listSkillNames(factoryRoot) : [args.skillName!];

  if (targets.length === 0) {
    console.error("No skills found to validate.");
    return 1;
  }

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const skillName of targets) {
    const result = validateOneSkill(skillName, factoryRoot);
    warnings += result.warnings;
    if (result.passed) {
      passed += 1;
    } else {
      failed += 1;
    }
  }

  console.log(`\nTotal: ${targets.length}  Passed: ${passed}  Failed: ${failed}${warnings > 0 ? `  Warned: ${warnings}` : ""}`);
  return failed > 0 ? 1 : 0;
}
