import { describe, expect, it } from "vitest";

import {
  isPastPauseThreshold,
  resolveCloudWorkspaceProtectionMap,
} from "./sandboxInstanceMaintenance.helpers";

describe("sandboxInstanceMaintenance helpers", () => {
  describe("resolveCloudWorkspaceProtectionMap", () => {
    it("protects legacy cloud workspaces discovered via task runs when activity flag is absent", async () => {
      const protection = await resolveCloudWorkspaceProtectionMap({
        instanceIds: ["pvelxc-legacy"],
        activitiesByInstanceId: {
          "pvelxc-legacy": { createdAt: 100 },
        },
        fetchTaskRunCloudWorkspaceFlags: async () => ({
          "pvelxc-legacy": true,
        }),
      });

      expect(protection["pvelxc-legacy"]).toBe(true);
    });

    it("protects new cloud workspaces from the persisted activity flag", async () => {
      const protection = await resolveCloudWorkspaceProtectionMap({
        instanceIds: ["pvelxc-new"],
        activitiesByInstanceId: {
          "pvelxc-new": { isCloudWorkspace: true },
        },
        fetchTaskRunCloudWorkspaceFlags: async () => ({
          "pvelxc-new": false,
        }),
      });

      expect(protection["pvelxc-new"]).toBe(true);
    });

    it("does not protect normal task-backed sandboxes", async () => {
      const protection = await resolveCloudWorkspaceProtectionMap({
        instanceIds: ["pvelxc-normal"],
        activitiesByInstanceId: {
          "pvelxc-normal": { isCloudWorkspace: false },
        },
        fetchTaskRunCloudWorkspaceFlags: async () => ({
          "pvelxc-normal": false,
        }),
      });

      expect(protection["pvelxc-normal"]).toBe(false);
    });
  });

  describe("isPastPauseThreshold", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = 10 * dayMs;
    const thresholdMs = 3 * dayMs;

    it("does not treat an old workspace with recent lastResumedAt as stale", () => {
      const shouldPause = isPastPauseThreshold({
        now,
        thresholdMs,
        activity: {
          createdAt: now - 9 * dayMs,
          lastResumedAt: now - dayMs,
        },
        providerCreatedAtSeconds: 0,
      });

      expect(shouldPause).toBe(false);
    });

    it("treats an old workspace with no recent activity as stale", () => {
      const shouldPause = isPastPauseThreshold({
        now,
        thresholdMs,
        activity: {
          createdAt: now - 9 * dayMs,
        },
        providerCreatedAtSeconds: 0,
      });

      expect(shouldPause).toBe(true);
    });
  });
});
