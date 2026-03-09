import { describe, expect, it } from "vitest";

import {
  buildCloudWorkspaceProtectionMap,
  getContainerNamesNeedingCloudWorkspaceFallback,
  isPveInstanceStaleForPause,
} from "./sandboxInstanceMaintenanceHelpers";

describe("sandboxInstanceMaintenanceHelpers", () => {
  describe("buildCloudWorkspaceProtectionMap", () => {
    it("protects legacy cloud workspaces via taskRun fallback when activity flag is missing", () => {
      const instanceIds = ["pvelxc-legacy-1"];
      const protectionMap = buildCloudWorkspaceProtectionMap({
        activitiesByInstanceId: {},
        instanceIds,
        taskRunCloudWorkspaceFlags: {
          "pvelxc-legacy-1": true,
        },
      });

      expect(protectionMap["pvelxc-legacy-1"]).toBe(true);
    });

    it("protects new cloud workspaces via activity flag without fallback", () => {
      const instanceIds = ["pvelxc-new-1"];
      const protectionMap = buildCloudWorkspaceProtectionMap({
        activitiesByInstanceId: {
          "pvelxc-new-1": {
            isCloudWorkspace: true,
          },
        },
        instanceIds,
        taskRunCloudWorkspaceFlags: {
          "pvelxc-new-1": false,
        },
      });

      expect(protectionMap["pvelxc-new-1"]).toBe(true);
    });

    it("does not protect normal non-cloud task runs", () => {
      const instanceIds = ["pvelxc-normal-1"];
      const protectionMap = buildCloudWorkspaceProtectionMap({
        activitiesByInstanceId: {},
        instanceIds,
        taskRunCloudWorkspaceFlags: {
          "pvelxc-normal-1": false,
        },
      });

      expect(protectionMap["pvelxc-normal-1"]).toBe(false);
    });
  });

  describe("getContainerNamesNeedingCloudWorkspaceFallback", () => {
    it("only includes instances without activity isCloudWorkspace markers", () => {
      const fallbackNames = getContainerNamesNeedingCloudWorkspaceFallback({
        activitiesByInstanceId: {
          "instance-a": { isCloudWorkspace: true },
          "instance-b": { isCloudWorkspace: false },
          "instance-c": {},
        },
        instanceIds: ["instance-a", "instance-b", "instance-c", "instance-d"],
      });

      expect(fallbackNames).toContain("instance-c");
      expect(fallbackNames).toContain("instance-d");
      expect(fallbackNames).not.toContain("instance-a");
      expect(fallbackNames).not.toContain("instance-b");
      expect(fallbackNames).toHaveLength(2);
    });
  });

  describe("isPveInstanceStaleForPause", () => {
    it("does not mark an old workspace stale when lastResumedAt is recent", () => {
      const now = Date.now();
      const thresholdMs = 3 * 24 * 60 * 60 * 1000;
      const stale = isPveInstanceStaleForPause({
        activity: {
          createdAt: now - 30 * 24 * 60 * 60 * 1000,
          lastResumedAt: now - 12 * 60 * 60 * 1000,
        },
        nowMs: now,
        providerCreatedAtSeconds: 0,
        thresholdMs,
      });

      expect(stale).toBe(false);
    });

    it("marks old workspace stale when there is no recent activity", () => {
      const now = Date.now();
      const thresholdMs = 3 * 24 * 60 * 60 * 1000;
      const stale = isPveInstanceStaleForPause({
        activity: {
          createdAt: now - 10 * 24 * 60 * 60 * 1000,
        },
        nowMs: now,
        providerCreatedAtSeconds: 0,
        thresholdMs,
      });

      expect(stale).toBe(true);
    });
  });
});
