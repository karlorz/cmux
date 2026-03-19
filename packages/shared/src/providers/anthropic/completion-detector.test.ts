import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the file-marker-detector module to avoid filesystem access
vi.mock("../common/file-marker-detector", () => ({
  createFileMarkerDetector: vi.fn(() => Promise.resolve()),
}));

import { startClaudeCompletionDetector } from "./completion-detector";
import { createFileMarkerDetector } from "../common/file-marker-detector";

describe("startClaudeCompletionDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("is a function", () => {
    expect(typeof startClaudeCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    const result = startClaudeCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("calls createFileMarkerDetector with correct options", () => {
    const taskRunId = "task_claude123";
    startClaudeCompletionDetector(taskRunId);

    expect(createFileMarkerDetector).toHaveBeenCalledWith({
      markerPath: `/root/lifecycle/claude-complete-${taskRunId}`,
      watchDir: "/root/lifecycle",
      markerFilename: `claude-complete-${taskRunId}`,
    });
  });

  it("generates correct marker filename from task run ID", () => {
    const taskRunId = "run_abc_xyz_123";
    startClaudeCompletionDetector(taskRunId);

    expect(createFileMarkerDetector).toHaveBeenCalledWith(
      expect.objectContaining({
        markerFilename: `claude-complete-${taskRunId}`,
      })
    );
  });
});
