import { state } from "./command-test-state.js";

export function resolveTaskTarget(_tasksDir, target) {
  return state.directTarget ?? target ?? null;
}

export function resolveActiveEditorTask() {
  return state.activeEditorTask;
}
