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
}

export interface RunRuntimeInvocation {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface RunAdapterResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunStartWorkflowResult {
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
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
    },
  };
}

export function runPackagedRuntime(
  invocation: RunRuntimeInvocation
): Promise<RunAdapterResult> {
  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: process.platform === "win32",
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

    child.on("error", (error: Error) => {
      stderr.push(error.message);
      resolve({ exitCode: 1, stdout: stdout.join(""), stderr: stderr.join("") });
    });

    child.on("close", (code: number | null) => {
      resolve({
        exitCode: code ?? 1,
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
  runner: (invocation: RunRuntimeInvocation) => Promise<RunAdapterResult> = runPackagedRuntime
): Promise<RunStartWorkflowResult> {
  const invocation = resolvePackagedRunInvocation(factoryRoot, runtimeRoot, args);
  const result = await runner(invocation);

  if (result.exitCode !== 0) {
    return {
      ok: false,
      message:
        `Devory: ${args.resumeId ? "run resume" : "factory run"} failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`,
      stdout: result.stdout,
      stderr: result.stderr,
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
  };
}
