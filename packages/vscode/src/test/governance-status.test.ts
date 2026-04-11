import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  readGovernanceStatus,
  formatGovernanceStatusBarText,
  formatGovernanceStatusSummary,
} from "../lib/governance-status.js";

let tempRoot = "";

const originalEnv = {
  DEVORY_GOVERNANCE_REPO_ENABLED: process.env.DEVORY_GOVERNANCE_REPO_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devory-vscode-governance-"));
  delete process.env.DEVORY_GOVERNANCE_REPO_ENABLED;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.env.DEVORY_GOVERNANCE_REPO_ENABLED = originalEnv.DEVORY_GOVERNANCE_REPO_ENABLED;
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = originalEnv.SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
});

describe("governance status snapshot", () => {
  test("reports OFF with helpful guidance when unconfigured", () => {
    const snapshot = readGovernanceStatus(tempRoot);
    assert.equal(snapshot.indicator, "OFF");
    assert.equal(snapshot.governanceModeOn, false);
    assert.equal(snapshot.workspaceId, null);
    assert.match(snapshot.nextStep ?? "", /bind/i);
    assert.equal(formatGovernanceStatusBarText(snapshot), "Governance: OFF");
  });

  test("reports ON and includes workspace id when governance is fully configured", () => {
    const governanceRepo = path.join(tempRoot, "gov");
    writeJson(path.join(tempRoot, ".devory", "feature-flags.json"), {
      governance_repo_enabled: true,
    });
    writeJson(path.join(tempRoot, ".devory", "governance.json"), {
      schema_version: "1",
      governance_repo_path: governanceRepo,
      workspace_id: "my-workspace",
      bound_working_repo: tempRoot,
      bound_at: new Date().toISOString(),
    });
    writeJson(path.join(governanceRepo, ".devory-governance", "config.json"), {
      schema_version: "1",
      workspace_id: "my-workspace",
      created_at: new Date().toISOString(),
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const snapshot = readGovernanceStatus(tempRoot);
    assert.equal(snapshot.indicator, "ON");
    assert.equal(snapshot.workspaceId, "my-workspace");
    assert.equal(formatGovernanceStatusBarText(snapshot), "Governance: ON (my-workspace)");

    const summary = formatGovernanceStatusSummary(snapshot);
    assert.match(summary, /Governance mode: ON/);
    assert.match(summary, /Cloud commands: READY/);
  });

  test("reports local fallback separately while governance remains ON", () => {
    const governanceRepo = path.join(tempRoot, "gov");
    writeJson(path.join(tempRoot, ".devory", "feature-flags.json"), {
      governance_repo_enabled: true,
    });
    writeJson(path.join(tempRoot, ".devory", "governance.json"), {
      schema_version: "1",
      governance_repo_path: governanceRepo,
      workspace_id: "workspace-2",
      bound_working_repo: tempRoot,
      bound_at: new Date().toISOString(),
    });
    writeJson(path.join(governanceRepo, ".devory-governance", "config.json"), {
      schema_version: "1",
      workspace_id: "workspace-2",
      created_at: new Date().toISOString(),
    });

    const snapshot = readGovernanceStatus(tempRoot);
    assert.equal(snapshot.indicator, "ON");
    assert.equal(snapshot.governanceModeOn, true);

    const summary = formatGovernanceStatusSummary(snapshot);
    assert.match(summary, /Cloud commands: LOCAL FALLBACK/);
  });

  test("reports ERROR for malformed governance binding", () => {
    fs.mkdirSync(path.join(tempRoot, ".devory"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".devory", "governance.json"), "{", "utf-8");

    const snapshot = readGovernanceStatus(tempRoot);
    assert.equal(snapshot.indicator, "ERROR");
    assert.match(formatGovernanceStatusBarText(snapshot), /ERROR/);
    assert.match(formatGovernanceStatusSummary(snapshot), /Error:/);
  });
});
