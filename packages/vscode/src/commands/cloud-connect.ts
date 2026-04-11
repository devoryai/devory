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
  const exitCode = await spawnCommand(bin, ["cloud", "status"], factoryRoot, (line) => {
    output.appendLine(line);
  });

  output.appendLine("");
  output.appendLine("[Devory] Common paid path:");
  output.appendLine("  1. Sign in to your Devory account");
  output.appendLine("  2. Import a cloud session with `devory cloud login`");
  output.appendLine("  3. Link this repo with `devory cloud link --workspace-id <id>`");
  output.appendLine("");
  output.appendLine("[Devory] Offline enterprise path:");
  output.appendLine("  - Keep using `devory license activate` and your licensed local/container deployment.");
  output.show(true);

  const action = await vscode.window.showInformationMessage(
    exitCode === 0
      ? "Devory cloud status loaded. Open the sign-in page if you want to connect this workspace."
      : "Devory cloud status could not be read cleanly. You can still open the sign-in page or review the output.",
    "Open Sign-In",
    "View Output",
  );

  if (action === "Open Sign-In") {
    const websiteUrl = process.env.NEXT_PUBLIC_DEVORY_WEBSITE_URL ?? "https://devory.ai";
    void vscode.env.openExternal(vscode.Uri.parse(`${websiteUrl}/login`));
  } else if (action === "View Output") {
    output.show(true);
  }
}
