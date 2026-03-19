import { describe, expect, it } from "vitest";
import {
  getCloudWorkspaceFallbackContainerNames,
  buildCloudWorkspaceProtectionMap,
  getPauseReferenceTimeMs,
  isPastPauseThreshold,
  getLastActivityTimeMs,
  type SandboxInstanceActivityById,
} from "./sandboxInstanceMaintenance.helpers";

describe("getCloudWorkspaceFallbackContainerNames", () => {
  it("returns all IDs when none are cloud workspaces", () => {
    const instanceIds = ["inst1", "inst2", "inst3"];
    const activities: SandboxInstanceActivityById = {};
    const result = getCloudWorkspaceFallbackContainerNames(
      instanceIds,
      activities
    );
    expect(result).toEqual(["inst1", "inst2", "inst3"]);
  });

  it("excludes cloud workspace instances", () => {
    const instanceIds = ["inst1", "inst2", "inst3"];
    const activities: SandboxInstanceActivityById = {
      inst2: { isCloudWorkspace: true },
    };
    const result = getCloudWorkspaceFallbackContainerNames(
      instanceIds,
      activities
    );
    expect(result).toEqual(["inst1", "inst3"]);
  });

  it("returns empty array when all are cloud workspaces", () => {
    const instanceIds = ["inst1", "inst2"];
    const activities: SandboxInstanceActivityById = {
      inst1: { isCloudWorkspace: true },
      inst2: { isCloudWorkspace: true },
    };
    const result = getCloudWorkspaceFallbackContainerNames(
      instanceIds,
      activities
    );
    expect(result).toEqual([]);
  });

  it("handles empty instance list", () => {
    const result = getCloudWorkspaceFallbackContainerNames([], {});
    expect(result).toEqual([]);
  });

  it("includes instances with isCloudWorkspace=false", () => {
    const instanceIds = ["inst1"];
    const activities: SandboxInstanceActivityById = {
      inst1: { isCloudWorkspace: false },
    };
    const result = getCloudWorkspaceFallbackContainerNames(
      instanceIds,
      activities
    );
    expect(result).toEqual(["inst1"]);
  });
});

describe("buildCloudWorkspaceProtectionMap", () => {
  it("marks cloud workspaces as protected from activities", () => {
    const result = buildCloudWorkspaceProtectionMap({
      instanceIds: ["inst1", "inst2"],
      activitiesByInstanceId: { inst1: { isCloudWorkspace: true } },
      taskRunCloudWorkspaceByContainerName: {},
    });
    expect(result.inst1).toBe(true);
    expect(result.inst2).toBe(false);
  });

  it("marks cloud workspaces as protected from task run flags", () => {
    const result = buildCloudWorkspaceProtectionMap({
      instanceIds: ["inst1", "inst2"],
      activitiesByInstanceId: {},
      taskRunCloudWorkspaceByContainerName: { inst2: true },
    });
    expect(result.inst1).toBe(false);
    expect(result.inst2).toBe(true);
  });

  it("combines both sources of protection", () => {
    const result = buildCloudWorkspaceProtectionMap({
      instanceIds: ["inst1", "inst2", "inst3"],
      activitiesByInstanceId: { inst1: { isCloudWorkspace: true } },
      taskRunCloudWorkspaceByContainerName: { inst2: true },
    });
    expect(result.inst1).toBe(true);
    expect(result.inst2).toBe(true);
    expect(result.inst3).toBe(false);
  });

  it("handles empty inputs", () => {
    const result = buildCloudWorkspaceProtectionMap({
      instanceIds: [],
      activitiesByInstanceId: {},
      taskRunCloudWorkspaceByContainerName: {},
    });
    expect(result).toEqual({});
  });
});

describe("getPauseReferenceTimeMs", () => {
  it("prefers lastResumedAt", () => {
    const result = getPauseReferenceTimeMs({
      activity: {
        lastResumedAt: 3000,
        createdAt: 1000,
      },
      providerCreatedAtSeconds: 2,
    });
    expect(result).toBe(3000);
  });

  it("falls back to createdAt when no lastResumedAt", () => {
    const result = getPauseReferenceTimeMs({
      activity: { createdAt: 1000 },
      providerCreatedAtSeconds: 2,
    });
    expect(result).toBe(1000);
  });

  it("falls back to provider timestamp (converted to ms)", () => {
    const result = getPauseReferenceTimeMs({
      activity: undefined,
      providerCreatedAtSeconds: 5,
    });
    expect(result).toBe(5000);
  });

  it("returns null when no timestamps available", () => {
    const result = getPauseReferenceTimeMs({
      activity: undefined,
      providerCreatedAtSeconds: 0,
    });
    expect(result).toBeNull();
  });
});

describe("isPastPauseThreshold", () => {
  it("returns true when past threshold", () => {
    const result = isPastPauseThreshold({
      now: 10000,
      thresholdMs: 5000,
      activity: { lastResumedAt: 1000 },
      providerCreatedAtSeconds: 0,
    });
    expect(result).toBe(true);
  });

  it("returns false when within threshold", () => {
    const result = isPastPauseThreshold({
      now: 10000,
      thresholdMs: 5000,
      activity: { lastResumedAt: 8000 },
      providerCreatedAtSeconds: 0,
    });
    expect(result).toBe(false);
  });

  it("returns true when no reference time available", () => {
    const result = isPastPauseThreshold({
      now: 10000,
      thresholdMs: 5000,
      activity: undefined,
      providerCreatedAtSeconds: 0,
    });
    expect(result).toBe(true);
  });

  it("uses provider timestamp as fallback", () => {
    const result = isPastPauseThreshold({
      now: 10000,
      thresholdMs: 5000,
      activity: undefined,
      providerCreatedAtSeconds: 8, // 8000ms
    });
    expect(result).toBe(false);
  });
});

describe("getLastActivityTimeMs", () => {
  it("prefers lastResumedAt", () => {
    const result = getLastActivityTimeMs({
      activity: {
        lastResumedAt: 4000,
        lastPausedAt: 3000,
        createdAt: 1000,
      },
      providerCreatedAtSeconds: 2,
    });
    expect(result).toBe(4000);
  });

  it("falls back to lastPausedAt", () => {
    const result = getLastActivityTimeMs({
      activity: {
        lastPausedAt: 3000,
        createdAt: 1000,
      },
      providerCreatedAtSeconds: 2,
    });
    expect(result).toBe(3000);
  });

  it("falls back to createdAt", () => {
    const result = getLastActivityTimeMs({
      activity: { createdAt: 1000 },
      providerCreatedAtSeconds: 2,
    });
    expect(result).toBe(1000);
  });

  it("falls back to provider timestamp", () => {
    const result = getLastActivityTimeMs({
      activity: undefined,
      providerCreatedAtSeconds: 5,
    });
    expect(result).toBe(5000);
  });

  it("returns null when nothing available", () => {
    const result = getLastActivityTimeMs({
      activity: undefined,
      providerCreatedAtSeconds: 0,
    });
    expect(result).toBeNull();
  });
});
