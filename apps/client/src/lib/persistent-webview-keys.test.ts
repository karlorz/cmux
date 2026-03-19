import { describe, expect, it } from "vitest";
import {
  getTaskRunPersistKey,
  getTaskRunPreviewPersistKey,
  getTaskRunPullRequestPersistKey,
  getTaskRunBrowserPersistKey,
} from "./persistent-webview-keys";

describe("persistent-webview-keys", () => {
  describe("getTaskRunPersistKey", () => {
    it("returns key with task-run prefix", () => {
      const result = getTaskRunPersistKey("run-123");
      expect(result).toBe("task-run:run-123");
    });

    it("handles empty taskRunId", () => {
      const result = getTaskRunPersistKey("");
      expect(result).toBe("task-run:");
    });

    it("handles special characters in taskRunId", () => {
      const result = getTaskRunPersistKey("run_with-special:chars");
      expect(result).toBe("task-run:run_with-special:chars");
    });
  });

  describe("getTaskRunPreviewPersistKey", () => {
    it("returns key with preview prefix and port", () => {
      const result = getTaskRunPreviewPersistKey("run-123", 3000);
      expect(result).toBe("task-run-preview:run-123:3000");
    });

    it("handles string port", () => {
      const result = getTaskRunPreviewPersistKey("run-456", "8080");
      expect(result).toBe("task-run-preview:run-456:8080");
    });

    it("handles numeric port", () => {
      const result = getTaskRunPreviewPersistKey("run-789", 443);
      expect(result).toBe("task-run-preview:run-789:443");
    });

    it("converts number port to string", () => {
      const result = getTaskRunPreviewPersistKey("run-abc", 5173);
      expect(result).toContain("5173");
      expect(typeof result).toBe("string");
    });
  });

  describe("getTaskRunPullRequestPersistKey", () => {
    it("returns key with pull request prefix", () => {
      const result = getTaskRunPullRequestPersistKey("run-123");
      expect(result).toBe("task-run-pr:run-123");
    });

    it("handles various taskRunId formats", () => {
      expect(getTaskRunPullRequestPersistKey("abc")).toBe("task-run-pr:abc");
      expect(getTaskRunPullRequestPersistKey("run-uuid-v4-style")).toBe(
        "task-run-pr:run-uuid-v4-style"
      );
    });
  });

  describe("getTaskRunBrowserPersistKey", () => {
    it("returns key with browser prefix", () => {
      const result = getTaskRunBrowserPersistKey("run-123");
      expect(result).toBe("task-run-browser:run-123");
    });

    it("handles various taskRunId formats", () => {
      expect(getTaskRunBrowserPersistKey("xyz")).toBe("task-run-browser:xyz");
    });
  });

  describe("key uniqueness", () => {
    it("all key types are unique for same taskRunId", () => {
      const taskRunId = "test-run-id";

      const keys = [
        getTaskRunPersistKey(taskRunId),
        getTaskRunPreviewPersistKey(taskRunId, 3000),
        getTaskRunPullRequestPersistKey(taskRunId),
        getTaskRunBrowserPersistKey(taskRunId),
      ];

      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it("preview keys with different ports are unique", () => {
      const taskRunId = "test-run-id";

      const key1 = getTaskRunPreviewPersistKey(taskRunId, 3000);
      const key2 = getTaskRunPreviewPersistKey(taskRunId, 3001);
      const key3 = getTaskRunPreviewPersistKey(taskRunId, 8080);

      const uniqueKeys = new Set([key1, key2, key3]);
      expect(uniqueKeys.size).toBe(3);
    });
  });
});
