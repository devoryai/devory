import * as path from "node:path";
import { getFactoryPaths } from "../config.js";
import { readGovernanceStatus } from "./governance-status.js";

export function resolveTasksDir(factoryRoot: string): string {
  const snapshot = readGovernanceStatus(factoryRoot);
  if (snapshot.governanceModeOn && snapshot.governanceRepoPath) {
    return path.join(snapshot.governanceRepoPath, "tasks");
  }
  return getFactoryPaths(factoryRoot).tasksDir;
}
