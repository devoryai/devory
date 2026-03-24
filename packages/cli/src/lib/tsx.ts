import path from "path";
import { resolveFactoryRoot } from "./factory-root.ts";

export function buildTsxInvocation(
  scriptRelativePath: string,
  args: string[] = []
): string[] {
  const factoryRoot = resolveFactoryRoot().root;
  const tsxCliPath = path.join(factoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const scriptPath = path.join(factoryRoot, scriptRelativePath);
  return [process.execPath, tsxCliPath, scriptPath, ...args];
}
