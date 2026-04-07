import { state } from "./command-test-state.js";

export async function startFactoryRun(factoryRoot, runtimeRoot, args) {
  state.runStartCalls.push({ factoryRoot, runtimeRoot, args });
  return state.runStartResult;
}
