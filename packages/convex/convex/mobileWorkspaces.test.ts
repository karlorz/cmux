import { describe, expect, it } from "vitest";
import { computeUnreadState, buildWorkspaceRows } from "./mobileWorkspaces";

// Minimal mock types matching the function signatures
type MockWorkspace = {
  workspaceId: string;
  latestEventSeq: number;
  lastActivityAt: number;
  [key: string]: unknown;
};

type MockState = {
  workspaceId: string;
  lastReadEventSeq: number;
};

describe("mobileWorkspaces", () => {
  describe("computeUnreadState", () => {
    it("returns true when latestEventSeq > lastReadEventSeq", () => {
      expect(computeUnreadState(10, 5)).toBe(true);
    });

    it("returns false when latestEventSeq === lastReadEventSeq", () => {
      expect(computeUnreadState(5, 5)).toBe(false);
    });

    it("returns false when latestEventSeq < lastReadEventSeq", () => {
      expect(computeUnreadState(3, 5)).toBe(false);
    });

    it("handles zero values", () => {
      expect(computeUnreadState(0, 0)).toBe(false);
      expect(computeUnreadState(1, 0)).toBe(true);
      expect(computeUnreadState(0, 1)).toBe(false);
    });

    it("handles large sequence numbers", () => {
      expect(computeUnreadState(1000000, 999999)).toBe(true);
      expect(computeUnreadState(999999, 1000000)).toBe(false);
    });
  });

  describe("buildWorkspaceRows", () => {
    it("returns empty array for empty inputs", () => {
      const result = buildWorkspaceRows([], []);
      expect(result).toEqual([]);
    });

    it("marks workspace as unread when no state exists", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-1", latestEventSeq: 5, lastActivityAt: 1000 },
      ];
      const result = buildWorkspaceRows(workspaces as never[], []);

      expect(result).toHaveLength(1);
      expect(result[0].workspaceId).toBe("ws-1");
      expect(result[0].lastReadEventSeq).toBe(0);
      expect(result[0].unread).toBe(true);
    });

    it("marks workspace as read when state matches latest", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-1", latestEventSeq: 5, lastActivityAt: 1000 },
      ];
      const states: MockState[] = [
        { workspaceId: "ws-1", lastReadEventSeq: 5 },
      ];
      const result = buildWorkspaceRows(workspaces as never[], states as never[]);

      expect(result[0].unread).toBe(false);
      expect(result[0].lastReadEventSeq).toBe(5);
    });

    it("marks workspace as unread when new events exist", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-1", latestEventSeq: 10, lastActivityAt: 1000 },
      ];
      const states: MockState[] = [
        { workspaceId: "ws-1", lastReadEventSeq: 5 },
      ];
      const result = buildWorkspaceRows(workspaces as never[], states as never[]);

      expect(result[0].unread).toBe(true);
    });

    it("sorts workspaces by lastActivityAt descending", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-old", latestEventSeq: 1, lastActivityAt: 100 },
        { workspaceId: "ws-new", latestEventSeq: 1, lastActivityAt: 300 },
        { workspaceId: "ws-mid", latestEventSeq: 1, lastActivityAt: 200 },
      ];
      const result = buildWorkspaceRows(workspaces as never[], []);

      expect(result[0].workspaceId).toBe("ws-new");
      expect(result[1].workspaceId).toBe("ws-mid");
      expect(result[2].workspaceId).toBe("ws-old");
    });

    it("handles multiple workspaces with mixed read states", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-1", latestEventSeq: 10, lastActivityAt: 300 },
        { workspaceId: "ws-2", latestEventSeq: 5, lastActivityAt: 200 },
        { workspaceId: "ws-3", latestEventSeq: 3, lastActivityAt: 100 },
      ];
      const states: MockState[] = [
        { workspaceId: "ws-1", lastReadEventSeq: 10 }, // read
        { workspaceId: "ws-2", lastReadEventSeq: 3 },  // unread
        // ws-3 has no state
      ];
      const result = buildWorkspaceRows(workspaces as never[], states as never[]);

      expect(result[0].workspaceId).toBe("ws-1");
      expect(result[0].unread).toBe(false);

      expect(result[1].workspaceId).toBe("ws-2");
      expect(result[1].unread).toBe(true);

      expect(result[2].workspaceId).toBe("ws-3");
      expect(result[2].unread).toBe(true);
    });

    it("ignores states for non-existent workspaces", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-1", latestEventSeq: 5, lastActivityAt: 1000 },
      ];
      const states: MockState[] = [
        { workspaceId: "ws-1", lastReadEventSeq: 5 },
        { workspaceId: "ws-nonexistent", lastReadEventSeq: 10 },
      ];
      const result = buildWorkspaceRows(workspaces as never[], states as never[]);

      expect(result).toHaveLength(1);
      expect(result[0].workspaceId).toBe("ws-1");
    });

    it("preserves all original workspace properties", () => {
      const workspaces: MockWorkspace[] = [
        {
          workspaceId: "ws-1",
          latestEventSeq: 5,
          lastActivityAt: 1000,
          title: "Test Workspace",
          phase: "active",
        },
      ];
      const result = buildWorkspaceRows(workspaces as never[], []);

      expect(result[0].title).toBe("Test Workspace");
      expect(result[0].phase).toBe("active");
    });

    it("does not mutate input arrays", () => {
      const workspaces: MockWorkspace[] = [
        { workspaceId: "ws-2", latestEventSeq: 1, lastActivityAt: 100 },
        { workspaceId: "ws-1", latestEventSeq: 1, lastActivityAt: 200 },
      ];
      const originalOrder = workspaces.map(w => w.workspaceId);

      buildWorkspaceRows(workspaces as never[], []);

      // Original array should be unchanged
      expect(workspaces.map(w => w.workspaceId)).toEqual(originalOrder);
    });
  });
});
