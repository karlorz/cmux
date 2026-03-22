import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startGeminiCompletionDetector } from "./completion-detector";

// Mock the telemetry file detector since it uses real fs operations
vi.mock("../common/telemetry-file-detector", () => ({
  createTelemetryFileDetector: vi.fn(() => Promise.resolve()),
}));

describe("startGeminiCompletionDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a Promise", () => {
    const result = startGeminiCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("calls createTelemetryFileDetector with correct telemetry path", async () => {
    const { createTelemetryFileDetector } = await import(
      "../common/telemetry-file-detector"
    );

    await startGeminiCompletionDetector("task_123");

    expect(createTelemetryFileDetector).toHaveBeenCalledTimes(1);
    const call = vi.mocked(createTelemetryFileDetector).mock.calls[0][0];
    expect(call.telemetryPath).toContain("task_123");
    expect(typeof call.isCompletionEvent).toBe("function");
  });

  it("isCompletionEvent returns true for next_speaker_check with result=user", async () => {
    const { createTelemetryFileDetector } = await import(
      "../common/telemetry-file-detector"
    );

    await startGeminiCompletionDetector("task_456");

    const call = vi.mocked(createTelemetryFileDetector).mock.calls[0][0];
    const isComplete = call.isCompletionEvent({
      attributes: {
        "event.name": "gemini_cli.next_speaker_check",
        result: "user",
      },
    });
    expect(isComplete).toBe(true);
  });

  it("isCompletionEvent returns true for complete_task tool call", async () => {
    const { createTelemetryFileDetector } = await import(
      "../common/telemetry-file-detector"
    );

    await startGeminiCompletionDetector("task_789");

    const call = vi.mocked(createTelemetryFileDetector).mock.calls[0][0];
    const isComplete = call.isCompletionEvent({
      attributes: {
        "event.name": "gemini_cli.tool_call",
        function_name: "complete_task",
      },
    });
    expect(isComplete).toBe(true);
  });

  it("isCompletionEvent returns true for agent.finish with GOAL", async () => {
    const { createTelemetryFileDetector } = await import(
      "../common/telemetry-file-detector"
    );

    await startGeminiCompletionDetector("task_abc");

    const call = vi.mocked(createTelemetryFileDetector).mock.calls[0][0];
    const isComplete = call.isCompletionEvent({
      attributes: {
        "event.name": "gemini_cli.agent.finish",
        terminate_reason: "GOAL",
      },
    });
    expect(isComplete).toBe(true);
  });

  it("isCompletionEvent returns true for conversation_finished", async () => {
    const { createTelemetryFileDetector } = await import(
      "../common/telemetry-file-detector"
    );

    await startGeminiCompletionDetector("task_def");

    const call = vi.mocked(createTelemetryFileDetector).mock.calls[0][0];
    const isComplete = call.isCompletionEvent({
      attributes: {
        "event.name": "gemini_cli.conversation_finished",
      },
    });
    expect(isComplete).toBe(true);
  });

  it("isCompletionEvent returns false for unrelated events", async () => {
    const { createTelemetryFileDetector } = await import(
      "../common/telemetry-file-detector"
    );

    await startGeminiCompletionDetector("task_xyz");

    const call = vi.mocked(createTelemetryFileDetector).mock.calls[0][0];
    const isComplete = call.isCompletionEvent({
      attributes: {
        "event.name": "gemini_cli.tool_call",
        function_name: "read_file",
      },
    });
    expect(isComplete).toBe(false);
  });
});
