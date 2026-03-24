import * as fs from "fs";
import * as path from "path";

export type FactoryRootSource =
  | "env:DEVORY_FACTORY_ROOT"
  | "env:FACTORY_ROOT"
  | "git-walk"
  | "cwd";

export type FactoryMode = "local" | "hosted";

export interface FactoryPaths {
  tasksDir: string;
  runsDir: string;
  artifactsDir: string;
  contextFile: string;
}

export interface FactoryEnvironment {
  root: string;
  source: FactoryRootSource;
  mode: FactoryMode;
  paths: FactoryPaths;
}

const FACTORY_MARKER = "FACTORY_CONTEXT.md";

function trimEnv(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function findFactoryContextDir(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, FACTORY_MARKER))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveFactoryRoot(startDir = process.cwd()): {
  root: string;
  source: FactoryRootSource;
} {
  const explicit = trimEnv(process.env.DEVORY_FACTORY_ROOT);
  if (explicit) {
    return { root: explicit, source: "env:DEVORY_FACTORY_ROOT" };
  }

  const legacy = trimEnv(process.env.FACTORY_ROOT);
  if (legacy) {
    return { root: legacy, source: "env:FACTORY_ROOT" };
  }

  const walked = findFactoryContextDir(startDir);
  if (walked) {
    return { root: walked, source: "git-walk" };
  }

  return { root: path.resolve(startDir), source: "cwd" };
}

export function factoryPaths(root: string): FactoryPaths {
  return {
    tasksDir: path.join(root, "tasks"),
    runsDir: path.join(root, "runs"),
    artifactsDir: path.join(root, "artifacts"),
    contextFile: path.join(root, FACTORY_MARKER),
  };
}

export function resolveFactoryMode(env: NodeJS.ProcessEnv = process.env): FactoryMode {
  const explicitMode = trimEnv(env.DEVORY_FACTORY_MODE) ?? trimEnv(env.FACTORY_MODE);
  if (explicitMode === "hosted") return "hosted";
  if (explicitMode === "local") return "local";

  if (trimEnv(env.DEVORY_REMOTE_FACTORY_URL) || trimEnv(env.FACTORY_REMOTE_URL)) {
    return "hosted";
  }

  return "local";
}

export function resolveFactoryEnvironment(
  startDir = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): FactoryEnvironment {
  const { root, source } = resolveFactoryRoot(startDir);
  return {
    root,
    source,
    mode: resolveFactoryMode(env),
    paths: factoryPaths(root),
  };
}
