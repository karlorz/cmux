import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  TRACE_HEADERS,
  generateTraceId,
  generateSpanId,
  createTraceContext,
  createChildSpan,
  extractTraceContext,
  injectTraceContext,
  createSpan,
  formatSpanForLog,
  withSpan,
  type SpanContext,
} from "./tracing";

describe("tracing", () => {
  describe("TRACE_HEADERS", () => {
    it("defines standard header names", () => {
      expect(TRACE_HEADERS.TRACE_ID).toBe("X-Trace-Id");
      expect(TRACE_HEADERS.SPAN_ID).toBe("X-Span-Id");
      expect(TRACE_HEADERS.PARENT_SPAN_ID).toBe("X-Parent-Span-Id");
    });
  });

  describe("generateTraceId", () => {
    it("generates 32 character hex string", () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("generateSpanId", () => {
    it("generates 16 character hex string", () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("createTraceContext", () => {
    it("creates context with traceId and spanId", () => {
      const ctx = createTraceContext();

      expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("does not set parentSpanId", () => {
      const ctx = createTraceContext();

      expect(ctx.parentSpanId).toBeUndefined();
    });
  });

  describe("createChildSpan", () => {
    it("preserves parent traceId", () => {
      const parent: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const child = createChildSpan(parent);

      expect(child.traceId).toBe(parent.traceId);
    });

    it("generates new spanId", () => {
      const parent: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const child = createChildSpan(parent);

      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("sets parentSpanId to parent spanId", () => {
      const parent: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const child = createChildSpan(parent);

      expect(child.parentSpanId).toBe(parent.spanId);
    });
  });

  describe("extractTraceContext", () => {
    it("extracts trace context from headers", () => {
      const headers = {
        "X-Trace-Id": "a".repeat(32),
        "X-Span-Id": "b".repeat(16),
        "X-Parent-Span-Id": "c".repeat(16),
      };

      const ctx = extractTraceContext(headers);

      expect(ctx.traceId).toBe("a".repeat(32));
      expect(ctx.spanId).toBe("b".repeat(16));
      expect(ctx.parentSpanId).toBe("c".repeat(16));
    });

    it("handles lowercase headers", () => {
      const headers = {
        "x-trace-id": "a".repeat(32),
        "x-span-id": "b".repeat(16),
      };

      const ctx = extractTraceContext(headers);

      expect(ctx.traceId).toBe("a".repeat(32));
      expect(ctx.spanId).toBe("b".repeat(16));
    });

    it("creates new context when no trace header present", () => {
      const headers = {};

      const ctx = extractTraceContext(headers);

      expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("generates spanId when missing from headers", () => {
      const headers = {
        "X-Trace-Id": "a".repeat(32),
      };

      const ctx = extractTraceContext(headers);

      expect(ctx.traceId).toBe("a".repeat(32));
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("handles undefined parentSpanId gracefully", () => {
      const headers = {
        "X-Trace-Id": "a".repeat(32),
        "X-Span-Id": "b".repeat(16),
      };

      const ctx = extractTraceContext(headers);

      expect(ctx.parentSpanId).toBeUndefined();
    });
  });

  describe("injectTraceContext", () => {
    it("injects trace headers into empty object", () => {
      const ctx: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const headers = injectTraceContext(ctx);

      expect(headers["X-Trace-Id"]).toBe("a".repeat(32));
      expect(headers["X-Span-Id"]).toBe("b".repeat(16));
    });

    it("preserves existing headers", () => {
      const ctx: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const headers = injectTraceContext(ctx, { "Content-Type": "application/json" });

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Trace-Id"]).toBe("a".repeat(32));
    });

    it("includes parentSpanId when present", () => {
      const ctx: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
        parentSpanId: "c".repeat(16),
      };

      const headers = injectTraceContext(ctx);

      expect(headers["X-Parent-Span-Id"]).toBe("c".repeat(16));
    });

    it("omits parentSpanId when not present", () => {
      const ctx: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const headers = injectTraceContext(ctx);

      expect(headers["X-Parent-Span-Id"]).toBeUndefined();
    });
  });

  describe("createSpan", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates span with name and new context", () => {
      const span = createSpan("test-operation");

      expect(span.name).toBe("test-operation");
      expect(span.context.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.context.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("creates child span when parent context provided", () => {
      const parent: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const span = createSpan("child-operation", parent);

      expect(span.context.traceId).toBe(parent.traceId);
      expect(span.context.parentSpanId).toBe(parent.spanId);
    });

    it("records start time", () => {
      const span = createSpan("test");

      expect(span.timing.startTime).toBe(Date.now());
    });

    it("defaults to ok status", () => {
      const span = createSpan("test");

      expect(span.status).toBe("ok");
    });

    it("end() calculates duration", () => {
      const span = createSpan("test");

      vi.advanceTimersByTime(100);
      const endedSpan = span.end();

      expect(endedSpan.timing.durationMs).toBe(100);
    });

    it("end() sets error status when specified", () => {
      const span = createSpan("test");
      const endedSpan = span.end("error", "Something failed");

      expect(endedSpan.status).toBe("error");
      expect(endedSpan.error).toBe("Something failed");
    });
  });

  describe("formatSpanForLog", () => {
    it("formats span with all components", () => {
      const span = {
        context: {
          traceId: "abcdef1234567890" + "0".repeat(16),
          spanId: "12345678" + "0".repeat(8),
        },
        name: "fetch-data",
        timing: { startTime: 0, endTime: 100, durationMs: 100 },
        status: "ok" as const,
      };

      const log = formatSpanForLog(span);

      expect(log).toContain("[trace:abcdef12]");
      expect(log).toContain("[span:12345678]");
      expect(log).toContain("fetch-data");
      expect(log).toContain("(100ms)");
    });

    it("includes error message for error status", () => {
      const span = {
        context: {
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
        },
        name: "failing-op",
        timing: { startTime: 0 },
        status: "error" as const,
        error: "Connection timeout",
      };

      const log = formatSpanForLog(span);

      expect(log).toContain("ERROR: Connection timeout");
    });

    it("omits duration when not set", () => {
      const span = {
        context: {
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
        },
        name: "in-progress",
        timing: { startTime: 0 },
        status: "ok" as const,
      };

      const log = formatSpanForLog(span);

      expect(log).not.toContain("ms)");
    });
  });

  describe("withSpan", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("executes function and returns result with span", async () => {
      const { result, span } = await withSpan("test-op", async () => {
        return "success";
      });

      expect(result).toBe("success");
      expect(span.name).toBe("test-op");
      expect(span.status).toBe("ok");
    });

    it("provides context to function", async () => {
      let capturedContext: SpanContext | undefined;

      await withSpan("test-op", async (ctx) => {
        capturedContext = ctx;
      });

      expect(capturedContext?.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(capturedContext?.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("creates child span when parent provided", async () => {
      const parent: SpanContext = {
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      };

      const { span } = await withSpan(
        "child-op",
        async () => "result",
        parent
      );

      expect(span.context.traceId).toBe(parent.traceId);
      expect(span.context.parentSpanId).toBe(parent.spanId);
    });

    it("records error status on exception", async () => {
      try {
        await withSpan("failing-op", async () => {
          throw new Error("Test error");
        });
      } catch (error) {
        const err = error as Error & { span: { status: string; error: string } };
        expect(err.span.status).toBe("error");
        expect(err.span.error).toBe("Test error");
      }
    });

    it("re-throws the original error", async () => {
      const originalError = new Error("Original");

      await expect(
        withSpan("failing-op", async () => {
          throw originalError;
        })
      ).rejects.toThrow("Original");
    });
  });
});
