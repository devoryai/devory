/**
 * packages/core/src/license.ts
 *
 * Tier detection and Pro feature gating for Devory.
 *
 * Tiers:
 *   Core  — no license key required; default baselines only; custom_rules ignored
 *   Pro   — signed JWT license token enables Pro features
 *   Teams — org-scoped JWT with `org` and `seats` claims; same Pro features plus org identity
 *
 * Key resolution order:
 *   1. DEVORY_LICENSE_KEY environment variable
 *   2. .devory/license file in the factory root
 *   3. No key found → Core
 *
 * JWT verification uses RS256 (asymmetric). Public key resolution order:
 *   1. .devory/license.jwk  — local override for air-gapped environments
 *   2. .devory/key-cache.json  — previously fetched key, keyed by kid
 *   3. https://keys.devory.ai/<kid>  — live fetch, written to key cache
 *
 * Successful verification is cached in .devory/license-cache.json for 24 h
 * so repeated commands do not re-run verification on every invocation.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as https from "https";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = "core" | "pro" | "teams";

/** Features gated behind Pro tier. */
export type ProFeature = "custom_rules" | "baseline_overrides" | "shared_doctrine" | "pr_gates";

export interface LicenseInfo {
  tier: Tier;
  /** Raw token value, if one was found */
  key?: string;
  /** Where the key was found */
  source?: "env" | "file";
  /** True when a key was found but verification failed */
  invalid?: boolean;
  /** Human-readable explanation of the tier decision */
  reason: string;
  /** User ID from the verified JWT sub claim */
  userId?: string;
  /** Organization identifier from the JWT `org` claim (Teams licenses only) */
  orgId?: string;
  /** Number of seats allocated from the JWT `seats` claim (Teams licenses only) */
  seatCount?: number;
}

export interface LicenseStatus extends LicenseInfo {
  hasKey: boolean;
  sourceLabel?: string;
  envVarName: typeof ENV_VAR;
  licenseFilePath?: string;
  cacheFilePath?: string;
  cacheUsed: boolean;
  fallbackToCore: boolean;
  expiresAt?: string;
  kid?: string;
}

// Internal JWT types
interface JwtHeader {
  alg: string;
  typ?: string;
  kid: string;
}

interface JwtPayload {
  sub: string;     // user ID
  tier: string;    // "pro" | "teams" | "teams_annual" | etc.
  exp: number;     // unix timestamp
  iat: number;     // unix timestamp
  org?: string;    // org identifier (Teams licenses only)
  seats?: number;  // seat count (Teams licenses only)
}

interface ParsedJwt {
  header: JwtHeader;
  payload: JwtPayload;
  signingInput: string;
  signatureBytes: Buffer;
}

// Cache types
interface LicenseCache {
  kid: string;
  sub: string;
  tier: Tier;
  exp: number;
  token_hash: string;
  verified_at: number;
  cache_until: number;
  org_id?: string;
  seat_count?: number;
}

interface KeyCacheEntry {
  jwk: crypto.JsonWebKey;
  cached_at: number;
}

type KeyCache = Record<string, KeyCacheEntry>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENV_VAR = "DEVORY_LICENSE_KEY";
const LICENSE_FILE = path.join(".devory", "license");
const LICENSE_CACHE_FILE = path.join(".devory", "license-cache.json");
const KEY_CACHE_FILE = path.join(".devory", "key-cache.json");
const LOCAL_JWK_FILE = path.join(".devory", "license.jwk");
const KEYS_BASE_URL = "https://keys.devory.ai";
/** Re-verify after 24 h even if the token hasn't expired. */
const LICENSE_CACHE_TTL = 86_400;
/** Refetch public keys after 7 days. */
const KEY_CACHE_TTL = 604_800;
/** Network timeout for key fetch in ms. */
const KEY_FETCH_TIMEOUT_MS = 5_000;

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// JWT parsing  (pure — no I/O, no crypto)
// ---------------------------------------------------------------------------

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function b64urlDecode(s: string): string {
  return b64urlToBuffer(s).toString("utf-8");
}

