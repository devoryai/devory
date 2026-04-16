/**
 * packages/vscode/src/test/bootstrap.test.ts
 *
 * Unit tests for src/lib/bootstrap.ts.
 * Tests the pure state-management logic (shouldShowBootstrap, markFirstRunComplete)
 * using a fake globalState — no VS Code runtime required.
 *
 * checkAndLogCliReadiness and runBootstrapFlow involve vscode UI and child_process
 * spawn and are covered by manual/integration testing.
 *
 * Run: tsx --test packages/vscode/src/test/bootstrap.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { shouldShowBootstrap, markFirstRunComplete } from "../lib/bootstrap-state.js";

// ---------------------------------------------------------------------------
// Fake globalState (no vscode runtime needed)
// ---------------------------------------------------------------------------

function makeFakeContext(): { globalState: { store: Map<string, unknown>; get<T>(k: string): T | undefined; update(k: string, v: unknown): Promise<void> } } {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      store,
      get<T>(k: string): T | undefined {
        return store.get(k) as T | undefined;
      },
      update(k: string, v: unknown): Promise<void> {
        store.set(k, v);
        return Promise.resolve();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// shouldShowBootstrap
// ---------------------------------------------------------------------------

describe("shouldShowBootstrap", () => {
  let ctx: ReturnType<typeof makeFakeContext>;

  beforeEach(() => {
    ctx = makeFakeContext();
  });

  it("returns true when workspace is not initialized and flag is not set", () => {
    assert.strictEqual(shouldShowBootstrap(ctx, false), true);
  });

  it("returns false when firstRunCompleted is already set", () => {
    ctx.globalState.store.set("devory.firstRunCompleted", true);
    assert.strictEqual(shouldShowBootstrap(ctx, false), false);
  });

  it("returns false when workspace is already initialized", () => {
    assert.strictEqual(shouldShowBootstrap(ctx, true), false);
  });

  it("silently sets firstRunCompleted when workspace is already initialized", () => {
    shouldShowBootstrap(ctx, true);
    // The update is async (void); give microtasks a tick to settle
    // We can check synchronously because our fake update is synchronous
    assert.strictEqual(ctx.globalState.store.get("devory.firstRunCompleted"), true);
  });

  it("does not set firstRunCompleted when workspace is not initialized", () => {
    shouldShowBootstrap(ctx, false);
    assert.strictEqual(ctx.globalState.store.get("devory.firstRunCompleted"), undefined);
  });

  it("returns false for subsequent calls after first-run flag is set", () => {
    // First call with initialized workspace sets the flag
    shouldShowBootstrap(ctx, true);
    // Second call (workspace no longer initialized for some reason) → still false
    assert.strictEqual(shouldShowBootstrap(ctx, false), false);
  });
});

// ---------------------------------------------------------------------------
// markFirstRunComplete
// ---------------------------------------------------------------------------

describe("markFirstRunComplete", () => {
  let ctx: ReturnType<typeof makeFakeContext>;

  beforeEach(() => {
    ctx = makeFakeContext();
  });

  it("sets firstRunCompleted to true in globalState", () => {
    markFirstRunComplete(ctx);
    assert.strictEqual(ctx.globalState.store.get("devory.firstRunCompleted"), true);
  });

  it("is idempotent — calling twice does not throw", () => {
    markFirstRunComplete(ctx);
    markFirstRunComplete(ctx);
    assert.strictEqual(ctx.globalState.store.get("devory.firstRunCompleted"), true);
  });

  it("causes shouldShowBootstrap to return false afterwards", () => {
    markFirstRunComplete(ctx);
    assert.strictEqual(shouldShowBootstrap(ctx, false), false);
  });
});
