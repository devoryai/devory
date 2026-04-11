import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildEngineeringProfileFixture,
  normalizeEngineeringProfile,
} from "./engineering-profile.ts";

describe("normalizeEngineeringProfile", () => {
  it("returns a valid profile for well-formed input", () => {
    const value = normalizeEngineeringProfile({
      profile_id: "fast-prototype",
      workspace_id: null,
      name: "Fast Prototype",
      description: "Speed-first profile",
      is_preset: true,
      risk_tolerance: "fast",
      planning_depth: "shallow",
      validation_strictness: "minimal",
      required_artifacts: ["smoke-test"],
      enabled_skills: ["rapid-iteration"],
      stack_assumptions: ["React"],
      max_cost_tier: "standard",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    assert.ok(value);
    assert.equal(value?.risk_tolerance, "fast");
    assert.equal(value?.workspace_id, null);
  });

  it("normalizes partial input with defaults", () => {
    const value = normalizeEngineeringProfile({
      profile_id: "custom-safe",
      workspace_id: "workspace-1",
      name: "Custom Safe",
      is_preset: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    assert.ok(value);
    assert.equal(value?.risk_tolerance, "balanced");
    assert.equal(value?.planning_depth, "standard");
    assert.equal(value?.validation_strictness, "standard");
    assert.deepEqual(value?.required_artifacts, []);
    assert.equal(value?.max_cost_tier, "standard");
  });

  it("returns null for invalid input", () => {
    assert.equal(
      normalizeEngineeringProfile({
        profile_id: "broken",
        workspace_id: "workspace-1",
        name: "Broken",
        is_preset: true,
        risk_tolerance: "unsafe",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      null
    );
  });
});

describe("buildEngineeringProfileFixture", () => {
  it("returns a valid fixture without arguments", () => {
    const fixture = buildEngineeringProfileFixture();
    assert.equal(fixture.profile_id, "balanced-default");
    assert.equal(fixture.is_preset, true);
    assert.equal(fixture.workspace_id, null);
  });
});