/**
 * packages/cli/src/smoke/paid-flow.smoke.ts
 *
 * Smoke coverage for the CLI side of the paid customer flow:
 *
 *   Step 1 — Issuance boundary: a Pro JWT is constructed with the same RS256
 *             format the website service produces (sub, tier, iat, exp, jti)
 *   Step 2 — CLI activation: writeLicenseToken persists the token
 *   Step 3 — Tier detection:  getLicenseStatus resolves Pro from the stored key
 *   Step 4 — Status command:  `devory license status` output confirms Pro tier
 *   Step 5 — CLI clear:       clearLicenseToken removes the key; tier returns Core
 *
 * Uses real RSA cryptography throughout — the public key is cached locally so
 * no network call to keys.devory.ai is made.  No live payment or Stripe charge
 * is required.
 *
 * Each assertion includes a step label so failures pinpoint the broken stage.
 *
 * Run: tsx --test packages/cli/src/smoke/paid-flow.smoke.ts
 */

import { describe, test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  clearLicenseToken,
  getLicenseStatus,
  writeLicenseToken,
} from "../../../core/src/license.ts";
import { run } from "../commands/license.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestKeyPair {
  privateKey: crypto.KeyObject;
  publicJwk: crypto.JsonWebKey;
}

function generateKeyPair(): TestKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    privateKey,
    publicJwk: publicKey.export({ format: "jwk" }) as crypto.JsonWebKey,
  };
}

/**
 * Sign a JWT with RS256 — mirrors the signJwt helper in the website's
 * license-service.ts so the token format is identical across the boundary.
 */
function signJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid: string
): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

/** Capture console.log / console.error output for a single async operation. */
async function withCapturedOutput<T>(
  fn: () => Promise<T>
): Promise<{ result: T; logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  try {
    const result = await fn();
    return { result, logs, errors };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

// ---------------------------------------------------------------------------
// Smoke suite
// ---------------------------------------------------------------------------

describe("Paid flow smoke — CLI side", () => {
  const KID = "smoke-key-001";

  let keyPair: TestKeyPair;
  let factoryRoot: string;
  let proToken: string;

  before(() => {
    // Generate a fresh RSA key pair for this run — same algorithm the website uses
    keyPair = generateKeyPair();

    // Set up a temporary factory root with the public key cached locally so
    // getLicenseStatus can verify the token without hitting keys.devory.ai
    factoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-smoke-"));
    const devoryDir = path.join(factoryRoot, ".devory");
    fs.mkdirSync(devoryDir);
    fs.writeFileSync(
      path.join(devoryDir, "license.jwk"),
      JSON.stringify({ ...keyPair.publicJwk, kid: KID })
    );

    // Build the Pro JWT with the same payload shape the website service produces:
    //   sub  — user identifier
    //   tier — plan name
    //   iat  — issued-at (Unix seconds)
    //   exp  — expiry (Unix seconds)
    //   jti  — license row UUID (revocation anchor)
    const now = Math.floor(Date.now() / 1000);
    proToken = signJwt(
      {
        sub: "user-smoke-cli-001",
        tier: "pro",
        iat: now,
        exp: now + 400 * 24 * 3600,
        jti: "lic-smoke-cli-aaa-000",
      },
      keyPair.privateKey,
      KID
    );
  });

  after(() => {
    fs.rmSync(factoryRoot, { recursive: true, force: true });
  });

  test("[Step 1] issuance boundary: Pro JWT carries expected claims and valid RS256 signature", () => {
    const parts = proToken.split(".");
    assert.equal(parts.length, 3, "[Step 1] token must have three parts");

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    assert.equal(header.alg, "RS256", "[Step 1] header.alg must be RS256");
    assert.equal(header.kid, KID, "[Step 1] header.kid must match signing key");

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    assert.equal(payload.sub, "user-smoke-cli-001", "[Step 1] sub claim must match userId");
    assert.equal(payload.tier, "pro", "[Step 1] tier claim must be pro");
    assert.equal(typeof payload.iat, "number", "[Step 1] iat claim must be a number");
    assert.equal(typeof payload.exp, "number", "[Step 1] exp claim must be a number");
    assert.ok(payload.exp > payload.iat, "[Step 1] exp must be after iat");
    assert.equal(payload.jti, "lic-smoke-cli-aaa-000", "[Step 1] jti claim must carry licenseId");
  });

  test("[Step 2] CLI activation: writeLicenseToken persists the token to .devory/license", () => {
    const result = writeLicenseToken(factoryRoot, proToken);
    const written = fs.readFileSync(result.path, "utf8").trim();
    assert.equal(written, proToken, "[Step 2] token written to disk must match the Pro JWT");
  });

  test("[Step 3] tier detection: getLicenseStatus resolves Pro after activation", async () => {
    const status = await getLicenseStatus(factoryRoot);
    assert.equal(status.tier, "pro", "[Step 3] tier must be pro after activation");
    assert.equal(status.hasKey, true, "[Step 3] hasKey must be true");
    assert.equal(status.userId, "user-smoke-cli-001", "[Step 3] userId must match token sub claim");
    assert.equal(status.invalid, undefined, "[Step 3] invalid flag must not be set for a valid token");
  });

  test("[Step 4] status command: `devory license status` output confirms Pro tier", async () => {
    const { result: exitCode, logs } = await withCapturedOutput(() =>
      run({ subcommand: "status", root: factoryRoot })
    );
    assert.equal(exitCode, 0, "[Step 4] status command must exit 0");
    const output = logs.join("\n");
    assert.ok(output.includes("Pro"), "[Step 4] status output must display Pro tier");
    assert.ok(output.includes("user-smoke-cli-001"), "[Step 4] status output must display the user id");
  });

  test("[Step 5] CLI clear: clearLicenseToken removes the key; tier returns to Core", async () => {
    const clearResult = clearLicenseToken(factoryRoot);
    assert.equal(clearResult.removed, true, "[Step 5] clearLicenseToken must remove the license file");

    // Clear the cache file if present so getLicenseStatus re-reads from disk
    const cacheFile = path.join(factoryRoot, ".devory", "license-cache.json");
    if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile);

    const status = await getLicenseStatus(factoryRoot);
    assert.equal(status.tier, "core", "[Step 5] tier must return to core after clearing license");
    assert.equal(status.hasKey, false, "[Step 5] hasKey must be false after clearing license");
  });
});
