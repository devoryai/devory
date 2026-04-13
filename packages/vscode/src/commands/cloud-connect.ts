import * as vscode from "vscode";
import * as path from "path";
import { spawn } from "child_process";
import { findDevoryCli } from "../lib/find-devory-cli.js";
import { buildCliSpawnEnv } from "../lib/cli-spawn-env.js";

function spawnCommand(
  bin: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: buildCliSpawnEnv(cwd, bin),
      shell: false,
    });

    let buffer = "";
    const flush = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    };

    child.stdout.on("data", (chunk: Buffer) => flush(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => flush(chunk.toString()));
    child.on("close", (code) => {
      if (buffer) onLine(buffer);
      resolve(code ?? 1);
    });
    child.on("error", (err) => {
      onLine(`ERROR: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * Runs `devory cloud login`, parses the approve URL from stdout, opens it in
 * the browser, then waits for the CLI process to complete.
 */
function spawnLoginAndOpenUrl(
  bin: string,
  cwd: string,
  output: vscode.OutputChannel,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["cloud", "login"], {
      cwd,
      env: buildCliSpawnEnv(cwd, bin),
      shell: false,
    });

    let buffer = "";
    let urlOpened = false;

    const handleLine = (line: string) => {
      output.appendLine(line);

      // The CLI prints the approve URL on the line immediately after
      // "Open this URL in your browser:"
      if (!urlOpened && line.trim().startsWith("https://")) {
        const url = line.trim();
        urlOpened = true;
        void vscode.env.openExternal(vscode.Uri.parse(url));
      }
    };

    const flush = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    };

    child.stdout.on("data", (chunk: Buffer) => flush(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => flush(chunk.toString()));
    child.on("close", (code) => {
      if (buffer) handleLine(buffer);
      resolve(code ?? 1);
    });
    child.on("error", (err) => {
      handleLine(`ERROR: ${err.message}`);
      resolve(1);
    });
  });
}

export async function cloudConnectCommand(
  factoryRoot: string,
  output: vscode.OutputChannel,
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings.",
    );
    return;
  }

  output.clear();
  output.appendLine("[Devory] Cloud connect");
  output.appendLine(`[Devory] Workspace: ${factoryRoot}`);

  let bin: string;
  try {
    bin = await findDevoryCli(factoryRoot);
  } catch {
    output.appendLine("[Devory] ERROR: devory CLI not found.");
    output.show(true);
    vscode.window.showErrorMessage(
      "Devory Cloud Connect: CLI not found. Install `@devory/cli` or add it to your workspace.",
    );
    return;
  }

  output.appendLine(`[Devory] CLI: ${bin}`);
  output.appendLine("");
  output.appendLine(`=== ${path.basename(bin)} cloud status ===`);
  const statusCode = await spawnCommand(bin, ["cloud", "status"], factoryRoot, (line) => {
    output.appendLine(line);
  });

  output.appendLine("");
  output.show(true);

  const action = await vscode.window.showInformationMessage(
    statusCode === 0
      ? "Devory cloud status loaded. Start the browser sign-in to connect this workspace."
      : "Could not read cloud status. You can still start the browser sign-in.",
    "Connect Cloud Account",
    "View Output",
  );

  if (action !== "Connect Cloud Account") return;

  output.appendLine("=== devory cloud login ===");
  output.appendLine("[Devory] Starting browser sign-in. Opening approval page…");
  output.show(true);

  const loginCode = await spawnLoginAndOpenUrl(bin, factoryRoot, output);

  if (loginCode === 0) {
    output.appendLine("");
    output.appendLine("[Devory] Cloud login complete.");
    void vscode.window.showInformationMessage("Devory: Cloud account connected.");
  } else {
    output.appendLine("");
    output.appendLine("[Devory] Cloud login did not complete. See output for details.");
    output.show(true);
  }
}
