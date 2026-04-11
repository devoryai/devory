import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BALANCED_DEFAULT_PRESET,
  DEFAULT_PROFILE_ID,
  FAST_PROTOTYPING_PRESET,
  PROFILE_PRESETS,
  PRODUCTION_SAFE_PRESET,
  getPresetById,
} from "./profile-presets.ts";

describe("profile presets", () => {
  it("exports the three immutable built-in presets", () => {
    assert.equal(PROFILE_PRESETS.length, 3);
    assert.equal(FAST_PROTOTYPING_PRESET.profile_id, "fast-prototyping");
    assert.equal(BALANCED_DEFAULT_PRESET.profile_id, "balanced-default");
    assert.equal(PRODUCTION_SAFE_PRESET.profile_id, "production-safe");
    assert.equal(DEFAULT_PROFILE_ID, "balanced-default");
  });

  it("uses required values for fast, balanced, and safe preset defaults", () => {
    assert.equal(FAST_PROTOTYPING_PRESET.risk_tolerance, "fast");
    assert.equal(FAST_PROTOTYPING_PRESET.validation_strictness, "minimal");
    assert.equal(FAST_PROTOTYPING_PRESET.planning_depth, "shallow");
    assert.deepEqual(FAST_PROTOTYPING_PRESET.required_artifacts, []);

    assert.equal(BALANCED_DEFAULT_PRESET.risk_tolerance, "balanced");
    assert.equal(BALANCED_DEFAULT_PRESET.validation_strictness, "standard");
    assert.equal(BALANCED_DEFAULT_PRESET.planning_depth, "standard");
    assert.deepEqual(BALANCED_DEFAULT_PRESET.required_artifacts, ["working-brief"]);

    assert.equal(PRODUCTION_SAFE_PRESET.risk_tolerance, "safe");
    assert.equal(PRODUCTION_SAFE_PRESET.validation_strictness, "strict");
    assert.equal(PRODUCTION_SAFE_PRESET.planning_depth, "deep");
    assert.deepEqual(PRODUCTION_SAFE_PRESET.required_artifacts, [
      "working-brief",
      "implementation-plan",
      "validation-notes",
    ]);
  });

  it("returns presets by id and null for unknown ids", () => {
    assert.equal(getPresetById("balanced-default")?.name, "Balanced Default");
    assert.equal(getPresetById("missing-profile"), null);
  });
});