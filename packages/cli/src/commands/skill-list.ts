import * as fs from "node:fs";
import * as path from "node:path";
import { resolveFactoryRoot } from "@devory/core";

export const NAME = "skill list";
export const USAGE = "devory skill list [--root <dir>]";

export interface SkillListArgs {
  root?: string;
}

export function parseArgs(
  argv: string[]
): { args: SkillListArgs; error: null } | { args: null; error: string } {
  const args: SkillListArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--root") {
      args.root = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    return { args: null, error: `Unknown argument: ${token}` };
  }

  return { args, error: null };
}

export function run(args: SkillListArgs): number {
  const rootStart = args.root ? path.resolve(args.root) : process.cwd();
  const factoryRoot = resolveFactoryRoot(rootStart).root;
  const skillsDir = path.join(factoryRoot, "skills");

  if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) {
    console.log("No skills found.");
    return 0;
  }

  const names = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    console.log("No skills found.");
    return 0;
  }

  names.forEach((name) => console.log(name));
  return 0;
}