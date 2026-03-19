import { describe, it, expect } from "vitest";
import {
  generateA2AId,
  createTaskRequest,
  createTaskResponse,
  createMessage,
  createCmuxAgentCard,
  validateAgentCard,
  mailboxToA2AMessage,
  a2aToMailboxMessage,
} from "./a2a-protocol";

describe("A2A Protocol", () => {
  describe("generateA2AId", () => {
    it("generates task IDs with correct prefix", () => {
      const id = generateA2AId("task");
      expect(id).toMatch(/^task_[a-z0-9]+_[a-z0-9]+$/);
    });

    it("generates message IDs with correct prefix", () => {
      const id = generateA2AId("msg");
      expect(id).toMatch(/^msg_[a-z0-9]+_[a-z0-9]+$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateA2AId("task")));
      expect(ids.size).toBe(100);
    });
  });

  describe("createTaskRequest", () => {
    it("creates a valid task request", () => {
      const request = createTaskRequest(
        "claude/opus-4.5",
        "codex/gpt-5.1",
        "Write a function to sort an array"
      );

      expect(request.taskId).toMatch(/^task_/);
      expect(request.fromAgent).toBe("claude/opus-4.5");
      expect(request.toAgent).toBe("codex/gpt-5.1");
      expect(request.prompt).toBe("Write a function to sort an array");
      expect(request.timestamp).toBeDefined();
    });

    it("accepts optional parameters", () => {
      const request = createTaskRequest(
        "claude/opus-4.5",
        "codex/gpt-5.1",
        "Review this code",
        {
          taskType: "review",
          priority: 1,
          timeoutMs: 60000,
        }
      );

      expect(request.taskType).toBe("review");
      expect(request.priority).toBe(1);
      expect(request.timeoutMs).toBe(60000);
    });
  });

  describe("createTaskResponse", () => {
    it("creates a completed response", () => {
      const response = createTaskResponse(
        "task_abc123",
        "codex/gpt-5.1",
        "completed",
        { result: "Function implemented successfully" }
      );

      expect(response.taskId).toBe("task_abc123");
      expect(response.fromAgent).toBe("codex/gpt-5.1");
      expect(response.status).toBe("completed");
      expect(response.result).toBe("Function implemented successfully");
    });

    it("creates a failed response with error", () => {
      const response = createTaskResponse(
        "task_abc123",
        "codex/gpt-5.1",
        "failed",
        {
          error: {
            code: "TASK_TIMEOUT",
            message: "Task exceeded timeout",
            retryable: true,
          },
        }
      );

      expect(response.status).toBe("failed");
      expect(response.error?.code).toBe("TASK_TIMEOUT");
      expect(response.error?.retryable).toBe(true);
    });
  });

  describe("createMessage", () => {
    it("creates a text message", () => {
      const msg = createMessage(
        "claude/opus-4.5",
        "codex/gpt-5.1",
        { type: "text", text: "Hello!" }
      );

      expect(msg.messageId).toMatch(/^msg_/);
      expect(msg.type).toBe("text");
      expect(msg.content).toEqual({ type: "text", text: "Hello!" });
    });

    it("creates a broadcast message", () => {
      const msg = createMessage(
        "claude/opus-4.5",
        "*",
        { type: "status", status: "Starting work" }
      );

      expect(msg.toAgent).toBe("*");
      expect(msg.type).toBe("status");
    });
  });

  describe("createCmuxAgentCard", () => {
    it("creates a valid agent card", () => {
      const card = createCmuxAgentCard(
        "claude/opus-4.5",
        "https://api.cmux.sh/a2a"
      );

      expect(card.agentId).toBe("claude/opus-4.5");
      expect(card.protocolVersion).toBe("1.0");
      expect(card.endpoint).toBe("https://api.cmux.sh/a2a");
      expect(card.capabilities.tasks).toBe(true);
      expect(card.capabilities.streaming).toBe(true);
    });

    it("validates a valid agent card", () => {
      const card = createCmuxAgentCard(
        "claude/opus-4.5",
        "https://api.cmux.sh/a2a"
      );

      expect(validateAgentCard(card)).toBe(true);
    });

    it("rejects invalid agent cards", () => {
      expect(validateAgentCard(null)).toBe(false);
      expect(validateAgentCard({})).toBe(false);
      expect(validateAgentCard({ agentId: "test" })).toBe(false);
    });
  });

  describe("message conversion", () => {
    it("converts mailbox message to A2A format", () => {
      const mailboxMsg = {
        id: "msg_abc123",
        from: "claude/opus-4.5",
        to: "codex/gpt-5.1",
        type: "request",
        message: "Please review this code",
        timestamp: "2026-03-19T12:00:00Z",
        correlationId: "corr_123",
      };

      const a2aMsg = mailboxToA2AMessage(mailboxMsg);

      expect(a2aMsg.messageId).toBe("msg_abc123");
      expect(a2aMsg.fromAgent).toBe("claude/opus-4.5");
      expect(a2aMsg.toAgent).toBe("codex/gpt-5.1");
      expect(a2aMsg.content).toEqual({ type: "text", text: "Please review this code" });
      expect(a2aMsg.correlationId).toBe("corr_123");
    });

    it("converts A2A message to mailbox format", () => {
      const a2aMsg = createMessage(
        "claude/opus-4.5",
        "codex/gpt-5.1",
        { type: "text", text: "Task completed" },
        { correlationId: "corr_456" }
      );

      const mailboxMsg = a2aToMailboxMessage(a2aMsg);

      expect(mailboxMsg.from).toBe("claude/opus-4.5");
      expect(mailboxMsg.to).toBe("codex/gpt-5.1");
      expect(mailboxMsg.message).toBe("Task completed");
      expect(mailboxMsg.correlationId).toBe("corr_456");
    });

    it("handles handoff messages", () => {
      const mailboxMsg = {
        id: "msg_handoff",
        from: "claude/opus-4.5",
        to: "codex/gpt-5.1",
        type: "handoff",
        message: "Handing off authentication work",
        timestamp: "2026-03-19T12:00:00Z",
      };

      const a2aMsg = mailboxToA2AMessage(mailboxMsg);
      expect(a2aMsg.type).toBe("handoff");
    });
  });
});
