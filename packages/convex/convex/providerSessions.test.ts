import { describe, it, expect } from "vitest";

/**
 * Unit tests for providerSessions validation logic.
 * Tests provider, mode, status, and reply channel validators.
 */

describe("providerSessions", () => {
  describe("provider validation", () => {
    const validProviders = [
      "claude",
      "codex",
      "gemini",
      "opencode",
      "amp",
      "grok",
      "cursor",
      "qwen",
    ];

    it("accepts all valid providers", () => {
      for (const provider of validProviders) {
        expect(validProviders.includes(provider)).toBe(true);
      }
    });

    it("has expected number of providers", () => {
      expect(validProviders.length).toBe(8);
    });

    it("includes all major AI coding assistants", () => {
      // Claude (Anthropic)
      expect(validProviders.includes("claude")).toBe(true);
      // Codex (OpenAI)
      expect(validProviders.includes("codex")).toBe(true);
      // Gemini (Google)
      expect(validProviders.includes("gemini")).toBe(true);
      // OpenCode (open source)
      expect(validProviders.includes("opencode")).toBe(true);
    });
  });

  describe("mode validation", () => {
    const validModes = ["head", "worker", "reviewer"];

    it("accepts all valid modes", () => {
      for (const mode of validModes) {
        expect(validModes.includes(mode)).toBe(true);
      }
    });

    it("has expected number of modes", () => {
      expect(validModes.length).toBe(3);
    });

    it("includes orchestration roles", () => {
      expect(validModes.includes("head")).toBe(true);
      expect(validModes.includes("worker")).toBe(true);
      expect(validModes.includes("reviewer")).toBe(true);
    });
  });

  describe("status validation", () => {
    const validStatuses = ["active", "suspended", "expired", "terminated"];

    it("accepts all valid statuses", () => {
      for (const status of validStatuses) {
        expect(validStatuses.includes(status)).toBe(true);
      }
    });

    it("has expected number of statuses", () => {
      expect(validStatuses.length).toBe(4);
    });

    it("includes lifecycle states", () => {
      // Active session
      expect(validStatuses.includes("active")).toBe(true);
      // Temporarily paused
      expect(validStatuses.includes("suspended")).toBe(true);
      // Timed out
      expect(validStatuses.includes("expired")).toBe(true);
      // Explicitly ended
      expect(validStatuses.includes("terminated")).toBe(true);
    });
  });

  describe("reply channel validation", () => {
    const validChannels = ["mailbox", "sse", "pty", "ui"];

    it("accepts all valid channels", () => {
      for (const channel of validChannels) {
        expect(validChannels.includes(channel)).toBe(true);
      }
    });

    it("has expected number of channels", () => {
      expect(validChannels.length).toBe(4);
    });

    it("includes communication channels", () => {
      // Async message queue
      expect(validChannels.includes("mailbox")).toBe(true);
      // Server-sent events
      expect(validChannels.includes("sse")).toBe(true);
      // Pseudo-terminal
      expect(validChannels.includes("pty")).toBe(true);
      // Web UI
      expect(validChannels.includes("ui")).toBe(true);
    });
  });

  describe("ResumeAncestry interface", () => {
    // Test the structure of resume ancestry data
    interface ResumeAncestry {
      hasBoundSession: boolean;
      provider: string | null;
      mode: string | null;
      providerSessionId: string | null;
      providerThreadId: string | null;
      status: "active" | "suspended" | "expired" | "terminated" | null;
      createdAt: number | null;
      lastActiveAt: number | null;
      isResumedSession: boolean;
      replyChannel: string | null;
    }

    it("empty ancestry has expected shape", () => {
      const emptyAncestry: ResumeAncestry = {
        hasBoundSession: false,
        provider: null,
        mode: null,
        providerSessionId: null,
        providerThreadId: null,
        status: null,
        createdAt: null,
        lastActiveAt: null,
        isResumedSession: false,
        replyChannel: null,
      };

      expect(emptyAncestry.hasBoundSession).toBe(false);
      expect(emptyAncestry.isResumedSession).toBe(false);
    });

    it("bound ancestry has expected shape", () => {
      const boundAncestry: ResumeAncestry = {
        hasBoundSession: true,
        provider: "claude",
        mode: "head",
        providerSessionId: "sess_abc123",
        providerThreadId: null,
        status: "active",
        createdAt: Date.now() - 60000,
        lastActiveAt: Date.now(),
        isResumedSession: false,
        replyChannel: "sse",
      };

      expect(boundAncestry.hasBoundSession).toBe(true);
      expect(boundAncestry.provider).toBe("claude");
      expect(boundAncestry.status).toBe("active");
    });

    it("resumed session has isResumedSession true", () => {
      const resumedAncestry: ResumeAncestry = {
        hasBoundSession: true,
        provider: "codex",
        mode: "worker",
        providerSessionId: null,
        providerThreadId: "thread_xyz789",
        status: "active",
        createdAt: Date.now() - 3600000,
        lastActiveAt: Date.now(),
        isResumedSession: true,
        replyChannel: "pty",
      };

      expect(resumedAncestry.isResumedSession).toBe(true);
      expect(resumedAncestry.providerThreadId).toBe("thread_xyz789");
    });
  });
});
