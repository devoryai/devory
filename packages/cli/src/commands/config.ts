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
import { loadStandards, STANDARDS_FILENAME } from "../../../core/src/index.ts";
import { detectTier, type LicenseInfo } from "../../../core/src/index.ts";

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
  standardsSource: "yaml" | "brain" | "none";
  license: LicenseInfo;
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
export async function buildConfigReport(factoryRoot: string, source?: FactoryRootSource): Promise<ConfigReport> {
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

  const { source: standardsSource } = loadStandards(factoryRoot);
  const brainDir = path.join(factoryRoot, "brain");
  const hasBrain = fs.existsSync(brainDir);
  const license = await detectTier(factoryRoot);

  return {
    factoryRoot,
    source,
    contextFileFound,
    tasksDir,
    tasksDirFound,
    workspacesFound,
    standardsSource: standardsSource.type === "yaml"
      ? "yaml"
      : hasBrain ? "brain" : "none",
    license,
  };
}

/** Format a config report as a human-readable string. */
export function formatConfigReport(report: ConfigReport): string {
  const sourceLabel = report.source ? ` (${report.source})` : "";
  const standardsLabel =
    report.standardsSource === "yaml"
      ? `${STANDARDS_FILENAME} (yaml)`
      : report.standardsSource === "brain"
      ? "brain/ (markdown)"
      : "none — run devory init";

  const { license } = report;
  const tierLabel = license.tier === "pro"
    ? `Pro  (key via ${license.source === "env" ? "DEVORY_LICENSE_KEY" : ".devory/license"})`
    : license.invalid
    ? `Core (invalid key — ${license.reason})`
    : "Core";

  const lines = [
    `Factory root:       ${report.factoryRoot}${sourceLabel}`,
    `Tier:               ${tierLabel}`,
    `FACTORY_CONTEXT.md: ${report.contextFileFound ? "found" : "NOT FOUND"}`,
    `tasks/:             ${report.tasksDirFound ? "found" : "NOT FOUND"}`,
    `Standards:          ${standardsLabel}`,
    `Packages:           ${
      report.workspacesFound.length > 0
        ? report.workspacesFound.join(", ")
        : "(none)"
    }`,
  ];
  return lines.join("\n");
}

export async function run(_args: ConfigArgs): Promise<number> {
  const { root, source } = resolveFactoryRoot();
  const report = await buildConfigReport(root, source);
  console.log(formatConfigReport(report));
  return 0;
}
