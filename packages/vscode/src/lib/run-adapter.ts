/**
 * packages/vscode/src/lib/run-adapter.ts
 *
 * Packaged runtime adapter for extension-managed factory runs.
 * This keeps runtime location, process spawning, and UI-facing status handling
 * testable without coupling to VS Code APIs.
 */

import { spawn } from "child_process";
import * as path from "path";

export interface RunStartArgs {
  limit?: number;
  resumeId?: string;
  /**
   * Routing env vars from the execution binding layer.
   * Injected into the runner subprocess environment so the orchestrator
   * can honor the routing decision where supported.
   * Keys are DEVORY_* env var names; values are strings.
   */
  routingEnv?: Record<string, string>;
}

export interface RunRuntimeInvocation {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface RunAdapterResult {
  exitCode: number;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface RunStartWorkflowResult {
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
  noOutput: boolean;
}

export function resolvePackagedRunInvocation(
  factoryRoot: string,
  runtimeRoot: string,
  args: RunStartArgs
): RunRuntimeInvocation {
  const runnerEntry = path.join(runtimeRoot, "packages", "runner", "src", "factory-run.js");

  const runnerArgs: string[] = [runnerEntry];
  if (args.resumeId) {
    runnerArgs.push("--resume", args.resumeId);
  }
  if (args.limit !== undefined) {
    runnerArgs.push("--limit", String(args.limit));
  }

  return {
    command: process.execPath,
    args: runnerArgs,
    cwd: factoryRoot,
    env: {
      ...process.env,
      DEVORY_FACTORY_ROOT: factoryRoot,
      DEVORY_RUNTIME_ROOT: runtimeRoot,
      FACTORY_DEFAULT_ENGINE:
        args.routingEnv?.DEVORY_ADAPTER_INVOCATION_MODE?.trim() ||
        process.env.FACTORY_DEFAULT_ENGINE,
      // Routing binding env vars (from execution binding layer).
      // Injected so the orchestrator can honor the routing decision where supported.
      // Keys are DEVORY_PROVIDER_CLASS, DEVORY_EXECUTION_PATH, etc.
      ...(args.routingEnv ?? {}),
    },
  };
}

export function runPackagedRuntime(
  invocation: RunRuntimeInvocation,
  onOutput?: (chunk: string) => void
): Promise<RunAdapterResult> {
  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: process.platform === "win32",
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout.push(text);
      onOutput?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr.push(text);
      onOutput?.(text);
    });

    child.on("error", (error: Error) => {
      stderr.push(error.message);
      resolve({ exitCode: 1, signal: null, stdout: stdout.join(""), stderr: stderr.join("") });
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      resolve({
        exitCode: code ?? 1,
        signal: signal ?? null,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      });
    });
  });
}

export async function startFactoryRun(
  factoryRoot: string,
  runtimeRoot: string,
  args: RunStartArgs,
  runner: (invocation: RunRuntimeInvocation, onOutput?: (chunk: string) => void) => Promise<RunAdapterResult> = runPackagedRuntime,
  onOutput?: (chunk: string) => void
): Promise<RunStartWorkflowResult> {
  const invocation = resolvePackagedRunInvocation(factoryRoot, runtimeRoot, args);

  if (onOutput) {
    const nodeName = path.basename(invocation.command);
    const runnerFile = path.basename(invocation.args[0]);
    const runnerFlags = invocation.args.slice(1);
    const cmdDisplay = [nodeName, runnerFile, ...runnerFlags].join(" ");
    onOutput(`[Devory] Workspace: ${factoryRoot}\n`);
    onOutput(`[Devory] Runner: ${cmdDisplay}\n`);
  }

  const result = await runner(invocation, onOutput);
  const noOutput = result.stdout.length === 0 && result.stderr.length === 0;

  if (onOutput) {
    if (result.signal) {
      onOutput(`[Devory] Process killed by signal ${result.signal}.\n`);
    } else {
      onOutput(`[Devory] Exited with code ${result.exitCode}.\n`);
    }
    if (result.exitCode === 0 && noOutput) {
      onOutput("[Devory] No output received — no ready tasks detected.\n");
    }
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      message:
        `Devory: ${args.resumeId ? "run resume" : "factory run"} failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`,
      stdout: result.stdout,
      stderr: result.stderr,
      noOutput,
    };
  }

  return {
    ok: true,
    message:
      args.resumeId
        ? `Devory: resumed ${args.resumeId}. Use Devory: Inspect Recent Runs to review progress.`
        : "Devory: factory run completed. Use Devory: Inspect Recent Runs to review the result.",
    stdout: result.stdout,
    stderr: result.stderr,
    noOutput,
  };
}
