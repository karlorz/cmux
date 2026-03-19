import { describe, expect, it } from "vitest";
import {
  modalSnapshotVersionSchema,
  modalSnapshotManifestSchema,
  MODAL_SNAPSHOT_MANIFEST,
  DEFAULT_MODAL_SNAPSHOT_ID,
  getModalSnapshotById,
} from "./modal-snapshots";

describe("modalSnapshotVersionSchema", () => {
  it("validates a correct snapshot version", () => {
    const valid = {
      snapshotId: "im-abc123",
      version: 1,
      image: "python:3.13-slim",
      capturedAt: "2026-02-12T00:00:00Z",
    };

    const result = modalSnapshotVersionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid snapshotId format", () => {
    const invalid = {
      snapshotId: "invalid-id",
      version: 1,
      image: "python:3.13-slim",
      capturedAt: "2026-02-12T00:00:00Z",
    };

    const result = modalSnapshotVersionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive version", () => {
    const invalid = {
      snapshotId: "im-abc123",
      version: 0,
      image: "python:3.13-slim",
      capturedAt: "2026-02-12T00:00:00Z",
    };

    const result = modalSnapshotVersionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid ISO date", () => {
    const invalid = {
      snapshotId: "im-abc123",
      version: 1,
      image: "python:3.13-slim",
      capturedAt: "not-a-date",
    };

    const result = modalSnapshotVersionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("modalSnapshotManifestSchema", () => {
  it("validates a correct manifest", () => {
    const valid = {
      schemaVersion: 1,
      updatedAt: "2026-02-13T06:03:13.951Z",
      snapshots: [
        {
          snapshotId: "im-abc123",
          version: 1,
          image: "test:latest",
          capturedAt: "2026-02-12T00:00:00Z",
        },
      ],
    };

    const result = modalSnapshotManifestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects manifest with empty snapshots array", () => {
    const invalid = {
      schemaVersion: 1,
      updatedAt: "2026-02-13T06:03:13.951Z",
      snapshots: [],
    };

    const result = modalSnapshotManifestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects manifest with invalid schema version", () => {
    const invalid = {
      schemaVersion: 0,
      updatedAt: "2026-02-13T06:03:13.951Z",
      snapshots: [
        {
          snapshotId: "im-abc123",
          version: 1,
          image: "test:latest",
          capturedAt: "2026-02-12T00:00:00Z",
        },
      ],
    };

    const result = modalSnapshotManifestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("MODAL_SNAPSHOT_MANIFEST", () => {
  it("is a valid manifest", () => {
    expect(MODAL_SNAPSHOT_MANIFEST).toBeDefined();
    expect(MODAL_SNAPSHOT_MANIFEST.schemaVersion).toBeGreaterThan(0);
    expect(MODAL_SNAPSHOT_MANIFEST.snapshots.length).toBeGreaterThan(0);
  });

  it("has valid updatedAt timestamp", () => {
    expect(Date.parse(MODAL_SNAPSHOT_MANIFEST.updatedAt)).not.toBeNaN();
  });

  it("all snapshots have valid structure", () => {
    for (const snapshot of MODAL_SNAPSHOT_MANIFEST.snapshots) {
      expect(snapshot.snapshotId).toMatch(/^im-[a-zA-Z0-9]+$/);
      expect(snapshot.version).toBeGreaterThan(0);
      expect(snapshot.image).toBeTruthy();
      expect(Date.parse(snapshot.capturedAt)).not.toBeNaN();
    }
  });
});

describe("DEFAULT_MODAL_SNAPSHOT_ID", () => {
  it("is a valid snapshot ID format", () => {
    expect(DEFAULT_MODAL_SNAPSHOT_ID).toMatch(/^im-[a-zA-Z0-9]+$/);
  });

  it("corresponds to the highest version snapshot", () => {
    const sortedSnapshots = [...MODAL_SNAPSHOT_MANIFEST.snapshots].sort(
      (a, b) => a.version - b.version
    );
    const latestSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
    expect(DEFAULT_MODAL_SNAPSHOT_ID).toBe(latestSnapshot?.snapshotId);
  });

  it("is a snapshot that exists in the manifest", () => {
    const snapshot = getModalSnapshotById(DEFAULT_MODAL_SNAPSHOT_ID);
    expect(snapshot).toBeDefined();
  });
});

describe("getModalSnapshotById", () => {
  it("returns undefined for non-existent ID", () => {
    expect(getModalSnapshotById("im-nonexistent")).toBeUndefined();
  });

  it("returns undefined for invalid ID format", () => {
    expect(getModalSnapshotById("invalid")).toBeUndefined();
  });

  it("returns the correct snapshot for existing ID", () => {
    const firstSnapshot = MODAL_SNAPSHOT_MANIFEST.snapshots[0];
    const result = getModalSnapshotById(firstSnapshot.snapshotId);

    expect(result).toBeDefined();
    expect(result?.snapshotId).toBe(firstSnapshot.snapshotId);
    expect(result?.version).toBe(firstSnapshot.version);
  });

  it("returns the default snapshot", () => {
    const result = getModalSnapshotById(DEFAULT_MODAL_SNAPSHOT_ID);
    expect(result).toBeDefined();
    expect(result?.snapshotId).toBe(DEFAULT_MODAL_SNAPSHOT_ID);
  });
});
