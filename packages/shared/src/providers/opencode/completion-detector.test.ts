import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the file-marker-detector module to avoid filesystem access
vi.mock("../common/file-marker-detector", () => ({
  createFileMarkerDetector: vi.fn(() => Promise.resolve()),
}));

import { startOpenCodeCompletionDetector } from "./completion-detector";
import { createFileMarkerDetector } from "../common/file-marker-detector";

describe("startOpenCodeCompletionDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("is a function", () => {
    expect(typeof startOpenCodeCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    const result = startOpenCodeCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("calls createFileMarkerDetector with correct options", () => {
    const taskRunId = "task_opencode123";
    startOpenCodeCompletionDetector(taskRunId);

    expect(createFileMarkerDetector).toHaveBeenCalledWith({
      markerPath: `/root/lifecycle/opencode-complete-${taskRunId}`,
      watchDir: "/root/lifecycle",
      markerFilename: `opencode-complete-${taskRunId}`,
    });
  });

  it("generates correct marker filename from task run ID", () => {
    const taskRunId = "run_opencode_xyz_456";
    startOpenCodeCompletionDetector(taskRunId);

    expect(createFileMarkerDetector).toHaveBeenCalledWith(
      expect.objectContaining({
        markerFilename: `opencode-complete-${taskRunId}`,
      })
    );
  });
});
