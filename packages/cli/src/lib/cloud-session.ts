import * as fs from "fs";
import * as path from "path";

export interface DevorySession {
  access_token: string;
  refresh_token?: string;
  workspace_id?: string;
  user_id?: string;
  user_email?: string;
  expires_at?: string;
  source?: string;
  obtained_at?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function normalizeSession(value: unknown): DevorySession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const accessToken = asString(record.access_token);
  if (!accessToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: asString(record.refresh_token),
    workspace_id: asString(record.workspace_id),
    user_id: asString(record.user_id),
    user_email: asString(record.user_email),
    expires_at: asString(record.expires_at),
    source: asString(record.source),
    obtained_at: asString(record.obtained_at),
  };
}

export function getSessionPath(factoryRoot: string): string {
  return path.join(factoryRoot, ".devory", "session.json");
}

export function readSession(factoryRoot: string): DevorySession | null {
  const sessionPath = getSessionPath(factoryRoot);
  if (!fs.existsSync(sessionPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf-8")) as unknown;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

export function writeSession(factoryRoot: string, session: DevorySession): string {
  const sessionPath = getSessionPath(factoryRoot);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  return sessionPath;
}

export function clearSession(factoryRoot: string): { path: string; removed: boolean } {
  const sessionPath = getSessionPath(factoryRoot);
  if (!fs.existsSync(sessionPath)) {
    return { path: sessionPath, removed: false };
  }
  fs.unlinkSync(sessionPath);
  return { path: sessionPath, removed: true };
}
