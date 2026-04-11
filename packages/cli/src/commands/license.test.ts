/**
 * packages/cli/src/commands/license.test.ts
 *
 * Tests for CLI license activation, clearing, and status output.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parseArgs, run } from "./license.js";

function generateTestKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    privateKey,
    publicJwk: publicKey.export({ format: "jwk" }) as crypto.JsonWebKey,
  };
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = "test-key-001"
): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-cli-license-"));
  fs.mkdirSync(path.join(root, ".devory"), { recursive: true });
  return root;
}

function writeJwk(root: string, jwk: crypto.JsonWebKey, kid = "test-key-001"): void {
  fs.writeFileSync(path.join(root, ".devory", "license.jwk"), JSON.stringify({ ...jwk, kid }));
}

function validToken(privateKey: crypto.KeyObject): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: "user_cli_test",
      tier: "pro",
      iat: now,
      exp: now + 3600,
    },
    privateKey
  );
}

function withCapturedConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { errors.push(args.join(" ")); };
  return {
    logs,
    errors,
    restore() {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

describe("license command — parseArgs", () => {
  test("parses activate with --key", () => {
    const result = parseArgs(["activate", "--key", "tok"]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { subcommand: "activate", key: "tok", root: undefined });
  });

  test("parses clear with optional root", () => {
    const result = parseArgs(["clear", "--root", "/tmp/workspace"]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { subcommand: "clear", key: undefined, root: "/tmp/workspace" });
  });

  test("returns an error when activate is missing --key", () => {
    const result = parseArgs(["activate"]);
    assert.ok(result.error?.includes("--key"));
  });
});

describe("license command — run", () => {
  let workspace: string;
  let restoreConsole: (() => void) | undefined;

  beforeEach(() => {
    workspace = makeWorkspace();
  });

  afterEach(() => {
    if (restoreConsole) restoreConsole();
    fs.rmSync(workspace, { recursive: true, force: true });
    delete process.env.DEVORY_LICENSE_KEY;
  });

  test("activate writes .devory/license", async () => {
    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    const exitCode = await run({ subcommand: "activate", key: "test-license-token", root: workspace });

    assert.equal(exitCode, 0);
    assert.equal(
      fs.readFileSync(path.join(workspace, ".devory", "license"), "utf-8"),
      "test-license-token\n"
    );
    assert.ok(capture.logs.some((line) => line.includes("License key saved")));
  });

  test("clear removes the saved license file", async () => {
    fs.writeFileSync(path.join(workspace, ".devory", "license"), "token\n");
    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    const exitCode = await run({ subcommand: "clear", root: workspace });

    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(path.join(workspace, ".devory", "license")), false);
    assert.ok(capture.logs.some((line) => line.includes("Removed")));
  });

  test("status reports source, cache usage, and verified tier", async () => {
    const keys = generateTestKeyPair();
    writeJwk(workspace, keys.publicJwk);
    fs.writeFileSync(path.join(workspace, ".devory", "license"), `${validToken(keys.privateKey)}\n`);

    const capture = withCapturedConsole();
    restoreConsole = capture.restore;
    await run({ subcommand: "status", root: workspace });
    const exitCode = await run({ subcommand: "status", root: workspace });

    assert.equal(exitCode, 0);
    const output = capture.logs.join("\n");
    assert.ok(output.includes("Tier: Pro"));
    assert.ok(output.includes("Key source: .devory/license"));
    assert.ok(output.includes("Cache used: yes"));
  });

  test("status explains Core fallback for an invalid key", async () => {
    fs.writeFileSync(path.join(workspace, ".devory", "license"), "not-a-jwt\n");
    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    const exitCode = await run({ subcommand: "status", root: workspace });

    assert.equal(exitCode, 1);
    const output = capture.logs.join("\n");
    assert.ok(output.includes("Tier: Core"));
    assert.ok(output.includes("Fallback: License token is malformed"));
  });

  test("activate fails clearly in a read-only workspace", async () => {
    const devoryDir = path.join(workspace, ".devory");
    fs.chmodSync(devoryDir, 0o500);
    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    try {
      const exitCode = await run({ subcommand: "activate", key: "test-license-token", root: workspace });
      assert.equal(exitCode, 1);
      assert.ok(capture.errors.some((line) => line.includes("not writable")));
    } finally {
      fs.chmodSync(devoryDir, 0o700);
    }
  });

  test("clear when no license file exists reports gracefully and returns 0", async () => {
    // Ensure no license file is present
    const licensePath = path.join(workspace, ".devory", "license");
    assert.equal(fs.existsSync(licensePath), false);

    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    const exitCode = await run({ subcommand: "clear", root: workspace });

    assert.equal(exitCode, 0);
    assert.ok(capture.logs.some((line) => line.includes("No license file found")));
  });

  test("status shows DEVORY_LICENSE_KEY as key source when set via env var", async () => {
    const keys = generateTestKeyPair();
    writeJwk(workspace, keys.publicJwk);
    process.env.DEVORY_LICENSE_KEY = validToken(keys.privateKey);

    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    const exitCode = await run({ subcommand: "status", root: workspace });

    assert.equal(exitCode, 0);
    const output = capture.logs.join("\n");
    assert.ok(output.includes("Tier: Pro"));
    assert.ok(output.includes("Key source: DEVORY_LICENSE_KEY"));
  });

  test("run resolves factory root from DEVORY_FACTORY_ROOT when --root is omitted", async () => {
    const keys = generateTestKeyPair();
    writeJwk(workspace, keys.publicJwk);
    fs.writeFileSync(path.join(workspace, ".devory", "license"), `${validToken(keys.privateKey)}\n`);

    // Point resolveFactoryRoot() at our temp workspace via the env var it checks first
    const prev = process.env.DEVORY_FACTORY_ROOT;
    process.env.DEVORY_FACTORY_ROOT = workspace;

    const capture = withCapturedConsole();
    restoreConsole = capture.restore;

    try {
      // No `root` property — run() must call resolveFactoryRoot() internally
      const exitCode = await run({ subcommand: "status" } as any);

      assert.equal(exitCode, 0);
      const output = capture.logs.join("\n");
      assert.ok(output.includes(`Factory root: ${workspace}`));
      assert.ok(output.includes("Tier: Pro"));
    } finally {
      if (prev === undefined) delete process.env.DEVORY_FACTORY_ROOT;
      else process.env.DEVORY_FACTORY_ROOT = prev;
    }
  });
});
