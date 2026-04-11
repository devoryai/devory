import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import {
  clearLocalRunControl,
  readLocalRunControl,
  updateLocalRunControl,
} from "@devory/core";
import {
  resolvePackagedRunInvocation,
  type RunStartArgs,
  type RunRuntimeInvocation,
} from "./run-adapter.js";

export type ManagedRunState = "idle" | "running" | "paused";

export interface ManagedRunHooks {
  onOutput?: (chunk: string) => void;
  onStateChange?: (state: ManagedRunState) => void;
  onExit?: (result: { exitCode: number; signal: string | null; stdout: string; stderr: string }) => void;
}

type SpawnedChild = Pick<
  ChildProcessWithoutNullStreams,
  "stdout" | "stderr" | "on" | "kill"
>;

export type SpawnRunProcess = (invocation: RunRuntimeInvocation) => SpawnedChild;

function defaultSpawn(invocation: RunRuntimeInvocation): SpawnedChild {
  return spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    shell: process.platform === "win32",
  });
}

export class RunController {
  private child: SpawnedChild | null = null;
  private state: ManagedRunState = "idle";
  private stdout = "";
  private stderr = "";
  private factoryRoot: string | null = null;
  private runtimeRoot: string | null = null;
  private pausedRunId: string | null = null;
  private activeRunId: string | null = null;

  constructor(private readonly spawnProcess: SpawnRunProcess = defaultSpawn) {}

  getState(): ManagedRunState {
    return this.state;
  }

  isActive(): boolean {
    return this.state === "running";
  }

  canPause(): boolean {
    return this.state === "running";
  }

  canResume(): boolean {
    return this.state === "paused" && this.pausedRunId !== null;
  }

  async start(
    factoryRoot: string,
    runtimeRoot: string,
    args: RunStartArgs,
    hooks: ManagedRunHooks = {},
  ): Promise<{ started: true } | { started: false; reason: string }> {
    if (this.isActive()) {
      return { started: false, reason: "A factory run is already active." };
    }

    clearLocalRunControl(factoryRoot);
    this.factoryRoot = factoryRoot;
    this.runtimeRoot = runtimeRoot;
    this.activeRunId = null;
    this.pausedRunId = null;
    this.stdout = "";
    this.stderr = "";
    const invocation = resolvePackagedRunInvocation(factoryRoot, runtimeRoot, args);
    hooks.onOutput?.(`[Devory] Workspace: ${factoryRoot}\n`);
    hooks.onOutput?.(`[Devory] Runner: ${[process.execPath.split(/[\\/]/).pop(), ...invocation.args.map((value) => value.split(/[\\/]/).pop() ?? value)].join(" ")}\n`);

    const child = this.spawnProcess(invocation);
    this.child = child;
    this.setState("running", hooks);

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      this.stdout += text;
      this.captureRunId(factoryRoot, text);
      hooks.onOutput?.(text);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      this.stderr += text;
      hooks.onOutput?.(text);
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      hooks.onOutput?.(
        signal
          ? `[Devory] Process killed by signal ${signal}.\n`
          : `[Devory] Exited with code ${code ?? 1}.\n`,
      );
      const result = {
        exitCode: code ?? 1,
        signal: signal ?? null,
        stdout: this.stdout,
        stderr: this.stderr,
      };
      const controlState = this.factoryRoot ? readLocalRunControl(this.factoryRoot) : null;
      const pausedByOperator =
        controlState?.acknowledged_action === "pause" && controlState.run_id !== null;
      this.child = null;
      this.activeRunId = null;
      if (pausedByOperator) {
        this.pausedRunId = controlState?.run_id ?? null;
        this.setState("paused", hooks);
      } else {
        this.pausedRunId = null;
        this.setState("idle", hooks);
      }
      hooks.onExit?.(result);
    });
    child.on("error", (error: Error) => {
      this.stderr += `${error.message}\n`;
      hooks.onOutput?.(`[Devory] Run failed unexpectedly: ${error.message}\n`);
    });

    return { started: true };
  }

  pause(hooks: ManagedRunHooks = {}): { ok: true } | { ok: false; reason: string } {
    if (!this.child || this.state !== "running") {
      return { ok: false, reason: "No running factory run is active." };
    }
    if (!this.factoryRoot) {
      return { ok: false, reason: "Factory root is not available for the active run." };
    }
    updateLocalRunControl(this.factoryRoot, (current) => ({
      run_id: current?.run_id ?? this.activeRunId,
      requested_action: "pause",
      acknowledged_action: null,
    }));
    hooks.onOutput?.("[Devory] Pause requested. The run will pause at the next safe checkpoint.\n");
    return { ok: true };
  }

  async resume(hooks: ManagedRunHooks = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.state !== "paused" || !this.pausedRunId) {
      return { ok: false, reason: "No paused factory run is available to resume." };
    }
    if (!this.factoryRoot || !this.runtimeRoot) {
      return { ok: false, reason: "Factory runtime is not available for resume." };
    }
    const runId = this.pausedRunId;
    const started = await this.start(this.factoryRoot, this.runtimeRoot, { resumeId: runId }, hooks);
    if (!started.started) {
      return { ok: false, reason: started.reason };
    }
    hooks.onOutput?.(`[Devory] Resuming run ${runId}.\n`);
    return { ok: true };
  }

  stop(hooks: ManagedRunHooks = {}): { ok: true } | { ok: false; reason: string } {
    if (!this.child || !this.isActive()) {
      return { ok: false, reason: "No active factory run is available to stop." };
    }
    if (!this.factoryRoot) {
      return { ok: false, reason: "Factory root is not available for the active run." };
    }
    updateLocalRunControl(this.factoryRoot, (current) => ({
      run_id: current?.run_id ?? this.activeRunId,
      requested_action: "stop",
      acknowledged_action: null,
    }));
    hooks.onOutput?.("[Devory] Stop requested. The run will stop at the next safe checkpoint.\n");
    return { ok: true };
  }

  private captureRunId(factoryRoot: string, text: string): void {
    const match = text.match(/\[orchestrator\] (?:Created run|Resuming run): ([^\s]+)/);
    if (!match) {
      return;
    }
    const runId = match[1] ?? null;
    if (!runId) {
      return;
    }
    this.activeRunId = runId;
    updateLocalRunControl(factoryRoot, (current) => ({
      run_id: runId,
      requested_action: current?.requested_action ?? null,
      acknowledged_action: current?.acknowledged_action ?? null,
    }));
  }

  private setState(state: ManagedRunState, hooks: ManagedRunHooks): void {
    this.state = state;
    hooks.onStateChange?.(state);
  }
}
