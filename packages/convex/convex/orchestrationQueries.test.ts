import { describe, expect, it } from "vitest";
import {
  isLinkedToProject,
  ORCHESTRATION_STATUSES,
  DEFAULT_TASK_LIST_LIMIT,
} from "./orchestrationQueries";
import type { Doc, Id } from "./_generated/dataModel";

describe("orchestrationQueries", () => {
  describe("constants", () => {
    it("ORCHESTRATION_STATUSES contains all expected statuses", () => {
      expect(ORCHESTRATION_STATUSES).toContain("pending");
      expect(ORCHESTRATION_STATUSES).toContain("assigned");
      expect(ORCHESTRATION_STATUSES).toContain("running");
      expect(ORCHESTRATION_STATUSES).toContain("completed");
      expect(ORCHESTRATION_STATUSES).toContain("failed");
      expect(ORCHESTRATION_STATUSES).toContain("cancelled");
      expect(ORCHESTRATION_STATUSES).toHaveLength(6);
    });

    it("DEFAULT_TASK_LIST_LIMIT is a reasonable value", () => {
      expect(DEFAULT_TASK_LIST_LIMIT).toBe(50);
    });
  });

  describe("isLinkedToProject", () => {
    function createTask(
      metadata?: Record<string, unknown>
    ): Doc<"orchestrationTasks"> {
      return {
        _id: "taskId" as Id<"orchestrationTasks">,
        _creationTime: Date.now(),
        teamId: "team-1",
        userId: "user-1",
        prompt: "Test prompt",
        priority: 5,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata,
      };
    }

    it("returns false for null task", () => {
      expect(isLinkedToProject(null)).toBe(false);
    });

    it("returns false for task without metadata", () => {
      const task = createTask(undefined);
      expect(isLinkedToProject(task)).toBe(false);
    });

    it("returns false for task with empty metadata", () => {
      const task = createTask({});
      expect(isLinkedToProject(task)).toBe(false);
    });

    it("returns false for task with metadata but no projectId", () => {
      const task = createTask({ other: "value" });
      expect(isLinkedToProject(task)).toBe(false);
    });

    it("returns true for task with projectId in metadata", () => {
      const task = createTask({ projectId: "proj-123" });
      expect(isLinkedToProject(task)).toBe(true);
    });

    it("returns true for task with numeric projectId", () => {
      const task = createTask({ projectId: 12345 });
      expect(isLinkedToProject(task)).toBe(true);
    });

    it("returns false for task with null projectId", () => {
      const task = createTask({ projectId: null });
      expect(isLinkedToProject(task)).toBe(false);
    });

    it("returns false for task with undefined projectId", () => {
      const task = createTask({ projectId: undefined });
      expect(isLinkedToProject(task)).toBe(false);
    });

    it("returns false for task with empty string projectId", () => {
      const task = createTask({ projectId: "" });
      expect(isLinkedToProject(task)).toBe(false);
    });

    it("returns true for task with projectId among other metadata", () => {
      const task = createTask({
        projectId: "proj-xyz",
        projectItemId: "item-123",
        owner: "org",
      });
      expect(isLinkedToProject(task)).toBe(true);
    });
  });
});
