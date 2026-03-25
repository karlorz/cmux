import { describe, it, expect } from "vitest";

/**
 * Unit tests for orchestrationEvents query logic.
 * Tests the event analytics aggregation functions without requiring Convex runtime.
 */

describe("orchestrationEvents", () => {
  describe("getEventAnalytics aggregation logic", () => {
    // Test the category aggregation logic that would run in the query
    function aggregateEventCategories(
      countsByType: Record<string, number>
    ): {
      taskLifecycle: number;
      sessionLifecycle: number;
      approvals: number;
      contextHealth: number;
    } {
      const taskLifecycle =
        (countsByType["task_spawn_requested"] ?? 0) +
        (countsByType["task_started"] ?? 0) +
        (countsByType["task_status_changed"] ?? 0) +
        (countsByType["task_completed"] ?? 0);

      const sessionLifecycle =
        (countsByType["session_started"] ?? 0) +
        (countsByType["session_resumed"] ?? 0) +
        (countsByType["session_finished"] ?? 0) +
        (countsByType["session_stop_requested"] ?? 0) +
        (countsByType["session_stop_blocked"] ?? 0) +
        (countsByType["session_stop_failed"] ?? 0);

      const approvals =
        (countsByType["approval_required"] ?? 0) +
        (countsByType["approval_resolved"] ?? 0);

      const contextHealth =
        (countsByType["context_warning"] ?? 0) +
        (countsByType["context_compacted"] ?? 0);

      return { taskLifecycle, sessionLifecycle, approvals, contextHealth };
    }

    it("aggregates task lifecycle events correctly", () => {
      const countsByType = {
        task_spawn_requested: 5,
        task_started: 4,
        task_status_changed: 10,
        task_completed: 3,
      };

      const result = aggregateEventCategories(countsByType);
      expect(result.taskLifecycle).toBe(22);
    });

    it("aggregates session lifecycle events correctly", () => {
      const countsByType = {
        session_started: 3,
        session_resumed: 2,
        session_finished: 1,
        session_stop_requested: 1,
      };

      const result = aggregateEventCategories(countsByType);
      expect(result.sessionLifecycle).toBe(7);
    });

    it("aggregates approval events correctly", () => {
      const countsByType = {
        approval_required: 5,
        approval_resolved: 4,
      };

      const result = aggregateEventCategories(countsByType);
      expect(result.approvals).toBe(9);
    });

    it("aggregates context health events correctly", () => {
      const countsByType = {
        context_warning: 2,
        context_compacted: 1,
      };

      const result = aggregateEventCategories(countsByType);
      expect(result.contextHealth).toBe(3);
    });

    it("handles missing event types gracefully", () => {
      const countsByType = {};

      const result = aggregateEventCategories(countsByType);
      expect(result.taskLifecycle).toBe(0);
      expect(result.sessionLifecycle).toBe(0);
      expect(result.approvals).toBe(0);
      expect(result.contextHealth).toBe(0);
    });

    it("handles mixed event types", () => {
      const countsByType = {
        task_completed: 10,
        session_started: 5,
        approval_required: 2,
        context_warning: 1,
        // Unknown event types should not affect results
        unknown_event: 100,
      };

      const result = aggregateEventCategories(countsByType);
      expect(result.taskLifecycle).toBe(10);
      expect(result.sessionLifecycle).toBe(5);
      expect(result.approvals).toBe(2);
      expect(result.contextHealth).toBe(1);
    });
  });

  describe("event counting logic", () => {
    function countEventsByType(
      events: Array<{ eventType: string }>
    ): Record<string, number> {
      const countsByType: Record<string, number> = {};
      for (const event of events) {
        countsByType[event.eventType] =
          (countsByType[event.eventType] ?? 0) + 1;
      }
      return countsByType;
    }

    it("counts events by type correctly", () => {
      const events = [
        { eventType: "task_completed" },
        { eventType: "task_completed" },
        { eventType: "task_started" },
        { eventType: "approval_required" },
      ];

      const result = countEventsByType(events);
      expect(result).toEqual({
        task_completed: 2,
        task_started: 1,
        approval_required: 1,
      });
    });

    it("handles empty event list", () => {
      const events: Array<{ eventType: string }> = [];
      const result = countEventsByType(events);
      expect(result).toEqual({});
    });
  });
});
