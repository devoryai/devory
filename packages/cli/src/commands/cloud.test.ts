import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parseArgs, run } from "./cloud.ts";

let workspace: string;
let originalFetch: typeof global.fetch | undefined;

function captureConsoleAsync(
  fn: () => Promise<number>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    stdout.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.join(" "));
  };

  return fn()
    .then((code) => ({ code, stdout: stdout.join("\n"), stderr: stderr.join("\n") }))
    .finally(() => {
      console.log = originalLog;
      console.error = originalError;
    });
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devory-cloud-command-"));
  originalFetch = global.fetch;
  delete process.env.DEVORY_LICENSE_KEY;
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
  process.env.NEXT_PUBLIC_DEVORY_WEBSITE_URL = "https://devory.example";
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
  global.fetch = originalFetch as typeof global.fetch;
  delete process.env.DEVORY_LICENSE_KEY;
  delete process.env.DEVORY_FACTORY_ROOT;
  delete process.env.FACTORY_ROOT;
  delete process.env.NEXT_PUBLIC_DEVORY_WEBSITE_URL;
});

describe("cloud command", () => {
  test("login imports a session bundle from inline json", async () => {
    const parsed = parseArgs([
      "login",
      "--root", workspace,
      "--session-json", '{"access_token":"token-1","refresh_token":"refresh-1","user_email":"user@example.com"}',
    ]);
    assert.equal(parsed.error, null);

    const result = await captureConsoleAsync(() => run(parsed.args!));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Cloud session saved to/);

    const written = JSON.parse(
      fs.readFileSync(path.join(workspace, ".devory", "session.json"), "utf-8"),
    ) as { access_token: string; refresh_token?: string; user_email?: string };
    assert.equal(written.access_token, "token-1");
    assert.equal(written.refresh_token, "refresh-1");
    assert.equal(written.user_email, "user@example.com");
  });

  test("link updates both session and active state cloud workspace ids", async () => {
    fs.mkdirSync(path.join(workspace, ".devory"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".devory", "session.json"),
      '{"access_token":"token-1"}\n',
      "utf-8",
    );

    const parsed = parseArgs(["link", "--root", workspace, "--workspace-id", "cloud-ws-7"]);
    assert.equal(parsed.error, null);

    const result = await captureConsoleAsync(() => run(parsed.args!));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Linked this repo to cloud workspace: cloud-ws-7/);

    const session = JSON.parse(
      fs.readFileSync(path.join(workspace, ".devory", "session.json"), "utf-8"),
    ) as { workspace_id?: string };
    const activeState = JSON.parse(
      fs.readFileSync(path.join(workspace, ".devory", "active-state.json"), "utf-8"),
    ) as { cloud_workspace_id?: string };

    assert.equal(session.workspace_id, "cloud-ws-7");
    assert.equal(activeState.cloud_workspace_id, "cloud-ws-7");
  });

  test("status explains offline-safe path for core users with no cloud session", async () => {
    const result = await captureConsoleAsync(() => run({ subcommand: "status", root: workspace }));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Cloud session: not connected/);
    assert.match(result.stdout, /Core\/local mode does not require cloud sign-in/);
  });

  test("login can complete the hosted browser handoff and persist the returned session", async () => {
    const responses = [
      {
        ok: true,
        json: async () => ({
          request_id: "req-1",
          public_code: "ABCD-2345",
          poll_token: "poll-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          poll_interval_ms: 1,
          approve_url: "https://devory.example/cloud/connect?request_id=req-1",
        }),
      },
      {
        ok: true,
        json: async () => ({
          status: "consumed",
          request_id: "req-1",
          session: {
            access_token: "access-1",
            refresh_token: "refresh-1",
            workspace_id: "cloud-ws-9",
            user_email: "user@example.com",
            source: "cloud-cli-login",
            obtained_at: "2026-04-11T20:00:00.000Z",
          },
        }),
      },
    ];

    global.fetch = (async () => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch");
      return next as Response;
    }) as typeof global.fetch;

    const result = await captureConsoleAsync(() => run({ subcommand: "login", root: workspace }));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Browser sign-in required/);
    assert.match(result.stdout, /Cloud login complete/);

    const session = JSON.parse(
      fs.readFileSync(path.join(workspace, ".devory", "session.json"), "utf-8"),
    ) as { access_token: string; workspace_id?: string; user_email?: string };
    const activeState = JSON.parse(
      fs.readFileSync(path.join(workspace, ".devory", "active-state.json"), "utf-8"),
    ) as { cloud_workspace_id?: string };

    assert.equal(session.access_token, "access-1");
    assert.equal(session.workspace_id, "cloud-ws-9");
    assert.equal(session.user_email, "user@example.com");
    assert.equal(activeState.cloud_workspace_id, "cloud-ws-9");
  });

  test("logout removes the cloud session and preserves offline license messaging", async () => {
    fs.mkdirSync(path.join(workspace, ".devory"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".devory", "session.json"),
      '{"access_token":"token-1"}\n',
      "utf-8",
    );

    const result = await captureConsoleAsync(() => run({ subcommand: "logout", root: workspace }));
    assert.equal(result.code, 0);
    assert.equal(fs.existsSync(path.join(workspace, ".devory", "session.json")), false);
    assert.match(result.stdout, /Local license activation remains unchanged/);
  });
});
