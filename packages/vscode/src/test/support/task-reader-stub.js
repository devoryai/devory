import { state } from "./command-test-state.js";

export function listTasksInStage(_tasksDir, stage) {
  return state.taskLists.get(stage) ?? [];
}

export function listAllTasks() {
  return state.allTasks;
}
