import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  buildDefaultActiveState,
  detectTier,
  normalizeActiveDevoryState,
  resolveFactoryRoot,
  type ActiveDevoryState,
} from "@devory/core";
import {
  clearSession,
  readSession,
  writeSession,
  type DevorySession,
} from "../lib/cloud-session.ts";

export const NAME = "cloud";
export const USAGE =
  "devory cloud <status|login|link|logout> [options]";

export type CloudSubcommand = "status" | "login" | "link" | "logout";

export interface CloudArgs {
  subcommand: CloudSubcommand;
  root?: string;
  workspaceId?: string;
  sessionFile?: string;
  sessionJson?: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  userEmail?: string;
  source?: string;
}

interface CloudLoginRequestResponse {
  request_id: string;
  public_code: string;
  poll_token: string;
  expires_at: string;
  poll_interval_ms: number;
  approve_url: string;
}

interface CloudLoginPollResponse {
  status: "pending" | "approved" | "consumed" | "expired" | "cancelled";
  request_id: string;
  session?: DevorySession;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function activeStatePath(factoryRoot: string): string {
  return path.join(factoryRoot, ".devory", "active-state.json");
}

function readActiveState(factoryRoot: string): ActiveDevoryState {
  const filePath = activeStatePath(factoryRoot);
  if (!fs.existsSync(filePath)) {
    return buildDefaultActiveState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeActiveDevoryState(parsed) ?? buildDefaultActiveState();
  } catch {
    return buildDefaultActiveState();
  }
}

function writeActiveState(factoryRoot: string, state: ActiveDevoryState): string {
  const filePath = activeStatePath(factoryRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  return filePath;
}

function formatPathForDisplay(targetPath: string, cwd = process.cwd()): string {
  const relative = path.relative(cwd, targetPath);
  return relative && !relative.startsWith("..") ? relative : targetPath;
}

function buildWebsiteUrl(): string {
  return process.env.NEXT_PUBLIC_DEVORY_WEBSITE_URL?.trim() || "https://devory.ai";
}

function buildCloudCliApiUrl(pathname: string): string {
  return new URL(pathname, buildWebsiteUrl()).toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildImportedSession(args: CloudArgs, factoryRoot: string): DevorySession | null {
  if (args.sessionJson) {
    try {
      const parsed = JSON.parse(args.sessionJson) as unknown;
      const session = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
      const accessToken = asString(session?.access_token);
      if (!accessToken) return null;
      return {
        access_token: accessToken,
        refresh_token: asString(session?.refresh_token),
        workspace_id: asString(session?.workspace_id),
        user_id: asString(session?.user_id),
        user_email: asString(session?.user_email),
        expires_at: asString(session?.expires_at),
        source: asString(session?.source) ?? "manual-import",
        obtained_at: asString(session?.obtained_at) ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  if (args.sessionFile) {
    try {
      const raw = fs.readFileSync(path.resolve(factoryRoot, args.sessionFile), "utf-8");
      return buildImportedSession({ ...args, sessionJson: raw, sessionFile: undefined }, factoryRoot);
    } catch {
      return null;
    }
  }

  if (args.accessToken) {
    return {
      access_token: args.accessToken,
      refresh_token: args.refreshToken,
      workspace_id: args.workspaceId,
      user_id: args.userId,
      user_email: args.userEmail,
      source: args.source ?? "manual-token-entry",
      obtained_at: new Date().toISOString(),
    };
  }

  return null;
}

export function parseArgs(argv: string[]): { args?: CloudArgs; error: string | null } {
  const subcommand = argv[0];
  if (!subcommand || !["status", "login", "link", "logout"].includes(subcommand)) {
    return { error: "expected subcommand status, login, link, or logout" };
  }

  const args: CloudArgs = {
    subcommand: subcommand as CloudSubcommand,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root" && argv[i + 1]) {
      args.root = argv[++i];
      continue;
    }
    if (arg === "--workspace-id" && argv[i + 1]) {
      args.workspaceId = argv[++i];
      continue;
    }
    if (arg === "--session-file" && argv[i + 1]) {
      args.sessionFile = argv[++i];
      continue;
    }
    if (arg === "--session-json" && argv[i + 1]) {
      args.sessionJson = argv[++i];
      continue;
    }
    if (arg === "--access-token" && argv[i + 1]) {
      args.accessToken = argv[++i];
      continue;
    }
    if (arg === "--refresh-token" && argv[i + 1]) {
      args.refreshToken = argv[++i];
      continue;
    }
    if (arg === "--user-id" && argv[i + 1]) {
      args.userId = argv[++i];
      continue;
    }
    if (arg === "--user-email" && argv[i + 1]) {
      args.userEmail = argv[++i];
      continue;
    }
    if (arg === "--source" && argv[i + 1]) {
      args.source = argv[++i];
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }

  if (
    args.subcommand === "link" &&
    (!args.workspaceId || !args.workspaceId.trim())
  ) {
    return { error: "link requires --workspace-id <id>" };
  }

  return { args, error: null };
}

function printLoginScaffold(factoryRoot: string): void {
  console.log(`Factory root: ${factoryRoot}`);
  console.log("");
  console.log("Cloud account connection is optional.");
  console.log("Local/Core and offline enterprise deployments can continue with `devory license activate` and local governance mode only.");
  console.log("");
  console.log("Common path for Pro or Teams:");
  console.log("  1. Run `devory cloud login` to start a browser sign-in handoff");
  console.log("  2. Approve the request in the Devory website");
  console.log("  3. The CLI stores the session locally and links the selected cloud workspace");
  console.log("");
  console.log("Manual import fallback:");
  console.log("     devory cloud login --session-file <file>");
  console.log("     devory cloud login --session-json '{...}'");
  console.log("     devory cloud login --access-token <token> --refresh-token <token>");
  console.log("     devory cloud link --workspace-id <workspace-id>");
}

async function createHostedLoginRequest(
  factoryRoot: string,
  workspaceId?: string,
): Promise<CloudLoginRequestResponse> {
  const activeState = readActiveState(factoryRoot);
  const response = await fetch(buildCloudCliApiUrl("/api/cloud/cli/session-requests"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: workspaceId ?? activeState.cloud_workspace_id ?? null,
      client_name: `${os.hostname()}:${path.basename(factoryRoot)}`,
    }),
  });

  const body = (await response.json()) as CloudLoginRequestResponse | { error?: string };
  if (!response.ok) {
    throw new Error((body as { error?: string }).error ?? "Failed to start cloud login");
  }
  return body as CloudLoginRequestResponse;
}

async function pollHostedLoginSession(
  request: CloudLoginRequestResponse,
): Promise<DevorySession> {
  const deadline = new Date(request.expires_at).getTime();

  while (Date.now() < deadline) {
    const url = new URL(
      buildCloudCliApiUrl(`/api/cloud/cli/session-requests/${encodeURIComponent(request.request_id)}`),
    );
    url.searchParams.set("poll_token", request.poll_token);

    const response = await fetch(url.toString(), { cache: "no-store" });
    const body = (await response.json()) as CloudLoginPollResponse | { error?: string };

    if (!response.ok) {
      throw new Error((body as { error?: string }).error ?? "Cloud login polling failed");
    }

    const poll = body as CloudLoginPollResponse;
    if ((poll.status === "approved" || poll.status === "consumed") && poll.session?.access_token) {
      return {
        ...poll.session,
        source: poll.session.source ?? "cloud-cli-login",
        obtained_at: poll.session.obtained_at ?? new Date().toISOString(),
      };
    }

    if (poll.status === "expired" || poll.status === "cancelled") {
      throw new Error(`Cloud login request ${poll.status}`);
    }

    await sleep(Math.max(1000, request.poll_interval_ms));
  }

  throw new Error("Cloud login request timed out");
}

function persistCloudSession(factoryRoot: string, session: DevorySession): void {
  const sessionPath = writeSession(factoryRoot, session);
  console.log(`Cloud session saved to ${formatPathForDisplay(sessionPath)}`);
  if (session.user_email || session.user_id) {
    console.log(`Account: ${session.user_email ?? session.user_id}`);
  }
  if (session.workspace_id) {
    const activeState = readActiveState(factoryRoot);
    const statePath = writeActiveState(factoryRoot, {
      ...activeState,
      cloud_workspace_id: session.workspace_id,
      updated_at: new Date().toISOString(),
    });
    console.log(`Linked cloud workspace from session: ${session.workspace_id}`);
    console.log(`Active state: ${formatPathForDisplay(statePath)}`);
  }
}

async function runStatus(factoryRoot: string): Promise<number> {
  const license = await detectTier(factoryRoot);
  const session = readSession(factoryRoot);
  const activeState = readActiveState(factoryRoot);

  console.log(`Factory root: ${factoryRoot}`);
  console.log(`Tier: ${license.tier === "teams" ? "Teams" : license.tier === "pro" ? "Pro" : "Core"}`);
  console.log(`Cloud session: ${session ? "connected" : "not connected"}`);
  console.log(`Active workspace: ${activeState.workspace_id}`);
  console.log(`Linked cloud workspace: ${session?.workspace_id ?? activeState.cloud_workspace_id ?? "not linked"}`);

  if (session?.user_email || session?.user_id) {
    console.log(`Account: ${session.user_email ?? session.user_id}`);
  }
  if (session?.source) {
    console.log(`Session source: ${session.source}`);
  }

  console.log("");
  if (license.tier === "core") {
    console.log("Core/local mode does not require cloud sign-in.");
    console.log("If this environment is intentionally isolated, keep using `devory license activate` and local governance mode.");
    console.log("If you later upgrade to Pro or Teams, connect a cloud session with `devory cloud login`.");
    return 0;
  }

  if (!session) {
    console.log("This paid workspace is not connected to a cloud account yet.");
    printLoginScaffold(factoryRoot);
    return 0;
  }

  if (!session.workspace_id && !activeState.cloud_workspace_id) {
    console.log("Cloud account is connected, but no cloud workspace is linked to this repo yet.");
    console.log("Run: devory cloud link --workspace-id <workspace-id>");
    return 0;
  }

  console.log("Cloud account and workspace linkage are present.");
  return 0;
}

async function runLogin(factoryRoot: string, args: CloudArgs): Promise<number> {
  const imported = buildImportedSession(args, factoryRoot);
  if (imported) {
    persistCloudSession(factoryRoot, imported);
    console.log("Next step: run `devory cloud status`.");
    return 0;
  }

  try {
    const request = await createHostedLoginRequest(factoryRoot, args.workspaceId);
    console.log("Browser sign-in required.");
    console.log(`Open this URL in your browser:\n${request.approve_url}`);
    console.log(`Connection code: ${request.public_code}`);
    console.log(`This request expires at ${new Date(request.expires_at).toLocaleString()}.`);
    console.log("Waiting for approval...");

    const session = await pollHostedLoginSession(request);
    persistCloudSession(factoryRoot, session);
    console.log("Cloud login complete. Next step: run `devory cloud status`.");
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Cloud login failed: ${message}`);
    console.error("");
    printLoginScaffold(factoryRoot);
    return 1;
  }
}

function runLink(factoryRoot: string, args: CloudArgs): number {
  const session = readSession(factoryRoot);
  if (!session) {
    console.error("No cloud session found. Run `devory cloud login` first.");
    return 1;
  }

  const workspaceId = args.workspaceId!.trim();
  const nextSession: DevorySession = {
    ...session,
    workspace_id: workspaceId,
  };
  const activeState = readActiveState(factoryRoot);
  const nextState: ActiveDevoryState = {
    ...activeState,
    cloud_workspace_id: workspaceId,
    updated_at: new Date().toISOString(),
  };

  const sessionPath = writeSession(factoryRoot, nextSession);
  const statePath = writeActiveState(factoryRoot, nextState);
  console.log(`Linked this repo to cloud workspace: ${workspaceId}`);
  console.log(`Session: ${formatPathForDisplay(sessionPath)}`);
  console.log(`Active state: ${formatPathForDisplay(statePath)}`);
  return 0;
}

function runLogout(factoryRoot: string): number {
  const cleared = clearSession(factoryRoot);
  console.log(
    cleared.removed
      ? `Removed ${formatPathForDisplay(cleared.path)}`
      : `No cloud session file found at ${formatPathForDisplay(cleared.path)}`,
  );
  console.log("Local license activation remains unchanged.");
  return 0;
}

export async function run(args: CloudArgs): Promise<number> {
  const factoryRoot = args.root ? path.resolve(args.root) : resolveFactoryRoot().root;

  if (args.subcommand === "status") {
    return runStatus(factoryRoot);
  }
  if (args.subcommand === "login") {
    return runLogin(factoryRoot, args);
  }
  if (args.subcommand === "link") {
    return runLink(factoryRoot, args);
  }
  return runLogout(factoryRoot);
}
