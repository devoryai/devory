import { beforeEach, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  FIRST_RUN_STATE_KEY,
  collectStoredDataLocations,
  formatClassification,
  getSweepSummaryBytes,
  getSweepableLocations,
  sweepStoredData,
  type MementoLike,
} from "../lib/stored-data.js";

function makeMemento(): MementoLike & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    update(key: string, value: unknown): Promise<void> {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
      return Promise.resolve();
    },
  };
}

describe("stored data inventory", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-stored-data-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("classifies extension-owned storage separately from project data", async () => {
    const factoryRoot = path.join(tempRoot, "workspace");
    const globalStorage = path.join(tempRoot, "global-storage");
    const workspaceStorage = path.join(tempRoot, "workspace-storage");
    const logs = path.join(tempRoot, "logs");

    fs.mkdirSync(path.join(factoryRoot, "tasks"), { recursive: true });
    fs.mkdirSync(path.join(factoryRoot, "runs"), { recursive: true });
    fs.mkdirSync(globalStorage, { recursive: true });
    fs.mkdirSync(workspaceStorage, { recursive: true });
    fs.mkdirSync(logs, { recursive: true });
    fs.writeFileSync(path.join(globalStorage, "cache.json"), "cache", "utf-8");
    fs.writeFileSync(path.join(factoryRoot, "FACTORY_CONTEXT.md"), "# Context\n", "utf-8");

    const globalState = makeMemento();
    globalState.store.set(FIRST_RUN_STATE_KEY, true);

    const locations = await collectStoredDataLocations(
      {
        globalState,
        globalStorageUri: { fsPath: globalStorage },
        storageUri: { fsPath: workspaceStorage },
        logUri: { fsPath: logs },
      },
      factoryRoot,
    );

    assert.ok(
      locations.some(
        (location) =>
          location.label === "Extension global storage" &&
          location.classification === "SAFE_TO_DELETE",
      ),
    );
    assert.ok(
      locations.some(
        (location) =>
          location.label === "tasks" &&
          location.classification === "PROJECT_DATA",
      ),
    );
    assert.ok(
      locations.some(
        (location) =>
          location.label === "Configured factory root setting" &&
          location.classification === "UNKNOWN",
      ),
    );
  });

  test("sweep only removes safe extension-owned data", async () => {
    const factoryRoot = path.join(tempRoot, "workspace");
    const globalStorage = path.join(tempRoot, "global-storage");
    const projectTasks = path.join(factoryRoot, "tasks");

    fs.mkdirSync(globalStorage, { recursive: true });
    fs.mkdirSync(projectTasks, { recursive: true });
    fs.writeFileSync(path.join(globalStorage, "cache.json"), "cache", "utf-8");
    fs.writeFileSync(path.join(projectTasks, "factory-001.md"), "# task\n", "utf-8");

    const globalState = makeMemento();
    globalState.store.set(FIRST_RUN_STATE_KEY, true);

    const locations = await collectStoredDataLocations(
      {
        globalState,
        globalStorageUri: { fsPath: globalStorage },
      },
      factoryRoot,
    );

    const sweepable = getSweepableLocations(locations).filter(
      (location) => location.exists || location.id === "global-state:first-run",
    );

    assert.ok(getSweepSummaryBytes(sweepable) > 0);

    await sweepStoredData(
      {
        globalState,
        globalStorageUri: { fsPath: globalStorage },
      },
      sweepable,
    );

    assert.equal(fs.existsSync(globalStorage), false);
    assert.equal(fs.existsSync(projectTasks), true);
    assert.equal(globalState.get(FIRST_RUN_STATE_KEY), undefined);
  });

  test("formats labels exactly as shown in the UI", () => {
    assert.equal(formatClassification("SAFE_TO_DELETE"), "SAFE TO DELETE");
    assert.equal(
      formatClassification("PROJECT_DATA"),
      "PROJECT DATA — DO NOT DELETE",
    );
    assert.equal(
      formatClassification("UNKNOWN"),
      "UNKNOWN / NOT CLEARED BY THIS TOOL",
    );
  });
});
