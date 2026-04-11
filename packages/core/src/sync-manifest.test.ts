import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSyncManifest } from "./sync-manifest";

const T1 = "2026-03-01T10:00:00.000Z";
const T2 = "2026-03-15T12:00:00.000Z";

describe("buildSyncManifest", () => {
  it("marks local-only items", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "working-brief", updated_at: T1 }],
      [],
    );
    assert.equal(manifest.entries.length, 1);
    assert.equal(manifest.entries[0]?.status, "local-only");
    assert.equal(manifest.push_count, 1);
    assert.equal(manifest.pull_count, 0);
  });

  it("marks cloud-only items", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [],
      [{ artifact_id: "a1", artifact_type: "working-brief", updated_at: T1 }],
    );
    assert.equal(manifest.entries[0]?.status, "cloud-only");
    assert.equal(manifest.pull_count, 1);
    assert.equal(manifest.push_count, 0);
  });

  it("marks in-sync items when timestamps match", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
    );
    assert.equal(manifest.entries[0]?.status, "in-sync");
    assert.equal(manifest.in_sync_count, 1);
    assert.equal(manifest.push_count, 0);
    assert.equal(manifest.pull_count, 0);
  });

  it("marks local-newer when local timestamp is later", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T2 }],
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
    );
    assert.equal(manifest.entries[0]?.status, "local-newer");
    assert.equal(manifest.push_count, 1);
  });

  it("marks cloud-newer when cloud timestamp is later", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T2 }],
    );
    assert.equal(manifest.entries[0]?.status, "cloud-newer");
    assert.equal(manifest.pull_count, 1);
  });

  it("correctly counts across mixed statuses", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [
        { artifact_id: "a1", artifact_type: "working-brief", updated_at: T2 },
        { artifact_id: "a2", artifact_type: "profile", updated_at: T1 },
        { artifact_id: "a3", artifact_type: "planning-draft", updated_at: T1 },
      ],
      [
        { artifact_id: "a2", artifact_type: "profile", updated_at: T1 },
        { artifact_id: "a3", artifact_type: "planning-draft", updated_at: T2 },
        { artifact_id: "a4", artifact_type: "work-context", updated_at: T1 },
      ],
    );
    // a1: local-only (push), a2: in-sync, a3: cloud-newer (pull), a4: cloud-only (pull)
    assert.equal(manifest.push_count, 1); // a1
    assert.equal(manifest.pull_count, 2); // a3, a4
    assert.equal(manifest.in_sync_count, 1); // a2
    assert.equal(manifest.entries.length, 4);
  });

  it("includes workspace_id and generated_at", () => {
    const manifest = buildSyncManifest("ws-42", [], []);
    assert.equal(manifest.workspace_id, "ws-42");
    assert.match(manifest.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  });
});
