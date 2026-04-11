/**
 * packages/cli/src/commands/license.ts
 *
 * `devory license` — local license activation lifecycle commands.
 */

import * as path from "path";

import {
  clearLicenseToken,
  getLicenseStatus,
  getLicenseFilePath,
  writeLicenseToken,
  type LicenseStatus,
} from "../../../core/src/license.ts";
import { resolveFactoryRoot } from "../lib/factory-root.ts";

export const NAME = "license";
export const USAGE = "devory license <activate|clear|status> [options]";

export type LicenseSubcommand = "activate" | "clear" | "status";

export interface LicenseArgs {
  subcommand: LicenseSubcommand;
  key?: string;
  root?: string;
}

export function parseArgs(argv: string[]): { args?: LicenseArgs; error: string | null } {
  const subcommand = argv[0];
  if (!subcommand || !["activate", "clear", "status"].includes(subcommand)) {
    return { error: "expected subcommand activate, clear, or status" };
  }

  let key: string | undefined;
  let root: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--key") {
      key = argv[++i];
      if (!key) return { error: "--key requires a value" };
      continue;
    }
    if (arg === "--root") {
      root = argv[++i];
      if (!root) return { error: "--root requires a value" };
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }

  if (subcommand === "activate" && !key) {
    return { error: "activate requires --key <token>" };
  }

  return {
    args: { subcommand: subcommand as LicenseSubcommand, key, root },
    error: null,
  };
}

function formatPathForDisplay(targetPath: string, cwd = process.cwd()): string {
  const relative = path.relative(cwd, targetPath);
  return relative && !relative.startsWith("..") ? relative : targetPath;
}

function describeFsError(err: unknown, action: string, targetPath: string): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code?: string }).code) : "";
  const displayPath = formatPathForDisplay(targetPath);

  if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
    return `${action} failed: ${displayPath} is not writable`;
  }

  return `${action} failed at ${displayPath}: ${err instanceof Error ? err.message : String(err)}`;
}

export function formatLicenseStatusReport(status: LicenseStatus, factoryRoot: string): string {
  const licenseFilePath = formatPathForDisplay(status.licenseFilePath ?? getLicenseFilePath(factoryRoot));
  const lines = [
    `Factory root: ${factoryRoot}`,
    `Tier: ${status.tier === "pro" ? "Pro" : "Core"}`,
    `Key present: ${status.hasKey ? "yes" : "no"}`,
    `Key source: ${status.sourceLabel ?? "none"}`,
    `Cache used: ${status.cacheUsed ? "yes" : "no"}`,
    `License file: ${licenseFilePath}`,
  ];

  if (status.cacheFilePath) {
    lines.push(`License cache: ${formatPathForDisplay(status.cacheFilePath)}`);
  }

  if (status.userId) {
    lines.push(`User: ${status.userId}`);
  }

  if (status.expiresAt) {
    lines.push(`Expires: ${status.expiresAt}`);
  }

  if (status.kid) {
    lines.push(`Key id: ${status.kid}`);
  }

  if (status.tier === "core") {
    lines.push(`Fallback: ${status.reason}`);
  } else {
    lines.push(`Verification: ${status.reason}`);
  }

  return lines.join("\n");
}

export async function run(args: LicenseArgs): Promise<number> {
  const factoryRoot = args.root ? path.resolve(args.root) : resolveFactoryRoot().root;

  if (args.subcommand === "activate") {
    try {
      const result = writeLicenseToken(factoryRoot, args.key!);
      console.log(`License key saved to ${formatPathForDisplay(result.path)}`);
      console.log("Run `devory license status` to verify the local activation state.");
      return 0;
    } catch (err) {
      console.error(describeFsError(err, "License activation", getLicenseFilePath(factoryRoot)));
      return 1;
    }
  }

  if (args.subcommand === "clear") {
    try {
      const result = clearLicenseToken(factoryRoot);
      console.log(
        result.removed
          ? `Removed ${formatPathForDisplay(result.path)}`
          : `No license file found at ${formatPathForDisplay(result.path)}`
      );
      return 0;
    } catch (err) {
      console.error(describeFsError(err, "License clear", getLicenseFilePath(factoryRoot)));
      return 1;
    }
  }

  const status = await getLicenseStatus(factoryRoot);
  console.log(formatLicenseStatusReport(status, factoryRoot));
  return status.invalid ? 1 : 0;
}
