/**
 * packages/vscode/src/lib/cli-bridge.ts
 *
 * Thin bridge between the VS Code extension and @devory/cli invocation builders.
 * No VS Code API dependency — factoryRoot is injected by the caller.
 *
 * The pure `buildXxx` functions are re-exported for testing.
 * The `spawnInvocation` function wraps Node's `spawn` for actual execution.
 */

import { spawn } from "child_process";
import {
  buildTaskNewInvocation,
  buildTaskMoveInvocation,
  buildRunInvocation,
} from "@devory/cli";

export type { TaskNewArgs, TaskMoveArgs, RunArgs } from "@devory/cli";
export { buildTaskNewInvocation, buildTaskMoveInvocation, buildRunInvocation };

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn a [command, ...args] invocation (from a cli buildInvocation function)
 * in the given factory root directory.
 */
export function spawnInvocation(
  inv: string[],
  factoryRoot: string
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = inv;
    const child = spawn(cmd, rest, { cwd: factoryRoot, shell: true });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on("data", (d: Buffer) => stdout.push(d.toString()));
    child.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));

    child.on("error", (err: Error) => {
      stderr.push(err.message);
      resolve({ stdout: stdout.join(""), stderr: stderr.join(""), exitCode: 1 });
    });

    child.on("close", (code: number | null) => {
      resolve({
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        exitCode: code ?? 0,
      });
    });
  });
}
