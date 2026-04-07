import { state } from "./command-test-state.js";

export function runTaskMoveWorkflow(args) {
  state.moveCalls.push(args);
  return state.taskMoveResult;
}
