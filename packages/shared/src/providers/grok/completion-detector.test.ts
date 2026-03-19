import { describe, expect, it } from "vitest";
import { startGrokCompletionDetector } from "./completion-detector";

describe("startGrokCompletionDetector", () => {
  it("is a function", () => {
    expect(typeof startGrokCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    // The detector will hang waiting for the telemetry file,
    // but we can verify it returns a Promise
    const result = startGrokCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);

    // We don't await it since it would hang - just verify it's a promise
  });

  it("accepts task run ID parameter", () => {
    // Verify the function signature accepts a string
    expect(() => startGrokCompletionDetector("task_grok123")).not.toThrow();
  });
});
