import path from "path";
import { resolveFactoryRoot } from "./factory-root.ts";

/**
 * Build the argv array to invoke a factory script.
 *
 * In development: uses tsx to run the TypeScript source directly.
 * In container mode (DEVORY_CONTAINER=1): uses the pre-compiled JS bundle at dist/.
 */
export function buildTsxInvocation(
  scriptRelativePath: string,
  args: string[] = []
): string[] {
  const factoryRoot = resolveFactoryRoot().root;

  if (process.env.DEVORY_CONTAINER === "1") {
    // Container: scripts are pre-compiled into dist/ with the same directory structure
    const jsRelPath = scriptRelativePath.replace(/\.ts$/, ".js");
    const distScript = path.join(factoryRoot, "dist", jsRelPath);
    return [process.execPath, distScript, ...args];
  }

  const tsxCliPath = path.join(factoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const scriptPath = path.join(factoryRoot, scriptRelativePath);
  return [process.execPath, tsxCliPath, scriptPath, ...args];
}
