/**
 * packages/vscode/src/lib/bootstrap.ts
 *
 * First-run bootstrap utilities.
 *
 * Detects whether Devory has been set up in the current workspace and,
 * if not, guides the user through a lightweight onboarding flow.
 * No webview required — uses VS Code notifications + the init output channel.
 */

import * as vscode from "vscode";
import * as cp from "child_process";
import { findDevoryCli } from "./find-devory-cli.js";

// ── Persistence keys ────────────────────────────────────────────────────────

/**
 * Stored in globalState once the user has successfully initialized a workspace
 * (or if a workspace was already initialized when the extension first activated).
 * Once set, the bootstrap prompt is permanently suppressed.
 */
const STATE_KEY = "devory.firstRunCompleted";

// ── State helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if the bootstrap prompt should be shown.
 *
 * Short-circuits if:
 *  - firstRunCompleted is already set in globalState
 *  - the workspace is already initialized (sets the flag silently and returns false)
 */
export function shouldShowBootstrap(
  context: Pick<vscode.ExtensionContext, "globalState">,
  workspaceInitialized: boolean
): boolean {
  if (context.globalState.get<boolean>(STATE_KEY)) return false;

  if (workspaceInitialized) {
    // Workspace was set up before we started tracking — mark complete silently.
    void context.globalState.update(STATE_KEY, true);
    return false;
  }

  return true;
}

/**
 * Marks the first-run flow as complete.
 * Call this after workspace initialization succeeds.
 */
export function markFirstRunComplete(
  context: Pick<vscode.ExtensionContext, "globalState">
): void {
  void context.globalState.update(STATE_KEY, true);
}

// ── CLI readiness check ──────────────────────────────────────────────────────

export interface CliReadiness {
  /** Absolute path to the CLI, or null if not found. */
  cliPath: string | null;
  /** Version string reported by `devory --version`, or null. */
  cliVersion: string | null;
}

/**
 * Checks for the devory CLI and logs detailed results to the output channel.
 * Never throws — all errors are caught and logged.
 */
export async function checkAndLogCliReadiness(
  cwd: string,
  output: vscode.OutputChannel
): Promise<CliReadiness> {
  output.appendLine("[Devory] Checking environment…");
  output.appendLine(`[Devory]   Workspace : ${cwd}`);
  output.appendLine(
    "[Devory] Checking CLI locations (local node_modules → monorepo walk-up → PATH)…"
  );

  let cliPath: string | null = null;
  let cliVersion: string | null = null;

  try {
    cliPath = await findDevoryCli(cwd);
  } catch {
    // Not found by any means
  }

  if (cliPath) {
    output.appendLine(`[Devory]   Found CLI at : ${cliPath}`);
    cliVersion = await probeCliVersion(cliPath);
    if (cliVersion) {
      output.appendLine(`[Devory]   CLI verified : version ${cliVersion}`);
    } else {
      output.appendLine(
        "[Devory]   CLI found but --version probe failed — will proceed anyway"
      );
    }
    output.appendLine("[Devory] Environment ready.");
  } else {
    output.appendLine(
      "[Devory]   CLI not found in local node_modules, monorepo parents, or PATH"
    );
    output.appendLine(
      "[Devory]   Built-in initialization will be used — no manual install required"
    );
  }

  return { cliPath, cliVersion };
}

/**
 * Runs `devory --version` and returns the first line of output, or null on failure.
 * Times out after 5 seconds.
 */
function probeCliVersion(cliPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: string | null): void => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    const child = cp.spawn(cliPath, ["--version"], {
      shell: false,
      env: { ...process.env },
    });

    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
    });
    child.on("close", () => {
      finish(buf.trim().split("\n")[0].trim() || null);
    });
    child.on("error", () => finish(null));

    // Hard timeout so we never block the bootstrap flow
    setTimeout(() => {
      finish(null);
      try {
        child.kill();
      } catch {
        // Already exited
      }
    }, 5000);
  });
}

// ── Bootstrap flow ───────────────────────────────────────────────────────────

/**
 * Shows the first-run bootstrap prompt.
 *
 * Flow:
 *  1. Runs the CLI/environment check and populates the output channel.
 *  2. Shows a VS Code notification with action buttons.
 *  3. If the user chooses "Initialize Workspace", calls `runInit`.
 *     Completion of `runInit` should call `markFirstRunComplete` so the
 *     prompt does not appear again.
 *  4. "Show Setup Log" opens the output channel so the user can see what
 *     was found.
 *  5. Dismissing the notification (or waiting until it times out) does
 *     nothing — the prompt will appear again next session.
 */
export async function runBootstrapFlow(
  context: Pick<vscode.ExtensionContext, "globalState">,
  cwd: string,
  output: vscode.OutputChannel,
  runInit: () => Promise<void>
): Promise<void> {
  // Populate the output channel before showing the notification so the user
  // sees meaningful content if they open the log.
  await checkAndLogCliReadiness(cwd, output);

  const action = await vscode.window.showInformationMessage(
    "Welcome to Devory! Your workspace isn't set up yet.",
    "Initialize Workspace",
    "Show Setup Log"
  );

  if (action === "Initialize Workspace") {
    output.show(true);
    await runInit();
    // markFirstRunComplete is called by the init success callback in extension.ts
  } else if (action === "Show Setup Log") {
    output.show(true);
    // Give the user a moment to read the log, then re-offer the action
    const followUp = await vscode.window.showInformationMessage(
      "Ready to initialize your Devory workspace?",
      "Initialize Workspace"
    );
    if (followUp === "Initialize Workspace") {
      await runInit();
    }
  }
  // Dismissed: no-op — prompt reappears next session until init succeeds
}
