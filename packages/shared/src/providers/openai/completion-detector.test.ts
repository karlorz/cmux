import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the file-marker-detector module to avoid filesystem access
vi.mock("../common/file-marker-detector", () => ({
  createFileMarkerDetector: vi.fn(() => Promise.resolve()),
}));

import {
  createCodexDetector,
  startCodexCompletionDetector,
} from "./completion-detector";
import { createFileMarkerDetector } from "../common/file-marker-detector";

describe("createCodexDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("is a function", () => {
    expect(typeof createCodexDetector).toBe("function");
  });

  it("returns a Promise", () => {
    const result = createCodexDetector({
      taskRunId: "test-task-id",
      startTime: Date.now(),
    });
    expect(result).toBeInstanceOf(Promise);
  });

  it("calls createFileMarkerDetector with correct options", async () => {
    const taskRunId = "task_codex123";
    await createCodexDetector({
      taskRunId,
      startTime: Date.now(),
    });

    expect(createFileMarkerDetector).toHaveBeenCalledWith({
      markerPath: "/root/lifecycle/codex-done.txt",
      watchDir: "/root/lifecycle",
      markerFilename: "codex-done.txt",
      onComplete: expect.any(Function),
    });
  });

  it("uses fixed marker path regardless of task ID", async () => {
    await createCodexDetector({
      taskRunId: "any-task-id",
      startTime: Date.now(),
    });

    expect(createFileMarkerDetector).toHaveBeenCalledWith(
      expect.objectContaining({
        markerPath: "/root/lifecycle/codex-done.txt",
        markerFilename: "codex-done.txt",
      })
    );
  });
});

describe("startCodexCompletionDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("is a function", () => {
    expect(typeof startCodexCompletionDetector).toBe("function");
  });

  it("returns a Promise", () => {
    const result = startCodexCompletionDetector("test-task-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("delegates to createCodexDetector", async () => {
    await startCodexCompletionDetector("task_xyz_456");

    expect(createFileMarkerDetector).toHaveBeenCalledWith(
      expect.objectContaining({
        markerPath: "/root/lifecycle/codex-done.txt",
        watchDir: "/root/lifecycle",
      })
    );
  });
});
