import { state } from "./command-test-state.js";

export function runTaskPromoteWorkflow(args) {
  state.promoteCalls.push(args);
  return state.taskPromoteResult;
}

export function runTaskRequeueWorkflow(args) {
  state.requeueCalls.push(args);
  return state.taskRequeueResult;
}

export function runTaskReviewWorkflow(args) {
  state.reviewCalls.push(args);
  return state.taskReviewResult;
}
