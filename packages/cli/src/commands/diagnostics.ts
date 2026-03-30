/**
 * packages/cli/src/commands/diagnostics.ts
 *
 * `devory diagnostics` — check self-hosted prerequisites before or after a run.
 *
 * Reports pass / warn / fail for each check so operators can diagnose common
 * configuration failures without reading logs or running a full factory run.
 *
 * The command is read-only: it does not write to any file or move any task.
 */

import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";

import { resolveFactoryRoot, type FactoryRootSource } from "../lib/factory-root.ts";
import { detectTier } from "../../../core/src/license.ts";

export const NAME = "diagnostics";
export const USAGE = "devory diagnostics [--root <dir>]";

export interface DiagnosticsArgs {
  root?: string;
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DiagnosticsReport {
  checks: CheckResult[];
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): { args?: DiagnosticsArgs; error: string | null } {
  let root: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      root = argv[++i];
      if (!root) return { error: "--root requires a value" };
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }

  return { args: { root }, error: null };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

export function checkFactoryRoot(
  root: string,
  source: FactoryRootSource
): CheckResult {
  const detail =
    source === "cwd"
      ? `${root}  (fallback: no FACTORY_CONTEXT.md found — set DEVORY_FACTORY_ROOT or run from your workspace)`
      : `${root}  (${source})`;
  return {
    label: "Factory root",
    status: source === "cwd" ? "warn" : "pass",
    detail,
  };
}

export function checkContextFile(root: string): CheckResult {
  const found = fs.existsSync(path.join(root, "FACTORY_CONTEXT.md"));
  return {
    label: "FACTORY_CONTEXT.md",
    status: found ? "pass" : "fail",
    detail: found ? "found" : "not found — run `devory init` to scaffold the workspace",
  };
}

function checkTasksDir(root: string): CheckResult {
  const tasksDir = path.join(root, "tasks");
  if (!fs.existsSync(tasksDir)) {
    return {
      label: "Tasks directory",
      status: "fail",
      detail: "not found — run `devory init` or create tasks/",
    };
  }

  // Count task files across all stage subdirectories
  let taskCount = 0;
  try {
    for (const entry of fs.readdirSync(tasksDir)) {
      const stageDir = path.join(tasksDir, entry);
      if (fs.statSync(stageDir).isDirectory()) {
        taskCount += fs.readdirSync(stageDir).filter((f) => f.endsWith(".md")).length;
      }
    }
  } catch {
    // Ignore read errors — directory exists, that's enough
  }

  return {
    label: "Tasks directory",
    status: "pass",
    detail: taskCount > 0 ? `found  (${taskCount} task${taskCount === 1 ? "" : "s"})` : "found  (no tasks yet)",
  };
}

export async function checkLicense(root: string): Promise<CheckResult> {
  const info = await detectTier(root);
  if (info.tier === "teams") {
    return {
      label: "License",
      status: "pass",
      detail: `Teams  (org: ${info.orgId ?? "unknown"}, seats: ${info.seatCount ?? "?"})`,
    };
  }
  if (info.tier === "pro") {
    const src = info.source === "env" ? "DEVORY_LICENSE_KEY" : ".devory/license";
    return {
      label: "License",
      status: "pass",
      detail: `Pro  (key via ${src})`,
    };
  }
  if (info.invalid) {
    return {
      label: "License",
      status: "fail",
      detail: `invalid key — ${info.reason}`,
    };
  }
  return {
    label: "License",
    status: "warn",
    detail: "Core  (no key — some features disabled; set DEVORY_LICENSE_KEY or run `devory license activate`)",
  };
}

function checkEngineMode(): CheckResult {
  const engine = process.env.FACTORY_DEFAULT_ENGINE?.trim();
  if (!engine) {
    return {
      label: "Engine mode",
      status: "warn",
      detail: "FACTORY_DEFAULT_ENGINE not set — defaults to ollama inside the container",
    };
  }
  return {
    label: "Engine mode",
    status: "pass",
    detail: `${engine}  (FACTORY_DEFAULT_ENGINE)`,
  };
}

function checkOllamaUrl(): { result: CheckResult; url: string } {
  const url = process.env.OLLAMA_BASE_URL?.trim() ?? "";
  if (!url) {
    return {
      result: {
        label: "OLLAMA_BASE_URL",
        status: "warn",
        detail: "not set — using container default http://ollama:11434",
      },
      url: "http://ollama:11434",
    };
  }
  return {
    result: {
      label: "OLLAMA_BASE_URL",
      status: "pass",
      detail: url,
    },
    url,
  };
}

/** Attempt a GET to `{baseUrl}/api/tags` with a 3-second timeout. */
export function fetchOllamaDefault(baseUrl: string): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve) => {
    const tagsUrl = `${baseUrl.replace(/\/$/, "")}/api/tags`;
    const lib = tagsUrl.startsWith("https") ? https : http;
    const req = lib.get(tagsUrl, { timeout: 3000 }, (res) => {
      // Drain body so the socket is released
      res.resume();
      resolve({ ok: res.statusCode !== undefined && res.statusCode < 400, status: res.statusCode ?? 0 });
    });
    req.on("error", () => resolve({ ok: false, status: 0 }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
  });
}

