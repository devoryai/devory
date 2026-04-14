/**
 * packages/vscode/src/test/contributions.test.ts
 *
 * Verifies practical VS Code menu placement for the control surface.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "node:url";

const thisDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(thisDir, "..", "..", "package.json"), "utf-8")
) as {
  contributes?: {
    commands?: Array<{ command: string; title: string }>;
    menus?: Record<string, Array<{ command: string; when?: string; group?: string }>>;
  };
};

function commandsFor(menuId: string): string[] {
  return (packageJson.contributes?.menus?.[menuId] ?? []).map((entry) => entry.command);
}

function whenFor(menuId: string, command: string): string {
  return (
    packageJson.contributes?.menus?.[menuId]?.find((entry) => entry.command === command)?.when ?? ""
  );
}

function contributedCommands(): string[] {
  return (packageJson.contributes?.commands ?? []).map((entry) => entry.command);
}

function commandTitle(commandId: string): string {
  return (
    packageJson.contributes?.commands?.find((entry) => entry.command === commandId)?.title ?? ""
  );
}

describe("VS Code contribution placement", () => {
  test("contributes governance status command", () => {
    const commands = contributedCommands();
    assert.ok(commands.includes("devory.showGovernanceStatus"));
    assert.ok(commands.includes("devory.cloudConnect"));
    assert.ok(commands.includes("devory.showStoredDataLocations"));
    assert.ok(commands.includes("devory.sweepWorkshop"));
  });

  test("keeps generation and visibility terminology consistent", () => {
    assert.equal(commandTitle("devory.generateTasksFromIdea"), "Devory: Generate Tasks from Idea");
    assert.equal(commandTitle("devory.showWork"), "Devory: Show Work");
  });

  test("places cloud connect alongside other factory controls", () => {
    const commands = commandsFor("view/title");
    assert.ok(commands.includes("devory.cloudConnect"));
    assert.match(whenFor("view/title", "devory.cloudConnect"), /view == devoryFactoryExplorer/);
    assert.equal(commands.includes("devory.doctrineCreate"), false);
    assert.equal(commands.includes("devory.skillCreate"), false);
    assert.equal(commands.includes("devory.agentCreate"), false);
  });

  test("keeps run resume out of the task explorer title controls", () => {
    const commands = commandsFor("view/title");
    assert.ok(commands.includes("devory.runStart"));
    assert.ok(commands.includes("devory.runPause"));
    assert.ok(commands.includes("devory.runStop"));
    assert.equal(commands.includes("devory.runResume"), false);
    assert.match(whenFor("view/title", "devory.runPause"), /devory\.runActive/);
    assert.match(whenFor("view/title", "devory.runStop"), /devory\.runActive/);
  });

  test("places primary control actions in the task explorer context menu", () => {
    const commands = commandsFor("view/item/context");

    assert.ok(commands.includes("devory.taskPromote"));
    assert.ok(commands.includes("devory.taskApprove"));
    assert.ok(commands.includes("devory.taskSendBack"));
    assert.ok(commands.includes("devory.taskBlock"));
    assert.ok(commands.includes("devory.taskRequeue"));
    assert.ok(commands.includes("devory.taskArchive"));
    assert.ok(commands.includes("devory.doctrineCreate"));
    assert.ok(commands.includes("devory.skillCreate"));
    assert.ok(commands.includes("devory.doctrineArchive"));
    assert.ok(commands.includes("devory.skillArchive"));
  });

  test("uses stage-aware when clauses for task explorer actions", () => {
    assert.match(whenFor("view/item/context", "devory.taskPromote"), /viewItem == task\.(backlog|ready|doing)/);
    assert.match(whenFor("view/item/context", "devory.taskApprove"), /viewItem == task\.review/);
    assert.match(whenFor("view/item/context", "devory.taskRequeue"), /task\.(blocked|archived)/);
  });

  test("adds practical editor title entry points for task files", () => {
    const commands = commandsFor("editor/title");

    assert.ok(commands.includes("devory.taskPromote"));
    assert.ok(commands.includes("devory.taskApprove"));
    assert.ok(commands.includes("devory.taskRequeue"));
    assert.ok(commands.includes("devory.taskArchive"));
  });
});
