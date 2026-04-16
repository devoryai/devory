/**
 * packages/vscode/src/lib/bootstrap-state.ts
 *
 * Pure state-management logic for the first-run bootstrap flow.
 * No vscode or child_process dependency — safe to import in Node unit tests.
 */

// ── Local interface ───────────────────────────────────────────────────────────

/** Minimal subset of vscode.Memento required by the bootstrap state helpers. */
export interface GlobalState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

// ── Persistence key ───────────────────────────────────────────────────────────

const STATE_KEY = "devory.firstRunCompleted";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the bootstrap prompt should be shown.
 *
 * Short-circuits if:
 *  - firstRunCompleted is already set in globalState
 *  - the workspace is already initialized (sets the flag silently and returns false)
 */
export function shouldShowBootstrap(
  context: { globalState: GlobalState },
  workspaceInitialized: boolean
): boolean {
  if (context.globalState.get<boolean>(STATE_KEY)) return false;

  if (workspaceInitialized) {
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
  context: { globalState: GlobalState }
): void {
  void context.globalState.update(STATE_KEY, true);
}
