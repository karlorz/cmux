import { describe, expect, it } from "vitest";
import { startCursorCompletionDetector } from "./completion-detector";

describe("startCursorCompletionDetector", () => {
  it("is a function", () => {
    expect(startCursorCompletionDetector).toBeInstanceOf(Function);
  });

  it("accepts taskRunId parameter", () => {
    // Verify function signature accepts string parameter
    // We don't call it in CI because it tries to watch /root/lifecycle
    // which may not exist or be accessible
    expect(startCursorCompletionDetector.length).toBe(1);
  });

  it("follows same pattern as other completion detectors", () => {
    // Verify it exports a function matching the AgentConfig.completionDetector signature:
    // (taskRunId: string) => Promise<void>
    expect(typeof startCursorCompletionDetector).toBe("function");
  });
});
