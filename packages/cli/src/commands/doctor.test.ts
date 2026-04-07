/**
 * packages/cli/src/commands/doctor.test.ts
 *
 * Tests for the `devory doctor` command.
 *
 * Covers:
 *   - parseArgs: valid and invalid inputs
 *   - runChecks: healthy factory (all pass)
 *   - runChecks: misconfigured factory (missing files/dirs produce fails/warns)
 *   - checkTaskStages: all stages present vs. missing stages
 *   - checkStandardsFile: present vs. missing
 *   - checkRuntimeConfig: DEVORY_FACTORY_ROOT set vs. unset
 *
 * Run from factory root: tsx --test packages/cli/src/commands/doctor.test.ts
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  parseArgs,
  runChecks,
  checkTaskStages,
  checkStandardsFile,
  checkRuntimeConfig,
} from "./doctor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MakeWorkspaceOpts {
  contextFile?: boolean;
  allStages?: boolean;
  someStages?: string[];
  standardsFile?: boolean;
  licenseFile?: boolean;
}

function makeWorkspace(opts: MakeWorkspaceOpts = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devory-doctor-"));
  fs.mkdirSync(path.join(root, ".devory"), { recursive: true });

  if (opts.contextFile !== false) {
    fs.writeFileSync(path.join(root, "FACTORY_CONTEXT.md"), "# Test");
  }

  const stages = opts.allStages !== false
    ? (opts.someStages ?? ["backlog", "ready", "doing", "review", "done", "blocked", "archived"])
    : (opts.someStages ?? []);

  for (const stage of stages) {
    fs.mkdirSync(path.join(root, "tasks", stage), { recursive: true });
  }

  if (opts.standardsFile !== false) {
    fs.writeFileSync(path.join(root, "devory.standards.yml"), "version: '1'\n");
  }

  if (opts.licenseFile) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "test-kid" };
    fs.writeFileSync(path.join(root, ".devory", "license.jwk"), JSON.stringify(jwk));
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT", kid: "test-kid" };
    const payload = { sub: "user-test", tier: "pro", iat: now, exp: now + 3600 };
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const sigInput = `${encode(header)}.${encode(payload)}`;
    const sig = crypto.createSign("RSA-SHA256").update(sigInput).sign(privateKey).toString("base64url");
    fs.writeFileSync(path.join(root, ".devory", "license"), `${sigInput}.${sig}`);
  }

  return root;
}

// Save and restore env
const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  for (const key of Object.keys(savedEnv)) {
    delete savedEnv[key];
  }
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("doctor — parseArgs", () => {
  test("no args → empty args, no error", () => {
    const result = parseArgs([]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { root: undefined });
  });

  test("--root <path> is parsed", () => {
    const result = parseArgs(["--root", "/some/path"]);
    assert.equal(result.error, null);
    assert.equal(result.args?.root, "/some/path");
  });

  test("--root without value → error", () => {
    const result = parseArgs(["--root"]);
    assert.ok(result.error);
  });

  test("unknown flag → error", () => {
    const result = parseArgs(["--unknown"]);
    assert.ok(result.error);
  });
});

// ---------------------------------------------------------------------------
// checkTaskStages
// ---------------------------------------------------------------------------

describe("doctor — checkTaskStages", () => {
  test("all stages present → pass", () => {
    const root = makeWorkspace({ allStages: true });
    const result = checkTaskStages(root);
    assert.equal(result.status, "pass");
    assert.ok(result.detail.includes("all stages present"));
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("some stages missing → warn with names", () => {
    const root = makeWorkspace({ someStages: ["backlog", "done"] });
    const result = checkTaskStages(root);
    assert.equal(result.status, "warn");
    assert.ok(result.detail.includes("ready"));
    assert.ok(result.detail.includes("doing"));
    assert.ok(result.detail.includes("review"));
    assert.ok(result.detail.includes("blocked"));
    assert.ok(result.detail.includes("archived"));
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("tasks/ dir missing → fail", () => {
    const root = makeWorkspace({ allStages: false, someStages: [] });
    const result = checkTaskStages(root);
    assert.equal(result.status, "fail");
    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// checkStandardsFile
// ---------------------------------------------------------------------------

describe("doctor — checkStandardsFile", () => {
  test("devory.standards.yml present → pass", () => {
    const root = makeWorkspace({ standardsFile: true });
    const result = checkStandardsFile(root);
    assert.equal(result.status, "pass");
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("devory.standards.yml missing → warn", () => {
    const root = makeWorkspace({ standardsFile: false });
    const result = checkStandardsFile(root);
    assert.equal(result.status, "warn");
    assert.ok(result.detail.includes("not found"));
    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// checkRuntimeConfig
// ---------------------------------------------------------------------------

describe("doctor — checkRuntimeConfig", () => {
  test("DEVORY_FACTORY_ROOT set → pass with root in detail", () => {
    setEnv("DEVORY_FACTORY_ROOT", "/srv/factory");
    setEnv("FACTORY_ROOT", undefined);
    const result = checkRuntimeConfig();
    assert.equal(result.status, "pass");
    assert.ok(result.detail.includes("/srv/factory"));
    assert.ok(result.detail.includes("mode:"));
  });

  test("FACTORY_ROOT fallback set → pass", () => {
    setEnv("DEVORY_FACTORY_ROOT", undefined);
    setEnv("FACTORY_ROOT", "/alt/factory");
    const result = checkRuntimeConfig();
    assert.equal(result.status, "pass");
    assert.ok(result.detail.includes("/alt/factory"));
  });

  test("neither root env set → warn", () => {
    setEnv("DEVORY_FACTORY_ROOT", undefined);
    setEnv("FACTORY_ROOT", undefined);
    const result = checkRuntimeConfig();
    assert.equal(result.status, "warn");
    assert.ok(result.detail.includes("DEVORY_FACTORY_ROOT not set"));
  });

  test("DEVORY_FACTORY_MODE is reflected in detail", () => {
    setEnv("DEVORY_FACTORY_ROOT", "/srv/factory");
    setEnv("DEVORY_FACTORY_MODE", "hosted");
    const result = checkRuntimeConfig();
    assert.ok(result.detail.includes("hosted"));
  });
});

// ---------------------------------------------------------------------------
// runChecks — healthy factory
// ---------------------------------------------------------------------------

describe("doctor — healthy factory", () => {
  test("fully configured workspace returns all pass (or warn for optional items)", async () => {
    const root = makeWorkspace({ licenseFile: true, allStages: true, standardsFile: true });

    setEnv("DEVORY_FACTORY_ROOT", root);
    setEnv("DEVORY_FACTORY_MODE", "local");

    const report = await runChecks(root, "env");
    const byLabel = Object.fromEntries(report.checks.map((c) => [c.label, c]));

    assert.equal(byLabel["Factory root"].status, "pass");
    assert.equal(byLabel["FACTORY_CONTEXT.md"].status, "pass");
    assert.equal(byLabel["Task stage dirs"].status, "pass");
    assert.equal(byLabel["devory.standards.yml"].status, "pass");
    assert.equal(byLabel["License"].status, "pass");
    assert.equal(byLabel["Runtime config"].status, "pass");

    // No fails
    assert.ok(!report.checks.some((c) => c.status === "fail"));

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// runChecks — misconfigured factory
// ---------------------------------------------------------------------------

describe("doctor — misconfigured factory", () => {
  test("missing context file, no tasks/, no standards → multiple fails/warns", async () => {
    const root = makeWorkspace({ contextFile: false, allStages: false, someStages: [], standardsFile: false });

    setEnv("DEVORY_FACTORY_ROOT", undefined);
    setEnv("FACTORY_ROOT", undefined);

    const report = await runChecks(root, "cwd");
    const byLabel = Object.fromEntries(report.checks.map((c) => [c.label, c]));

    assert.equal(byLabel["Factory root"].status, "warn");       // cwd fallback
    assert.equal(byLabel["FACTORY_CONTEXT.md"].status, "fail"); // missing
    assert.equal(byLabel["Task stage dirs"].status, "fail");    // tasks/ missing
    assert.equal(byLabel["devory.standards.yml"].status, "warn"); // missing but not blocking
    assert.equal(byLabel["Runtime config"].status, "warn");     // no env set

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("partially configured stages produces warn not fail", async () => {
    const root = makeWorkspace({ allStages: false, someStages: ["backlog", "done"], standardsFile: true });

    setEnv("DEVORY_FACTORY_ROOT", root);

    const report = await runChecks(root, "env");
    const byLabel = Object.fromEntries(report.checks.map((c) => [c.label, c]));

    assert.equal(byLabel["Task stage dirs"].status, "warn");
    assert.ok(byLabel["Task stage dirs"].detail.includes("ready"));

    fs.rmSync(root, { recursive: true, force: true });
  });
});
