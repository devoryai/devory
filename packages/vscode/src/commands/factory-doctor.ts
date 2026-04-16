/**
 * packages/vscode/src/commands/factory-doctor.ts
 *
 * devory.factoryDoctor — runs `devory doctor` and `devory governance doctor`
 * and streams output to the Devory output channel.
 * Finds the devory CLI binary via findDevoryCli (local → monorepo walk-up → PATH).
 */

import * as vscode from "vscode";
import * as path from "path";
import { spawn } from "child_process";
import {
  buildProviderDoctorSnapshot,
  buildProviderTargetRegistry,
  buildRegistryFromEnvironment,
  detectTargetReadiness,
  probeOllamaReadiness,
  resolveRoutingPolicy,
} from "@devory/core";
import { findDevoryCli } from "../lib/find-devory-cli.js";
import { buildCliSpawnEnv } from "../lib/cli-spawn-env.js";
import { renderProviderReadinessLines } from "../lib/provider-readiness-output.js";

interface SpawnResult {
  exitCode: number;
  signal: string | null;
  hasOutput: boolean;
}

function spawnCommand(
  bin: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: buildCliSpawnEnv(cwd, bin),
      shell: false,
    });

    let buffer = "";
    let hasOutput = false;
    const flush = (chunk: string) => {
      hasOutput = true;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    };

    child.stdout.on("data", (chunk: Buffer) => flush(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => flush(chunk.toString()));
    child.on("close", (code, signal) => {
      if (buffer) onLine(buffer);
      resolve({ exitCode: code ?? 1, signal: signal ?? null, hasOutput });
    });
    child.on("error", (err) => {
      onLine(`ERROR: ${err.message}`);
      resolve({ exitCode: 1, signal: null, hasOutput });
    });
  });
}

export async function factoryDoctorCommand(
  factoryRoot: string,
  doctorOutput: vscode.OutputChannel
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  doctorOutput.clear();
  doctorOutput.appendLine("[Devory] Starting doctor diagnostics…");
  doctorOutput.appendLine(`[Devory] Workspace: ${factoryRoot}`);
  doctorOutput.appendLine("[Devory] Resolving CLI (local node_modules → monorepo walk-up → PATH)…");

  try {
    const env = process.env as Record<string, string | undefined>;
    const { policy } = resolveRoutingPolicy(factoryRoot);
    const initialRegistry = buildRegistryFromEnvironment(
      env,
      policy ? policy.cloud_allowed && !policy.local_only : true
    );
    const initialTargetRegistry = buildProviderTargetRegistry({
      policy,
      provider_registry: initialRegistry,
      env,
    });
    const ollamaProbe = await probeOllamaReadiness({
      env,
      timeout_ms: 1200,
    });
    const readiness = detectTargetReadiness({
      env,
      policy,
      target_ids: initialTargetRegistry.map((entry) => entry.id),
      configured_target_ids: initialTargetRegistry
        .filter((entry) => entry.configured)
        .map((entry) => entry.id),
      ollama_probe: ollamaProbe,
    });
    const registry = buildRegistryFromEnvironment(
      env,
      policy ? policy.cloud_allowed && !policy.local_only : true,
      readiness
    );
    const targetRegistry = buildProviderTargetRegistry({
      policy,
      provider_registry: registry,
      env,
      readiness,
    });
    const snapshot = buildProviderDoctorSnapshot({
      env,
      policy,
      readiness,
      target_registry: targetRegistry,
      ollama_probe: ollamaProbe,
    });
    for (const line of renderProviderReadinessLines(snapshot)) {
      doctorOutput.appendLine(`[Devory] ${line}`);
    }
    doctorOutput.appendLine("");
  } catch (error) {
    doctorOutput.appendLine(
      `[Devory] Provider readiness precheck failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    doctorOutput.appendLine("");
  }

  let bin: string;
  try {
    bin = await findDevoryCli(factoryRoot);
  } catch {
    doctorOutput.appendLine(
      "[Devory] ERROR: devory CLI not found. " +
        "Install it globally if you want, add it to your project dependencies, or use the built-in workspace setup where available."
    );
    doctorOutput.show(true);
    vscode.window.showErrorMessage(
      "Devory Doctor: CLI not found. Install `@devory/cli`, add it to your project, or use built-in setup where supported."
    );
    return;
  }

  const binName = path.basename(bin);

  doctorOutput.appendLine(`[Devory] CLI: ${bin}`);
  doctorOutput.show(true);

  const onLine = (line: string) => doctorOutput.appendLine(line);

  doctorOutput.appendLine("");
  doctorOutput.appendLine(`=== ${binName} doctor ===`);
  doctorOutput.appendLine(`[Devory] Running: ${binName} doctor`);
  const result1 = await spawnCommand(bin, ["doctor"], factoryRoot, onLine);
  if (result1.signal) {
    doctorOutput.appendLine(`[Devory] Process killed by signal ${result1.signal}.`);
  } else {
    doctorOutput.appendLine(`[Devory] Exited with code ${result1.exitCode}.`);
  }
  if (!result1.hasOutput) {
    doctorOutput.appendLine("[Devory] No output received from doctor command.");
  }

  doctorOutput.appendLine("");
  doctorOutput.appendLine(`=== ${binName} governance doctor ===`);
  doctorOutput.appendLine(`[Devory] Running: ${binName} governance doctor`);
  const result2 = await spawnCommand(bin, ["governance", "doctor"], factoryRoot, onLine);
  if (result2.signal) {
    doctorOutput.appendLine(`[Devory] Process killed by signal ${result2.signal}.`);
  } else {
    doctorOutput.appendLine(`[Devory] Exited with code ${result2.exitCode}.`);
  }
  if (!result2.hasOutput) {
    doctorOutput.appendLine("[Devory] No output received from governance doctor command.");
  }

  doctorOutput.appendLine("");
  doctorOutput.appendLine(
    result1.exitCode === 0 && result2.exitCode === 0
      ? "[Devory] All checks passed."
      : `[Devory] One or more checks failed (doctor=${result1.exitCode}, governance=${result2.exitCode}).`
  );
}
