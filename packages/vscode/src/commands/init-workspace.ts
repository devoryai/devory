import * as vscode from "vscode";
import { spawn } from "child_process";
import { findDevoryCli } from "../lib/find-devory-cli.js";
import { buildCliSpawnEnv } from "../lib/cli-spawn-env.js";
import { seedStarterFiles } from "../lib/seed-starter.js";
export { runBuiltinInit } from "./init-workspace-core.js";

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function initWorkspaceCommand(
  outputChannel: vscode.OutputChannel,
  refreshTaskTree: () => void,
  refreshRunTree: () => void,
  runtimeRoot?: string
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "Devory: No workspace folder is open. Please open a folder first."
    );
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;

  outputChannel.show(true);
  outputChannel.appendLine("─".repeat(60));
  outputChannel.appendLine("Devory: Initializing workspace…");
  outputChannel.appendLine(`  cwd : ${cwd}`);

  // Try to find the devory CLI — local node_modules, monorepo walk-up, then PATH.
  let cliBin: string | null = null;
  try {
    cliBin = await findDevoryCli(cwd);
    outputChannel.appendLine(`  bin : ${cliBin} (CLI found)`);
  } catch {
    outputChannel.appendLine(
      "  bin : not found — local node_modules/.bin/devory not present, " +
        "no global devory on PATH; using built-in init"
    );
  }

  outputChannel.appendLine("─".repeat(60));

  if (cliBin) {
    // Use the CLI binary (existing behavior).
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cliBin!, ["init"], {
        cwd,
        shell: false,
        env: buildCliSpawnEnv(cwd, cliBin!),
      });

      child.stdout.on("data", (chunk: Buffer) => {
        outputChannel.append(chunk.toString());
      });

      child.stderr.on("data", (chunk: Buffer) => {
        outputChannel.append(chunk.toString());
      });

      child.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          vscode.window.showErrorMessage(
            `Devory: CLI binary not executable at ${cliBin}. ` +
              "Try reinstalling it, using a local project dependency, or using the built-in workspace setup."
          );
        } else {
          vscode.window.showErrorMessage(`Devory: init failed — ${err.message}`);
        }
        reject(err);
      });

      child.on("close", (code) => {
        if (code === 0) {
          outputChannel.appendLine("─".repeat(60));
          outputChannel.appendLine("Devory: Workspace initialized successfully.");
          resolve();
        } else {
          outputChannel.appendLine("─".repeat(60));
          outputChannel.appendLine(`Devory: init exited with code ${code}.`);
          vscode.window.showErrorMessage(
            `Devory: init exited with code ${code}. Check the Devory output channel for details.`
          );
          reject(new Error(`devory init exited with code ${code}`));
        }
      });
    })
      .then(() => finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree))
      .catch(() => {
        // Errors already surfaced via showErrorMessage above.
      });
  } else {
    // Built-in init: no CLI required.
    try {
      runBuiltinInit(cwd, outputChannel);
      outputChannel.appendLine("─".repeat(60));
      outputChannel.appendLine("Devory: Workspace initialized successfully (built-in).");
      finalize(cwd, runtimeRoot, outputChannel, refreshTaskTree, refreshRunTree);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`ERROR: ${msg}`);
      outputChannel.appendLine("─".repeat(60));
      vscode.window.showErrorMessage(`Devory: init failed — ${msg}`);
    }
  }
}

function finalize(
  cwd: string,
  runtimeRoot: string | undefined,
  outputChannel: vscode.OutputChannel,
  refreshTaskTree: () => void,
  refreshRunTree: () => void
): void {
  let seededSummary:
    | {
        doctrine: string[];
        skills: string[];
      }
    | null = null;
  if (runtimeRoot) {
    seededSummary = seedStarterFiles(cwd, runtimeRoot, outputChannel);
  }
  refreshTaskTree();
  refreshRunTree();
  const seededSuffix =
    seededSummary && (seededSummary.doctrine.length > 0 || seededSummary.skills.length > 0)
      ? ` Starter doctrine: ${seededSummary.doctrine.slice(0, 2).join(", ")}. Starter skills: ${seededSummary.skills.slice(0, 2).join(", ")}. Open Devory: Governance to inspect them.`
      : "";
  vscode.window.showInformationMessage(
    `Devory: Workspace initialized. Tasks and run folders are ready.${seededSuffix}`
  );
}