async function checkOllamaReachable(
  baseUrl: string,
  fetchOllama: (url: string) => Promise<{ ok: boolean; status: number }>
): Promise<CheckResult> {
  const engine = process.env.FACTORY_DEFAULT_ENGINE?.trim() ?? "ollama";

  // Only check connectivity when the engine is ollama (or unset)
  if (engine !== "ollama" && engine !== "") {
    return {
      label: "Ollama reachable",
      status: "pass",
      detail: `skipped  (engine is ${engine}, not ollama)`,
    };
  }

  try {
    const { ok, status } = await fetchOllama(baseUrl);
    if (ok) {
      return {
        label: "Ollama reachable",
        status: "pass",
        detail: `${baseUrl}  (HTTP ${status})`,
      };
    }
    return {
      label: "Ollama reachable",
      status: "fail",
      detail: `${baseUrl} returned HTTP ${status} — check Ollama is running and the model is pulled`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      label: "Ollama reachable",
      status: "fail",
      detail: `${baseUrl} — ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

export interface DiagnosticsOptions {
  fetchOllama?: (url: string) => Promise<{ ok: boolean; status: number }>;
}

export async function runChecks(
  factoryRoot: string,
  source: FactoryRootSource,
  options: DiagnosticsOptions = {}
): Promise<DiagnosticsReport> {
  const fetchOllama = options.fetchOllama ?? fetchOllamaDefault;

  const rootCheck = checkFactoryRoot(factoryRoot, source);
  const contextCheck = checkContextFile(factoryRoot);
  const tasksCheck = checkTasksDir(factoryRoot);
  const licenseCheck = await checkLicense(factoryRoot);
  const engineCheck = checkEngineMode();
  const { result: urlCheck, url: ollamaUrl } = checkOllamaUrl();
  const ollamaCheck = await checkOllamaReachable(ollamaUrl, fetchOllama);

  return {
    checks: [rootCheck, contextCheck, tasksCheck, licenseCheck, engineCheck, urlCheck, ollamaCheck],
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const STATUS_PREFIX: Record<CheckStatus, string> = {
  pass: "[PASS]",
  warn: "[WARN]",
  fail: "[FAIL]",
};

export function formatReport(report: DiagnosticsReport): string {
  const maxLabel = Math.max(...report.checks.map((c) => c.label.length));
  return report.checks
    .map((c) => {
      const prefix = STATUS_PREFIX[c.status];
      const pad = c.label.padEnd(maxLabel);
      return `${prefix} ${pad}  ${c.detail}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function run(args: DiagnosticsArgs): Promise<number> {
  const startDir = args.root ? path.resolve(args.root) : process.cwd();
  const { root, source } = resolveFactoryRoot(startDir);

  const report = await runChecks(root, source);
  console.log(formatReport(report));

  const anyFail = report.checks.some((c) => c.status === "fail");
  return anyFail ? 1 : 0;
}
