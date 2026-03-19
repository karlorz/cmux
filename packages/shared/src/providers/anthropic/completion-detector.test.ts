import { describe, expect, it } from "vitest";
import { startClaudeCompletionDetector } from "./completion-detector";

describe("startClaudeCompletionDetector", () => {
  it("is a function", () => {
    expect(typeof startClaudeCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    // The detector will hang waiting for the marker file,
    // but we can verify it returns a Promise
    const result = startClaudeCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("accepts task run ID parameter", () => {
    expect(() => startClaudeCompletionDetector("task_claude123")).not.toThrow();
  });
});