function parseJwt(token: string): ParsedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("malformed JWT: expected header.payload.signature");
  }

  const [headerB64, payloadB64, sigB64] = parts;

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = JSON.parse(b64urlDecode(headerB64));
    payload = JSON.parse(b64urlDecode(payloadB64));
  } catch {
    throw new Error("malformed JWT: could not JSON-parse header or payload");
  }

  if (!header.kid) throw new Error("malformed JWT: missing kid in header");
  if (header.alg !== "RS256") throw new Error(`unsupported algorithm: ${header.alg ?? "(none)"}`);
  if (!payload.sub) throw new Error("malformed JWT: missing sub claim");
  if (!payload.tier) throw new Error("malformed JWT: missing tier claim");
  if (typeof payload.exp !== "number") throw new Error("malformed JWT: missing or invalid exp claim");
  if (typeof payload.iat !== "number") throw new Error("malformed JWT: missing or invalid iat claim");

  return {
    header,
    payload,
    signingInput: `${headerB64}.${payloadB64}`,
    signatureBytes: b64urlToBuffer(sigB64),
  };
}

// ---------------------------------------------------------------------------
// Signature verification  (pure — no I/O, sync)
// ---------------------------------------------------------------------------

function verifyRs256(signingInput: string, signatureBytes: Buffer, jwk: crypto.JsonWebKey): boolean {
  try {
    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    return crypto.verify("RSA-SHA256", Buffer.from(signingInput, "utf-8"), key, signatureBytes);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Network key fetch
// ---------------------------------------------------------------------------

function fetchKeyFromNetwork(kid: string): Promise<crypto.JsonWebKey> {
  return new Promise((resolve, reject) => {
    const url = `${KEYS_BASE_URL}/${encodeURIComponent(kid)}`;
    const req = https.get(url, { timeout: KEY_FETCH_TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`key fetch returned HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as crypto.JsonWebKey);
        } catch {
          reject(new Error("key fetch returned invalid JSON"));
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`key fetch timed out after ${KEY_FETCH_TIMEOUT_MS} ms`));
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Key cache R/W
// ---------------------------------------------------------------------------

function readKeyFromCache(kid: string, factoryRoot: string): crypto.JsonWebKey | null {
  const cachePath = path.join(factoryRoot, KEY_CACHE_FILE);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cache: KeyCache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const entry = cache[kid];
    if (!entry) return null;
    if (Math.floor(Date.now() / 1000) >= entry.cached_at + KEY_CACHE_TTL) return null;
    return entry.jwk;
  } catch {
    return null;
  }
}

function writeKeyToCache(kid: string, jwk: crypto.JsonWebKey, factoryRoot: string): void {
  try {
    const cachePath = path.join(factoryRoot, KEY_CACHE_FILE);
    let cache: KeyCache = {};
    if (fs.existsSync(cachePath)) {
      try { cache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch { /* ignore */ }
    }
    cache[kid] = { jwk, cached_at: Math.floor(Date.now() / 1000) };
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {
    // non-fatal — we'll just refetch next time
  }
}

// ---------------------------------------------------------------------------
// Key resolution
// ---------------------------------------------------------------------------

async function resolvePublicKey(kid: string, factoryRoot?: string): Promise<crypto.JsonWebKey> {
  // 1. Local JWK override (air-gap path)
  if (factoryRoot) {
    const localPath = path.join(factoryRoot, LOCAL_JWK_FILE);
    if (fs.existsSync(localPath)) {
      try {
        const jwk = JSON.parse(fs.readFileSync(localPath, "utf-8")) as crypto.JsonWebKey;
        // Accept if no kid field, or kid matches
        if (!jwk.kid || jwk.kid === kid) return jwk;
      } catch {
        // fall through
      }
    }

    // 2. Key cache
    const cached = readKeyFromCache(kid, factoryRoot);
    if (cached) return cached;
  }

  // 3. Network fetch
  const jwk = await fetchKeyFromNetwork(kid);
  if (factoryRoot) writeKeyToCache(kid, jwk, factoryRoot);
  return jwk;
}

// ---------------------------------------------------------------------------
// License cache R/W
// ---------------------------------------------------------------------------

function readLicenseCache(factoryRoot: string, token: string): LicenseCache | null {
  const cachePath = path.join(factoryRoot, LICENSE_CACHE_FILE);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cache: LicenseCache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const now = Math.floor(Date.now() / 1000);
    if (!cache.token_hash || cache.token_hash !== tokenHash(token)) return null;
    if (now < cache.cache_until && now < cache.exp) return cache;
    return null;
  } catch {
    return null;
  }
}

function tierFromClaim(tierClaim: string): Tier {
  if (tierClaim === "pro" || tierClaim === "pro_annual" || tierClaim === "lifetime") return "pro";
  if (tierClaim === "teams" || tierClaim === "teams_annual") return "teams";
  return "core";
}

function writeLicenseCache(factoryRoot: string, payload: JwtPayload, kid: string): void {
  try {
    const now = Math.floor(Date.now() / 1000);
    const { token } = resolveToken(factoryRoot);
    if (!token) return;
    const cache: LicenseCache = {
      kid,
      sub: payload.sub,
      tier: tierFromClaim(payload.tier),
      exp: payload.exp,
      token_hash: tokenHash(token),
      verified_at: now,
      cache_until: now + LICENSE_CACHE_TTL,
    };
    if (payload.org) cache.org_id = payload.org;
    if (payload.seats != null) cache.seat_count = payload.seats;
    const cachePath = path.join(factoryRoot, LICENSE_CACHE_FILE);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Token resolution (where to look for the raw JWT)
// ---------------------------------------------------------------------------

function resolveToken(factoryRoot?: string): {
  token: string | null;
  source: "env" | "file" | undefined;
  licenseFilePath?: string;
} {
  const envVal = process.env[ENV_VAR];
  if (envVal !== undefined) {
    return { token: envVal.trim() || null, source: "env" };
  }
  if (factoryRoot) {
    const filePath = path.join(factoryRoot, LICENSE_FILE);
    if (fs.existsSync(filePath)) {
      const token = fs.readFileSync(filePath, "utf-8").trim();
      return { token: token || null, source: "file", licenseFilePath: filePath };
    }
  }
  return { token: null, source: undefined };
}

export function getLicenseFilePath(factoryRoot: string): string {
  return path.join(factoryRoot, LICENSE_FILE);
}

export function getLicenseCacheFilePath(factoryRoot: string): string {
  return path.join(factoryRoot, LICENSE_CACHE_FILE);
}

export function writeLicenseToken(factoryRoot: string, token: string): { path: string } {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("License key cannot be empty");
  }

  const licensePath = getLicenseFilePath(factoryRoot);
  fs.mkdirSync(path.dirname(licensePath), { recursive: true });
  fs.writeFileSync(licensePath, `${trimmed}\n`, { mode: 0o600 });
  clearLicenseCache(factoryRoot);
  return { path: licensePath };
}

export function clearLicenseToken(factoryRoot: string): { path: string; removed: boolean } {
  const licensePath = getLicenseFilePath(factoryRoot);
  const removed = fs.existsSync(licensePath);
  if (removed) {
    fs.unlinkSync(licensePath);
  }
  clearLicenseCache(factoryRoot);
  return { path: licensePath, removed };
}

export function clearLicenseCache(factoryRoot: string): void {
  const cachePath = getLicenseCacheFilePath(factoryRoot);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
}

// ---------------------------------------------------------------------------
// Tier detection  (main public API)
// ---------------------------------------------------------------------------

/**
 * Detect the current license tier by verifying a signed JWT license token.
 *
 * @param factoryRoot  Absolute path to the factory workspace root.
 *                     When omitted, file-based token and cache lookups are skipped.
 */
export async function getLicenseStatus(factoryRoot?: string): Promise<LicenseStatus> {
  // 1. Find the raw token
  const { token, source, licenseFilePath } = resolveToken(factoryRoot);
  const cacheFilePath = factoryRoot ? getLicenseCacheFilePath(factoryRoot) : undefined;
  const sourceLabel =
    source === "env" ? ENV_VAR
    : source === "file" ? ".devory/license"
    : undefined;

  if (!token) {
    return {
      tier: "core",
      reason: "No license key found — running on Core tier",
      hasKey: false,
      source,
      sourceLabel,
      envVarName: ENV_VAR,
      licenseFilePath,
      cacheFilePath,
      cacheUsed: false,
      fallbackToCore: false,
    };
  }

  // 2. License cache hit — skip re-verification
  if (factoryRoot) {
    const cached = readLicenseCache(factoryRoot, token);
    if (cached) {
      return {
        tier: cached.tier,
        hasKey: true,
        key: token,
        source,
        sourceLabel,
        envVarName: ENV_VAR,
        licenseFilePath,
        cacheFilePath,
        cacheUsed: true,
        fallbackToCore: false,
        userId: cached.sub,
        kid: cached.kid,
        expiresAt: new Date(cached.exp * 1000).toISOString(),
        orgId: cached.org_id,
        seatCount: cached.seat_count,
        reason: `License verified from cache (user: ${cached.sub}, expires: ${new Date(cached.exp * 1000).toISOString().slice(0, 10)})`,
      };
    }
  }

  // 3. Parse JWT structure
  let parsed: ParsedJwt;
  try {
    parsed = parseJwt(token);
  } catch (err) {
    return {
      tier: "core",
      hasKey: true,
      key: token,
      source,
      sourceLabel,
      envVarName: ENV_VAR,
      licenseFilePath,
      cacheFilePath,
      cacheUsed: false,
      fallbackToCore: true,
      invalid: true,
      reason: `License token is malformed: ${err instanceof Error ? err.message : String(err)} — falling back to Core tier`,
    };
  }

  // 4. Check expiry before touching the network
  const now = Math.floor(Date.now() / 1000);
  if (now >= parsed.payload.exp) {
    return {
      tier: "core",
      hasKey: true,
      key: token,
      source,
      sourceLabel,
      envVarName: ENV_VAR,
      licenseFilePath,
      cacheFilePath,
      cacheUsed: false,
      fallbackToCore: true,
      invalid: true,
      expiresAt: new Date(parsed.payload.exp * 1000).toISOString(),
      kid: parsed.header.kid,
      reason: "License token has expired — please renew your license",
    };
  }

  // 5. Resolve the public key (local override → cache → network)
  let jwk: crypto.JsonWebKey;
  try {
    jwk = await resolvePublicKey(parsed.header.kid, factoryRoot);
  } catch (err) {
    return {
      tier: "core",
      hasKey: true,
      key: token,
      source,
      sourceLabel,
      envVarName: ENV_VAR,
      licenseFilePath,
      cacheFilePath,
      cacheUsed: false,
      fallbackToCore: true,
      invalid: true,
      expiresAt: new Date(parsed.payload.exp * 1000).toISOString(),
      kid: parsed.header.kid,
      reason: `Could not resolve public key for kid "${parsed.header.kid}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 6. Verify signature
  if (!verifyRs256(parsed.signingInput, parsed.signatureBytes, jwk)) {
    return {
      tier: "core",
      hasKey: true,
      key: token,
      source,
      sourceLabel,
      envVarName: ENV_VAR,
      licenseFilePath,
      cacheFilePath,
      cacheUsed: false,
      fallbackToCore: true,
      invalid: true,
      expiresAt: new Date(parsed.payload.exp * 1000).toISOString(),
      kid: parsed.header.kid,
      reason: "License token signature is invalid — token may have been tampered with",
    };
  }

  // 7. Write license cache
  if (factoryRoot) {
    writeLicenseCache(factoryRoot, parsed.payload, parsed.header.kid);
  }

  // 8. Return verified result
  const tier: Tier = tierFromClaim(parsed.payload.tier);
  const tierLabel = tier === "teams" ? "Teams" : "Pro";
  const result: LicenseStatus = {
    tier,
    hasKey: true,
    key: token,
    source,
    sourceLabel,
    envVarName: ENV_VAR,
    licenseFilePath,
    cacheFilePath,
    cacheUsed: false,
    fallbackToCore: false,
    userId: parsed.payload.sub,
    expiresAt: new Date(parsed.payload.exp * 1000).toISOString(),
    kid: parsed.header.kid,
    reason: `Valid ${tierLabel} license (user: ${parsed.payload.sub}, expires: ${new Date(parsed.payload.exp * 1000).toISOString().slice(0, 10)})`,
  };
  if (parsed.payload.org) result.orgId = parsed.payload.org;
  if (parsed.payload.seats != null) result.seatCount = parsed.payload.seats;
  return result;
}

export async function detectTier(factoryRoot?: string): Promise<LicenseInfo> {
  const status = await getLicenseStatus(factoryRoot);
  return {
    tier: status.tier,
    key: status.key,
    source: status.source,
    invalid: status.invalid,
    reason: status.reason,
    userId: status.userId,
    orgId: status.orgId,
    seatCount: status.seatCount,
  };
}

// ---------------------------------------------------------------------------
// Feature gating
// ---------------------------------------------------------------------------

/**
 * Returns true if the given Pro feature is enabled for the current tier.
 */
export function isFeatureEnabled(feature: ProFeature, info: LicenseInfo): boolean {
  switch (feature) {
    case "custom_rules":
    case "baseline_overrides":
    case "shared_doctrine":
    case "pr_gates":
      return info.tier === "pro" || info.tier === "teams";
  }
}

/**
 * One-line advisory shown to Core users when a Pro-only field is configured.
 */
export function tierGateMessage(feature: ProFeature): string {
  const featureLabel: Record<ProFeature, string> = {
    custom_rules: "custom_rules in devory.standards.yml",
    baseline_overrides: "baseline overrides",
    shared_doctrine: "shared doctrine",
    pr_gates: "PR gates",
  };
  return (
    `[devory] ${featureLabel[feature]} requires a Pro or Teams license — ` +
    `set DEVORY_LICENSE_KEY or create .devory/license to upgrade. ` +
    `This setting will be ignored on Core tier.`
  );
}
