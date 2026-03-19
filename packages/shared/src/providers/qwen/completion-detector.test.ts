import { describe, expect, it } from "vitest";
import { startQwenCompletionDetector } from "./completion-detector";

describe("startQwenCompletionDetector", () => {
  it("is a function", () => {
    expect(typeof startQwenCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    // The detector will hang waiting for the telemetry file,
    // but we can verify it returns a Promise
    const result = startQwenCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);

    // We don't await it since it would hang - just verify it's a promise
  });

  it("accepts task run ID parameter", () => {
    // Verify the function signature accepts a string
    expect(() => startQwenCompletionDetector("task_abc123")).not.toThrow();
  });
});
