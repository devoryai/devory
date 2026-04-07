import { state } from "./command-test-state.js";

export async function runTaskCreateWorkflow(args) {
  state.createCalls.push(args);
  return state.taskCreateResult;
}
