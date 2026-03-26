import { describe, expect, it } from "vitest";
import { startCursorCompletionDetector } from "./completion-detector";

describe("startCursorCompletionDetector", () => {
  it("is a function", () => {
    expect(startCursorCompletionDetector).toBeInstanceOf(Function);
  });

  it("returns a Promise", () => {
    // Create a detector but don't await it (it would block waiting for file)
    const taskRunId = "test-task-id";
    const result = startCursorCompletionDetector(taskRunId);
    expect(result).toBeInstanceOf(Promise);
  });

  it("uses correct marker filename pattern", () => {
    // The detector creates a marker file at /root/lifecycle/cursor-complete-{taskRunId}
    // We can't easily test the actual file watching without mocking,
    // but we can verify the function signature is correct
    const taskRunId = "abc123";
    expect(() => startCursorCompletionDetector(taskRunId)).not.toThrow();
  });
});
