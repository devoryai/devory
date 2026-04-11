import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evaluateGovernanceCommandTransport } from "./command-transport.ts";

describe("evaluateGovernanceCommandTransport", () => {
  test("selects Supabase when runtime credentials are configured", () => {
    const result = evaluateGovernanceCommandTransport({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
      runtimeReady: true,
    });

    assert.equal(result.mode, "supabase");
    assert.equal(result.summary, "Cloud commands: READY (Supabase)");
  });

  test("falls back to local queue when Supabase runtime credentials are missing", () => {
    const result = evaluateGovernanceCommandTransport({
      env: {},
      runtimeReady: true,
    });

    assert.equal(result.mode, "local-fallback");
    assert.match(result.summary, /LOCAL FALLBACK/);
  });

  test("reports not ready when governance runtime is inactive", () => {
    const result = evaluateGovernanceCommandTransport({
      env: {},
      runtimeReady: false,
    });

    assert.equal(result.mode, "not-ready");
    assert.equal(result.summary, "Cloud commands: NOT READY");
  });
});
