import { describe, expect, it } from "vitest";
import { startOpenCodeCompletionDetector } from "./completion-detector";

describe("startOpenCodeCompletionDetector", () => {
  it("is a function", () => {
    expect(typeof startOpenCodeCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    // The detector will hang waiting for the marker file,
    // but we can verify it returns a Promise
    const result = startOpenCodeCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("accepts task run ID parameter", () => {
    expect(() => startOpenCodeCompletionDetector("task_opencode123")).not.toThrow();
  });
});
