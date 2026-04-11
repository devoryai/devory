import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveStateFixture,
  buildDefaultActiveState,
  normalizeActiveDevoryState,
} from "./active-state.ts";

describe("normalizeActiveDevoryState", () => {
  it("returns a valid active state for well-formed input", () => {
    const state = normalizeActiveDevoryState({
      workspace_id: "default",
      profile_id: "balanced-default",
      context_id: "ctx-1",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    assert.ok(state);
    assert.equal(state?.workspace_id, "default");
    assert.equal(state?.context_id, "ctx-1");
  });

  it("returns null for invalid records", () => {
    assert.equal(normalizeActiveDevoryState({ profile_id: "balanced-default" }), null);
    assert.equal(normalizeActiveDevoryState({ workspace_id: "default" }), null);
  });
});

describe("active state builders", () => {
  it("buildDefaultActiveState returns default ids", () => {
    const value = buildDefaultActiveState();
    assert.equal(value.workspace_id, "default");
    assert.equal(value.profile_id, "balanced-default");
    assert.ok(value.updated_at.length > 0);
  });

  it("buildActiveStateFixture returns a valid fixture without args", () => {
    const fixture = buildActiveStateFixture();
    assert.equal(fixture.workspace_id, "default");
    assert.equal(fixture.profile_id, "balanced-default");
  });
});