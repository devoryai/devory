/**
 * packages/core/src/license.test.ts
 *
 * Tests for JWT-based license verification and local cache behavior.
 *
 * Uses real RSA key generation and signing via Node's built-in crypto module —
 * no mocking of the verification path. Network fetch is bypassed by writing
 * the public key to .devory/license.jwk in a temp directory.
 */

import { describe, test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { clearLicenseToken, detectTier, getLicenseStatus, isFeatureEnabled, writeLicenseToken } from "./license.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestKeyPair {
  privateKey: crypto.KeyObject;
  publicJwk: crypto.JsonWebKey;
}

/** Generate a fresh RSA-2048 key pair for tests. */
function generateTestKeyPair(): TestKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey;
  return { privateKey, publicJwk };
}

/** Build and sign a JWT with RS256. */
function signJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = "test-key-001"
): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const encodeB64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const signingInput = `${encodeB64url(header)}.${encodeB64url(payload)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

/** Standard valid Pro payload, expires 1 year from now. */
function proPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "user_test_123",
    tier: "pro",
    iat: now,
    exp: now + 365 * 24 * 3600,
    ...overrides,
  };
}

/** Create a temp dir with .devory/ and write the public key as license.jwk. */
function makeTempFactory(publicJwk: crypto.JsonWebKey, kid = "test-key-001"): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-license-test-"));
  const devoryDir = path.join(tmpDir, ".devory");
  fs.mkdirSync(devoryDir);
  fs.writeFileSync(
    path.join(devoryDir, "license.jwk"),
    JSON.stringify({ ...publicJwk, kid })
  );
  return tmpDir;
}

/** Write a raw token to .devory/license. */
function writeLicenseFile(factoryRoot: string, token: string): void {
  fs.writeFileSync(path.join(factoryRoot, ".devory", "license"), token);
}

/** Clean up temp directory. */
function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectTier — no key", () => {
  test("returns Core when no env var and no factory root", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const info = await detectTier();
    assert.equal(info.tier, "core");
    assert.equal(info.invalid, undefined);
  });

  test("returns Core when no key file in factory root", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "devory-no-key-"));
    fs.mkdirSync(path.join(tmp, ".devory"));
    try {
      const info = await detectTier(tmp);
      assert.equal(info.tier, "core");
    } finally {
      cleanup(tmp);
    }
  });
});

describe("detectTier — valid token", () => {
  let keys: TestKeyPair;
  let tmpDir: string;

  before(() => {
    delete process.env.DEVORY_LICENSE_KEY;
    keys = generateTestKeyPair();
    tmpDir = makeTempFactory(keys.publicJwk);
  });

  after(() => cleanup(tmpDir));

  test("returns Pro for a valid signed token via license file", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "pro");
    assert.equal(info.source, "file");
    assert.equal(info.userId, "user_test_123");
    assert.equal(info.invalid, undefined);
  });

  test("returns Pro for a valid signed token via env var", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    process.env.DEVORY_LICENSE_KEY = token;
    try {
      const info = await detectTier(tmpDir);
      assert.equal(info.tier, "pro");
      assert.equal(info.source, "env");
    } finally {
      delete process.env.DEVORY_LICENSE_KEY;
    }
  });

  test("writes license cache after successful verification", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    writeLicenseFile(tmpDir, token);

    // Clear any existing cache
    const cachePath = path.join(tmpDir, ".devory", "license-cache.json");
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);

    await detectTier(tmpDir);

    assert.ok(fs.existsSync(cachePath), "license-cache.json should be written");
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    assert.equal(cache.tier, "pro");
    assert.equal(cache.sub, "user_test_123");
    assert.equal(typeof cache.token_hash, "string");
    assert.ok(cache.cache_until > Math.floor(Date.now() / 1000));
  });
});

describe("detectTier — cache hit", () => {
  let keys: TestKeyPair;
  let tmpDir: string;

  before(() => {
    delete process.env.DEVORY_LICENSE_KEY;
    keys = generateTestKeyPair();
    tmpDir = makeTempFactory(keys.publicJwk);
  });

  after(() => cleanup(tmpDir));

  test("serves tier from cache without re-verifying", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    writeLicenseFile(tmpDir, token);

    // Prime the cache
    await detectTier(tmpDir);

    // Replace license.jwk with garbage — verification would fail if re-run
    fs.writeFileSync(
      path.join(tmpDir, ".devory", "license.jwk"),
      JSON.stringify({ kty: "RSA", kid: "test-key-001", n: "garbage", e: "AQAB" })
    );

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "pro", "should serve Pro from cache");
    assert.equal(info.userId, "user_test_123");
    assert.ok(info.reason.includes("cache"));
  });

  test("re-verifies when cache has expired", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    writeLicenseFile(tmpDir, token);

    // Write an expired cache entry
    const now = Math.floor(Date.now() / 1000);
    const expiredCache = {
      kid: "test-key-001",
      sub: "user_test_123",
      tier: "pro",
      exp: now + 3600,
      token_hash: "stale",
      verified_at: now - 90000,
      cache_until: now - 1, // already expired
    };
    const cachePath = path.join(tmpDir, ".devory", "license-cache.json");
    fs.writeFileSync(cachePath, JSON.stringify(expiredCache));

    // Restore a valid JWK so re-verification succeeds
    fs.writeFileSync(
      path.join(tmpDir, ".devory", "license.jwk"),
      JSON.stringify({ ...keys.publicJwk, kid: "test-key-001" })
    );

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "pro");
    assert.ok(!info.reason.includes("cache"), "should not say cache after re-verification");
  });

  test("does not trust cache when the token changes", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    writeLicenseFile(tmpDir, token);
    await detectTier(tmpDir);

    writeLicenseFile(tmpDir, "not-a-jwt-at-all");

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "core");
    assert.equal(info.invalid, true);
    assert.ok(info.reason.toLowerCase().includes("malformed"));
  });
});

describe("license helpers", () => {
  test("writeLicenseToken writes the key and clearLicenseToken removes it", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-license-helpers-"));
    try {
      const { path: licensePath } = writeLicenseToken(tmpDir, "  test-license-token  ");
      assert.equal(fs.readFileSync(licensePath, "utf-8"), "test-license-token\n");

      const cleared = clearLicenseToken(tmpDir);
      assert.equal(cleared.removed, true);
      assert.equal(fs.existsSync(licensePath), false);
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe("detectTier — invalid signature", () => {
  test("returns Core with invalid flag for tampered token", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const keys = generateTestKeyPair();
    const tmpDir = makeTempFactory(keys.publicJwk);
    try {
      // Sign with a different key than what's in license.jwk
      const { privateKey: otherKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      const token = signJwt(proPayload(), otherKey);
      writeLicenseFile(tmpDir, token);

      const info = await detectTier(tmpDir);
      assert.equal(info.tier, "core");
      assert.equal(info.invalid, true);
      assert.ok(info.reason.toLowerCase().includes("signature"));
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe("detectTier — expired token", () => {
  test("returns Core with invalid flag for expired token", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const keys = generateTestKeyPair();
    const tmpDir = makeTempFactory(keys.publicJwk);
    try {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(proPayload({ exp: now - 3600 }), keys.privateKey);
      writeLicenseFile(tmpDir, token);

      const info = await detectTier(tmpDir);
      assert.equal(info.tier, "core");
      assert.equal(info.invalid, true);
      assert.ok(info.reason.toLowerCase().includes("expired"));
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe("detectTier — malformed token", () => {
  test("returns Core for a non-JWT string", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-malformed-"));
    fs.mkdirSync(path.join(tmpDir, ".devory"));
    writeLicenseFile(tmpDir, "not-a-jwt-at-all");
    try {
      const info = await detectTier(tmpDir);
      assert.equal(info.tier, "core");
      assert.equal(info.invalid, true);
      assert.ok(info.reason.toLowerCase().includes("malformed"));
    } finally {
      cleanup(tmpDir);
    }
  });

  test("returns Core for a JWT with wrong algorithm", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devory-alg-"));
    fs.mkdirSync(path.join(tmpDir, ".devory"));

    // Build a HS256 token manually
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "k1" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(proPayload())).toString("base64url");
    writeLicenseFile(tmpDir, `${header}.${payload}.fakesignature`);
    try {
      const info = await detectTier(tmpDir);
      assert.equal(info.tier, "core");
      assert.equal(info.invalid, true);
    } finally {
      cleanup(tmpDir);
    }
  });

  test("returns Core for a JWT missing the sub claim", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const keys = generateTestKeyPair();
    const tmpDir = makeTempFactory(keys.publicJwk);
    try {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt({ tier: "pro", iat: now, exp: now + 3600 }, keys.privateKey);
      writeLicenseFile(tmpDir, token);

      const info = await detectTier(tmpDir);
      assert.equal(info.tier, "core");
      assert.equal(info.invalid, true);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ---------------------------------------------------------------------------
// Teams tier
// ---------------------------------------------------------------------------

describe("detectTier — Teams license", () => {
  let keys: TestKeyPair;
  let tmpDir: string;

  before(() => {
    delete process.env.DEVORY_LICENSE_KEY;
    keys = generateTestKeyPair();
    tmpDir = makeTempFactory(keys.publicJwk);
  });

  after(() => cleanup(tmpDir));

  test("returns teams tier for a token with tier=teams", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      {
        sub: "user_org_owner",
        tier: "teams",
        iat: now,
        exp: now + 365 * 24 * 3600,
        org: "org_acme",
        seats: 25,
      },
      keys.privateKey
    );
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "teams");
    assert.equal(info.userId, "user_org_owner");
    assert.equal(info.orgId, "org_acme");
    assert.equal(info.seatCount, 25);
    assert.equal(info.invalid, undefined);
  });

  test("returns teams tier for a token with tier=teams_annual", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      {
        sub: "user_annual_owner",
        tier: "teams_annual",
        iat: now,
        exp: now + 365 * 24 * 3600,
        org: "org_annual",
        seats: 10,
      },
      keys.privateKey
    );
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "teams");
    assert.equal(info.orgId, "org_annual");
    assert.equal(info.seatCount, 10);
  });

  test("teams license enables Pro features via isFeatureEnabled", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { sub: "user_teams", tier: "teams", iat: now, exp: now + 3600, org: "org_x", seats: 5 },
      keys.privateKey
    );
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(isFeatureEnabled("custom_rules", info), true);
    assert.equal(isFeatureEnabled("pr_gates", info), true);
    assert.equal(isFeatureEnabled("shared_doctrine", info), true);
    assert.equal(isFeatureEnabled("baseline_overrides", info), true);
  });

  test("teams tier is written to and read back from cache", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      {
        sub: "user_cache_teams",
        tier: "teams",
        iat: now,
        exp: now + 365 * 24 * 3600,
        org: "org_cached",
        seats: 50,
      },
      keys.privateKey
    );
    writeLicenseFile(tmpDir, token);

    // Clear cache and verify — writes cache
    const cachePath = path.join(tmpDir, ".devory", "license-cache.json");
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    await detectTier(tmpDir);

    assert.ok(fs.existsSync(cachePath));
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    assert.equal(cache.tier, "teams");
    assert.equal(cache.org_id, "org_cached");
    assert.equal(cache.seat_count, 50);

    // Second call should use cache and return org/seats
    const infoFromCache = await getLicenseStatus(tmpDir);
    assert.equal(infoFromCache.cacheUsed, true);
    assert.equal(infoFromCache.tier, "teams");
    assert.equal(infoFromCache.orgId, "org_cached");
    assert.equal(infoFromCache.seatCount, 50);
  });
});

describe("detectTier — Pro license variants", () => {
  let keys: TestKeyPair;
  let tmpDir: string;

  before(() => {
    delete process.env.DEVORY_LICENSE_KEY;
    keys = generateTestKeyPair();
    tmpDir = makeTempFactory(keys.publicJwk);
  });

  after(() => cleanup(tmpDir));

  test("returns pro tier for tier=pro_annual", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { sub: "user_annual", tier: "pro_annual", iat: now, exp: now + 365 * 24 * 3600 },
      keys.privateKey
    );
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "pro");
    assert.equal(info.orgId, undefined);
    assert.equal(info.seatCount, undefined);
  });

  test("returns pro tier for tier=lifetime", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { sub: "user_lifetime", tier: "lifetime", iat: now, exp: now + 365 * 24 * 3600 },
      keys.privateKey
    );
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "pro");
  });

  test("individual Pro token does not expose org or seats", async () => {
    const token = signJwt(proPayload(), keys.privateKey);
    writeLicenseFile(tmpDir, token);

    const info = await detectTier(tmpDir);
    assert.equal(info.tier, "pro");
    assert.equal(info.orgId, undefined);
    assert.equal(info.seatCount, undefined);
  });
});

describe("getLicenseStatus", () => {
  test("reports cache usage after a successful cached verification", async () => {
    delete process.env.DEVORY_LICENSE_KEY;
    const keys = generateTestKeyPair();
    const tmpDir = makeTempFactory(keys.publicJwk);
    try {
      const token = signJwt(proPayload(), keys.privateKey);
      writeLicenseFile(tmpDir, token);
      await detectTier(tmpDir);

      const status = await getLicenseStatus(tmpDir);
      assert.equal(status.tier, "pro");
      assert.equal(status.cacheUsed, true);
      assert.equal(status.sourceLabel, ".devory/license");
      assert.equal(status.fallbackToCore, false);
      assert.ok(status.cacheFilePath?.endsWith(path.join(".devory", "license-cache.json")));
    } finally {
      cleanup(tmpDir);
    }
  });
});
