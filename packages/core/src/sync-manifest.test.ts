import { buildSyncManifest, SyncManifest } from "./sync-manifest";

const T1 = "2026-03-01T10:00:00.000Z";
const T2 = "2026-03-15T12:00:00.000Z";

describe("buildSyncManifest", () => {
  it("marks local-only items", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "working-brief", updated_at: T1 }],
      [],
    );
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].status).toBe("local-only");
    expect(manifest.push_count).toBe(1);
    expect(manifest.pull_count).toBe(0);
  });

  it("marks cloud-only items", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [],
      [{ artifact_id: "a1", artifact_type: "working-brief", updated_at: T1 }],
    );
    expect(manifest.entries[0].status).toBe("cloud-only");
    expect(manifest.pull_count).toBe(1);
    expect(manifest.push_count).toBe(0);
  });

  it("marks in-sync items when timestamps match", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
    );
    expect(manifest.entries[0].status).toBe("in-sync");
    expect(manifest.in_sync_count).toBe(1);
    expect(manifest.push_count).toBe(0);
    expect(manifest.pull_count).toBe(0);
  });

  it("marks local-newer when local timestamp is later", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T2 }],
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
    );
    expect(manifest.entries[0].status).toBe("local-newer");
    expect(manifest.push_count).toBe(1);
  });

  it("marks cloud-newer when cloud timestamp is later", () => {
    const manifest = buildSyncManifest(
      "ws-1",
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T1 }],
      [{ artifact_id: "a1", artifact_type: "profile", updated_at: T2 }],
    );
    expect(manifest.entries[0].status).toBe("cloud-newer");
    expect(manifest.pull_count).toBe(1);
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
    expect(manifest.push_count).toBe(1); // a1
    expect(manifest.pull_count).toBe(2); // a3, a4
    expect(manifest.in_sync_count).toBe(1); // a2
    expect(manifest.entries).toHaveLength(4);
  });

  it("includes workspace_id and generated_at", () => {
    const manifest = buildSyncManifest("ws-42", [], []);
    expect(manifest.workspace_id).toBe("ws-42");
    expect(manifest.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
