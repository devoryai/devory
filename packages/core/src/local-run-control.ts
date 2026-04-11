import * as fs from "fs";
import * as path from "path";

export const LOCAL_RUN_CONTROL_FILE = path.join(".devory", "local-run-control.json");

export type LocalRunControlAction = "pause" | "stop";

export interface LocalRunControlState {
  version: 1;
  run_id: string | null;
  requested_action: LocalRunControlAction | null;
  acknowledged_action: LocalRunControlAction | null;
  updated_at: string;
}

function buildState(
  partial: Partial<LocalRunControlState> = {},
): LocalRunControlState {
  return {
    version: 1,
    run_id: partial.run_id ?? null,
    requested_action: partial.requested_action ?? null,
    acknowledged_action: partial.acknowledged_action ?? null,
    updated_at: partial.updated_at ?? new Date().toISOString(),
  };
}

export function resolveLocalRunControlPath(factoryRoot: string): string {
  return path.join(factoryRoot, LOCAL_RUN_CONTROL_FILE);
}

export function readLocalRunControl(factoryRoot: string): LocalRunControlState | null {
  const filePath = resolveLocalRunControlPath(factoryRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<LocalRunControlState>;
    return buildState(parsed);
  } catch {
    return null;
  }
}

export function writeLocalRunControl(
  factoryRoot: string,
  state: Partial<LocalRunControlState>,
): LocalRunControlState {
  const filePath = resolveLocalRunControlPath(factoryRoot);
  const nextState = buildState(state);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2) + "\n", "utf-8");
  return nextState;
}

export function updateLocalRunControl(
  factoryRoot: string,
  update: (current: LocalRunControlState | null) => Partial<LocalRunControlState>,
): LocalRunControlState {
  const current = readLocalRunControl(factoryRoot);
  return writeLocalRunControl(factoryRoot, {
    ...(current ?? buildState()),
    ...update(current),
    updated_at: new Date().toISOString(),
  });
}

export function clearLocalRunControl(factoryRoot: string): LocalRunControlState {
  return writeLocalRunControl(factoryRoot, {
    run_id: null,
    requested_action: null,
    acknowledged_action: null,
  });
}
