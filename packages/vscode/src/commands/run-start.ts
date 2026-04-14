/**
 * packages/vscode/src/commands/run-start.ts
 *
 * devory.runStart — configure and start a factory run via the packaged
 * local runtime adapter.
 */

import * as fs from "fs";
import * as vscode from "vscode";
import { estimateDryRunForTaskSources, parseFrontmatter } from "@devory/core";
import type { ManagedRunState, RunController } from "../lib/run-controller.js";
import { listTasksInStage } from "../lib/task-reader.js";

export async function runStartCommand(
  factoryRoot: string,
  tasksDir: string,
  runtimeRoot: string,
  runOutput: vscode.OutputChannel,
  controller: RunController,
  onStateChange: (state: ManagedRunState) => void,
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const readyTasks = listTasksInStage(tasksDir, "ready");
  const estimate = estimateDryRunForTaskSources(
    readyTasks.slice(0, 8).map((task) => {
      try {
        const content = fs.readFileSync(task.filepath, "utf-8");
        const parsed = parseFrontmatter(content);
        return { meta: parsed.meta, body: parsed.body };
      } catch {
        return {};
      }
    }),
    {
      fallback_runner: "local-packaged-runner",
    }
  );
  const estimateCost = `$${estimate.estimated_cost_usd.min.toFixed(2)} - $${estimate.estimated_cost_usd.max.toFixed(2)}`;
  const estimateParts = [
    `Dry Run Estimate: ${estimate.runner}/${estimate.model_display_name}`,
    `context ${estimate.context_tier}`,
    `output ${estimate.output_tier}`,
    `cost estimate ${estimateCost}`,
    `${estimate.confidence} confidence`,
  ];
  if (estimate.model_id === null) {
    estimateParts.push("fallback pricing model");
  }
  if (estimate.confidence === "low") {
    estimateParts.push("metadata incomplete");
  }
  const estimateDetail = `${estimateParts.join(" · ")}.`;
  runOutput.appendLine(`[Devory] ${estimateDetail}`);

  if (readyTasks.length > 0) {
    void vscode.window.showInformationMessage(`${estimateDetail} Estimate only; execution is not blocked.`);
  } else {
    void vscode.window.showInformationMessage(
      `${estimateDetail} No ready tasks found right now; starting a run may complete with no runnable work.`
    );
  }

  // Ask for optional limit
  const limitStr = await vscode.window.showInputBox({
    title: "Devory: Start Factory Run",
    prompt: "Max tasks to run (leave blank for no limit)",
    placeHolder: "e.g. 3",
    validateInput: (v) => {
      if (!v.trim()) return null;
      const n = Number(v);
      return isNaN(n) || n < 1 ? "Enter a positive integer or leave blank" : null;
    },
  });
  if (limitStr === undefined) return; // user cancelled

  const limit = limitStr.trim() ? Number(limitStr.trim()) : undefined;

  runOutput.clear();
  runOutput.appendLine(`[Devory] Starting factory run${limit !== undefined ? ` (limit: ${limit})` : ""}…`);
  runOutput.show(true);

  const started = await controller.start(factoryRoot, runtimeRoot, { limit }, {
    onOutput: (chunk) => runOutput.append(chunk),
    onStateChange,
    onExit: (result) => {
      if (controller.getState() === "paused") {
        vscode.window.showInformationMessage(
          "Devory: factory run paused at a safe checkpoint. Use Play to resume.",
        );
        return;
      }
      const noOutput = result.stdout.length === 0 && result.stderr.length === 0;
      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Devory: factory run failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`,
        );
        return;
      }
      if (noOutput) {
        runOutput.append("[Devory] No output received — no ready tasks detected.\n");
      }
      vscode.window.showInformationMessage(
        "Devory: factory run completed. Use Devory: Inspect Recent Runs to review the result.",
      );
    },
  });

  if (!started.started) {
    vscode.window.showInformationMessage(`Devory: ${started.reason}`);
  }
}
