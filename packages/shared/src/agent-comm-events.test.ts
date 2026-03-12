import { describe, expect, it } from "vitest";
import {
  generateEventId,
  createEventBase,
  createTaskSpawnRequestedEvent,
  createTaskCompletedEvent,
  createWorkerMessageEvent,
  createOrchestrationCompletedEvent,
  isTaskLifecycleEvent,
  isApprovalEvent,
  isTerminalEvent,
  type AgentCommEvent,
  type TaskSpawnRequestedEvent,
  type ApprovalRequiredEvent,
  type OrchestrationCompletedEvent,
} from "./agent-comm-events";

describe("agent-comm-events", () => {
  describe("generateEventId", () => {
    it("generates unique IDs with evt_ prefix", () => {
      const id1 = generateEventId();
      const id2 = generateEventId();

      expect(id1).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("createEventBase", () => {
    it("creates base event with required fields", () => {
      const base = createEventBase("orch_123");

      expect(base.eventId).toMatch(/^evt_/);
      expect(base.orchestrationId).toBe("orch_123");
      expect(base.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(base.correlationId).toBeUndefined();
    });

    it("includes correlation ID when provided", () => {
      const base = createEventBase("orch_123", "corr_456");

      expect(base.correlationId).toBe("corr_456");
    });
  });

  describe("createTaskSpawnRequestedEvent", () => {
    it("creates spawn event with required fields", () => {
      const event = createTaskSpawnRequestedEvent(
        "orch_123",
        "task_456",
        "claude/opus-4.5",
        "Fix the bug in auth.ts"
      );

      expect(event.type).toBe("task_spawn_requested");
      expect(event.orchestrationId).toBe("orch_123");
      expect(event.taskId).toBe("task_456");
      expect(event.agentName).toBe("claude/opus-4.5");
      expect(event.prompt).toBe("Fix the bug in auth.ts");
      expect(event.priority).toBeUndefined();
      expect(event.dependsOn).toBeUndefined();
    });

    it("includes optional fields when provided", () => {
      const event = createTaskSpawnRequestedEvent(
        "orch_123",
        "task_456",
        "codex/gpt-5.1-codex-mini",
        "Write tests",
        {
          priority: 3,
          dependsOn: ["task_100", "task_200"],
          metadata: { branch: "feat/auth" },
          correlationId: "corr_789",
        }
      );

      expect(event.priority).toBe(3);
      expect(event.dependsOn).toEqual(["task_100", "task_200"]);
      expect(event.metadata).toEqual({ branch: "feat/auth" });
      expect(event.correlationId).toBe("corr_789");
    });
  });

  describe("createTaskCompletedEvent", () => {
    it("creates completed event with required fields", () => {
      const event = createTaskCompletedEvent(
        "orch_123",
        "task_456",
        "run_789",
        "completed"
      );

      expect(event.type).toBe("task_completed");
      expect(event.taskId).toBe("task_456");
      expect(event.taskRunId).toBe("run_789");
      expect(event.status).toBe("completed");
    });

    it("includes optional fields for success", () => {
      const event = createTaskCompletedEvent(
        "orch_123",
        "task_456",
        "run_789",
        "completed",
        {
          exitCode: 0,
          summary: "Fixed auth bug and added tests",
          artifacts: [
            { type: "pr_url", value: "https://github.com/org/repo/pull/123" },
            { type: "commit", value: "abc123def" },
          ],
        }
      );

      expect(event.exitCode).toBe(0);
      expect(event.summary).toBe("Fixed auth bug and added tests");
      expect(event.artifacts).toHaveLength(2);
      expect(event.artifacts?.[0].type).toBe("pr_url");
    });

    it("includes error for failed status", () => {
      const event = createTaskCompletedEvent(
        "orch_123",
        "task_456",
        "run_789",
        "failed",
        {
          exitCode: 1,
          error: "Test suite failed with 3 errors",
        }
      );

      expect(event.status).toBe("failed");
      expect(event.exitCode).toBe(1);
      expect(event.error).toBe("Test suite failed with 3 errors");
    });
  });

  describe("createWorkerMessageEvent", () => {
    it("creates message event with required fields", () => {
      const event = createWorkerMessageEvent(
        "orch_123",
        "worker_1",
        "head_agent",
        "status",
        "Completed phase 1 of implementation"
      );

      expect(event.type).toBe("worker_message");
      expect(event.from).toBe("worker_1");
      expect(event.to).toBe("head_agent");
      expect(event.messageType).toBe("status");
      expect(event.body).toBe("Completed phase 1 of implementation");
    });

    it("includes task context when provided", () => {
      const event = createWorkerMessageEvent(
        "orch_123",
        "worker_1",
        "head_agent",
        "result",
        "PR created: https://github.com/org/repo/pull/456",
        {
          taskId: "task_456",
          taskRunId: "run_789",
          replyTo: "evt_abc123",
        }
      );

      expect(event.taskId).toBe("task_456");
      expect(event.taskRunId).toBe("run_789");
      expect(event.replyTo).toBe("evt_abc123");
    });
  });

  describe("createOrchestrationCompletedEvent", () => {
    it("creates completed event with summary stats", () => {
      const event = createOrchestrationCompletedEvent("orch_123", "completed", {
        summary: "All tasks completed successfully",
        totalTasks: 5,
        completedTasks: 5,
        failedTasks: 0,
      });

      expect(event.type).toBe("orchestration_completed");
      expect(event.status).toBe("completed");
      expect(event.totalTasks).toBe(5);
      expect(event.completedTasks).toBe(5);
      expect(event.failedTasks).toBe(0);
    });

    it("handles failed orchestration", () => {
      const event = createOrchestrationCompletedEvent("orch_123", "failed", {
        summary: "Critical task failed",
        totalTasks: 5,
        completedTasks: 2,
        failedTasks: 1,
      });

      expect(event.status).toBe("failed");
      expect(event.failedTasks).toBe(1);
    });
  });

  describe("type guards", () => {
    describe("isTaskLifecycleEvent", () => {
      it("returns true for task lifecycle events", () => {
        const spawnEvent: TaskSpawnRequestedEvent = {
          eventId: "evt_1",
          orchestrationId: "orch_1",
          timestamp: new Date().toISOString(),
          type: "task_spawn_requested",
          taskId: "task_1",
          agentName: "claude/opus-4.5",
          prompt: "Do something",
        };

        expect(isTaskLifecycleEvent(spawnEvent)).toBe(true);
      });

      it("returns false for non-lifecycle events", () => {
        const approvalEvent: ApprovalRequiredEvent = {
          eventId: "evt_1",
          orchestrationId: "orch_1",
          timestamp: new Date().toISOString(),
          type: "approval_required",
          taskId: "task_1",
          source: "worker_1",
          action: "deploy",
          payload: {},
        };

        expect(isTaskLifecycleEvent(approvalEvent)).toBe(false);
      });
    });

    describe("isApprovalEvent", () => {
      it("returns true for approval events", () => {
        const event: ApprovalRequiredEvent = {
          eventId: "evt_1",
          orchestrationId: "orch_1",
          timestamp: new Date().toISOString(),
          type: "approval_required",
          taskId: "task_1",
          source: "worker_1",
          action: "merge_pr",
          payload: { prUrl: "https://github.com/org/repo/pull/123" },
        };

        expect(isApprovalEvent(event)).toBe(true);
      });

      it("returns false for non-approval events", () => {
        const event = createTaskCompletedEvent(
          "orch_1",
          "task_1",
          "run_1",
          "completed"
        );

        expect(isApprovalEvent(event)).toBe(false);
      });
    });

    describe("isTerminalEvent", () => {
      it("returns true for orchestration completed event", () => {
        const event: OrchestrationCompletedEvent = {
          eventId: "evt_1",
          orchestrationId: "orch_1",
          timestamp: new Date().toISOString(),
          type: "orchestration_completed",
          status: "completed",
        };

        expect(isTerminalEvent(event)).toBe(true);
      });

      it("returns false for non-terminal events", () => {
        const event = createTaskSpawnRequestedEvent(
          "orch_1",
          "task_1",
          "claude/opus-4.5",
          "Do something"
        );

        expect(isTerminalEvent(event)).toBe(false);
      });
    });
  });

  describe("event serialization", () => {
    it("events are JSON serializable", () => {
      const event = createTaskSpawnRequestedEvent(
        "orch_123",
        "task_456",
        "claude/opus-4.5",
        "Fix bug",
        {
          priority: 5,
          dependsOn: ["task_1"],
          metadata: { branch: "main" },
        }
      );

      const serialized = JSON.stringify(event);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.type).toBe("task_spawn_requested");
      expect(deserialized.taskId).toBe("task_456");
      expect(deserialized.metadata.branch).toBe("main");
    });
  });
});
