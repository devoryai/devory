/**
 * packages/cli/src/commands/config.ts
 *
 * `devory config` — show factory configuration and health status.
 *
 * This command is implemented inline (no delegated script) since it only
 * reads environment and config markers that are available at import time.
 */

import * as fs from "fs";
import * as path from "path";

import { resolveFactoryRoot, type FactoryRootSource } from "../lib/factory-root.ts";

export const NAME = "config";
export const USAGE = "devory config";

export interface ConfigArgs {}

export interface ConfigReport {
  factoryRoot: string;
  source?: FactoryRootSource;
  contextFileFound: boolean;
  tasksDir: string;
  tasksDirFound: boolean;
  workspacesFound: string[];
}

export function parseArgs(
  _argv: string[]
): { args: ConfigArgs; error: null } {
  return { args: {}, error: null };
}

/**
 * Pure: build a config report given a factory root path.
 * Testable without spawning processes.
 */
export function buildConfigReport(factoryRoot: string, source?: FactoryRootSource): ConfigReport {
  const contextFileFound = fs.existsSync(
    path.join(factoryRoot, "FACTORY_CONTEXT.md")
  );
  const tasksDir = path.join(factoryRoot, "tasks");
  const tasksDirFound = fs.existsSync(tasksDir);

  const packagesDir = path.join(factoryRoot, "packages");
  const workspacesFound = fs.existsSync(packagesDir)
    ? fs.readdirSync(packagesDir).filter((name) => {
        const pkg = path.join(packagesDir, name, "package.json");
        return fs.existsSync(pkg);
      })
    : [];

  return {
    factoryRoot,
    source,
    contextFileFound,
    tasksDir,
    tasksDirFound,
    workspacesFound,
  };
}

/** Format a config report as a human-readable string. */
export function formatConfigReport(report: ConfigReport): string {
  const sourceLabel = report.source ? ` (${report.source})` : "";
  const lines = [
    `Factory root:       ${report.factoryRoot}${sourceLabel}`,
    `FACTORY_CONTEXT.md: ${report.contextFileFound ? "found" : "NOT FOUND"}`,
    `tasks/:             ${report.tasksDirFound ? "found" : "NOT FOUND"}`,
    `Packages:           ${
      report.workspacesFound.length > 0
        ? report.workspacesFound.join(", ")
        : "(none)"
    }`,
  ];
  return lines.join("\n");
}

export function run(_args: ConfigArgs): number {
  const { root, source } = resolveFactoryRoot();
  const report = buildConfigReport(root, source);
  console.log(formatConfigReport(report));
  return 0;
}
