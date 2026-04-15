import * as path from "node:path";
import { getFactoryPaths } from "../config.js";
import { readGovernanceStatus } from "./governance-status.js";

export function resolveTaskMutationRoot(factoryRoot: string): string {
  const snapshot = readGovernanceStatus(factoryRoot);
  if (snapshot.governanceModeOn && snapshot.governanceRepoPath) {
    return snapshot.governanceRepoPath;
  }
  return factoryRoot;
}

export function resolveTasksDir(factoryRoot: string): string {
  return path.join(resolveTaskMutationRoot(factoryRoot), "tasks");
}
