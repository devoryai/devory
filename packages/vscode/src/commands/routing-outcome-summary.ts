import * as path from "path";
import * as vscode from "vscode";
import { EXECUTION_OUTCOME_ARTIFACT } from "../lib/execution-outcome.js";
import {
  readExecutionOutcomeLedger,
  renderExecutionOutcomeSummary,
  summarizeExecutionOutcomes,
} from "../lib/execution-outcome-summary.js";

export async function routingOutcomeSummaryCommand(
  factoryRoot: string,
  output: vscode.OutputChannel
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  const quickPick = await vscode.window.showQuickPick(
    [
      { label: "Last 50 records", value: 50 },
      { label: "Last 25 records", value: 25 },
      { label: "Last 100 records", value: 100 },
      { label: "All records", value: 0 },
    ],
    {
      title: "Devory: Show Routing Outcome Summary",
      placeHolder: "Choose how many recent outcome records to summarize",
    }
  );

  if (!quickPick) {
    return;
  }

  const artifactPath = path.join(factoryRoot, EXECUTION_OUTCOME_ARTIFACT);
  const ledger = readExecutionOutcomeLedger(artifactPath);
  const options = quickPick.value > 0 ? { last_n: quickPick.value } : {};
  const summary = summarizeExecutionOutcomes(
    ledger.records,
    ledger.malformed_lines,
    options
  );

  if (summary.total_records === 0) {
    vscode.window.showInformationMessage(
      "Devory: no routing outcome records found for the selected summary."
    );
    return;
  }

  output.clear();
  output.appendLine(renderExecutionOutcomeSummary(summary, options));
  output.show(true);

  void vscode.window.showInformationMessage(
    `Devory: summarized ${summary.total_records} routing outcome record(s).`
  );
}
