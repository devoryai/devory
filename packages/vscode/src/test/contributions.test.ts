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

describe("VS Code contribution placement", () => {
  test("places primary control actions in the task explorer context menu", () => {
    const commands = commandsFor("view/item/context");

    assert.ok(commands.includes("devory.taskPromote"));
    assert.ok(commands.includes("devory.taskApprove"));
    assert.ok(commands.includes("devory.taskSendBack"));
    assert.ok(commands.includes("devory.taskBlock"));
    assert.ok(commands.includes("devory.taskRequeue"));
  });

  test("uses stage-aware when clauses for task explorer actions", () => {
    assert.match(whenFor("view/item/context", "devory.taskPromote"), /viewItem == task\.(backlog|ready|doing)/);
    assert.match(whenFor("view/item/context", "devory.taskApprove"), /viewItem == task\.review/);
    assert.match(whenFor("view/item/context", "devory.taskRequeue"), /viewItem == task\.blocked/);
  });

  test("adds practical editor title entry points for task files", () => {
    const commands = commandsFor("editor/title");

    assert.ok(commands.includes("devory.taskPromote"));
    assert.ok(commands.includes("devory.taskApprove"));
    assert.ok(commands.includes("devory.taskRequeue"));
  });
});
