import * as fs from "node:fs";
import * as path from "node:path";
import { resolveFactoryRoot } from "@devory/core";

export const NAME = "skill new";
export const USAGE = "devory skill new <name> [--root <dir>]";

const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface SkillNewArgs {
  name: string;
  root?: string;
}

export function parseArgs(
  argv: string[]
): { args: SkillNewArgs; error: null } | { args: null; error: string } {
  let name: string | undefined;
  let root: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--root") {
      root = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (token.startsWith("--")) {
      return { args: null, error: `Unknown argument: ${token}` };
    }

    if (name !== undefined) {
      return { args: null, error: `Unexpected argument: ${token}` };
    }

    name = token;
  }

  if (!name) {
    return { args: null, error: "Provide a skill name: devory skill new <name>" };
  }

  return { args: { name, root }, error: null };
}

export function run(args: SkillNewArgs): number {
  if (!SKILL_NAME_PATTERN.test(args.name)) {
    console.error(
      `Invalid skill name "${args.name}". Expected lowercase kebab-case matching ^[a-z][a-z0-9-]*$`
    );
    return 1;
  }

  const rootStart = args.root ? path.resolve(args.root) : process.cwd();
  const factoryRoot = resolveFactoryRoot(rootStart).root;
  const skillDir = path.join(factoryRoot, "skills", args.name);
  const skillFile = path.join(skillDir, "SKILL.md");
  const templateFile = path.join(factoryRoot, "templates", "skill-template.md");

  if (fs.existsSync(skillDir)) {
    console.error(`Skill already exists: skills/${args.name}`);
    return 1;
  }

  if (!fs.existsSync(templateFile)) {
    console.error("Missing template: templates/skill-template.md");
    return 1;
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(templateFile, skillFile);

  console.log(`Created skills/${args.name}/SKILL.md`);
  console.log(`Next: Edit skills/${args.name}/SKILL.md, then run devory skill validate ${args.name}`);
  return 0;
}