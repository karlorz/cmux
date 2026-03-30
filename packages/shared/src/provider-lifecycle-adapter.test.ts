import { describe, it, expect } from "vitest";
import {
  buildThinHookStub,
  buildThinHookStubFile,
  buildSessionStartHook,
  buildSessionStopHook,
} from "./provider-lifecycle-adapter";

describe("provider-lifecycle-adapter", () => {
  describe("buildSessionStartHook", () => {
    it("creates a valid session start hook script", () => {
      const script = buildSessionStartHook({ provider: "claude" });

      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("session_start");
      expect(script).toContain("Session started");
      expect(script).toContain("CMUX_TASK_RUN_JWT");
      expect(script).toContain("CMUX_CALLBACK_URL");
    });

    it("respects custom log file path", () => {
      const script = buildSessionStartHook({
        provider: "codex",
        logFile: "/custom/log/path.log",
      });

      expect(script).toContain("/custom/log/path.log");
    });
  });

  describe("buildSessionStopHook", () => {
    it("creates a valid session stop hook script with memory sync", () => {
      const script = buildSessionStopHook({ provider: "claude" });

      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("session_stop");
      expect(script).toContain("sync.sh");
      expect(script).toContain("done.txt");
    });

    it("skips memory sync when disabled", () => {
      const script = buildSessionStopHook({
        provider: "claude",
        includeMemorySync: false,
      });

      expect(script).not.toContain("sync.sh");
    });

    it("skips completion marker when disabled", () => {
      const script = buildSessionStopHook({
        provider: "claude",
        createCompletionMarker: false,
      });

      expect(script).not.toContain("done.txt");
    });
  });

  describe("buildThinHookStub", () => {
    it("creates a valid thin stub script", () => {
      const script = buildThinHookStub("session_start", "claude");

      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("Thin hook stub for session_start (claude)");
      expect(script).toContain("CACHE_FILE=");
      expect(script).toContain("/api/hooks/dispatch");
      expect(script).toContain("x-cmux-token");
    });

    it("includes correct cache file path", () => {
      const script = buildThinHookStub("session_stop", "codex");

      expect(script).toContain("/tmp/cmux-hook-cache-session_stop-codex");
    });

    it("respects custom timeout", () => {
      const script = buildThinHookStub("session_start", "claude", {
        timeout: 10,
      });

      expect(script).toContain("FETCH_TIMEOUT=10");
    });

    it("respects custom cache TTL", () => {
      const script = buildThinHookStub("session_start", "claude", {
        cacheTtlSeconds: 120,
      });

      expect(script).toContain("CACHE_TTL_SECONDS=120");
    });

    it("includes fallback script when provided", () => {
      const fallback = `#!/bin/bash
echo "Fallback executed"
exit 0`;
      const script = buildThinHookStub("session_stop", "claude", {
        fallbackScript: fallback,
      });

      expect(script).toContain("run_fallback()");
      expect(script).toContain("Fallback executed");
      expect(script).toContain("FALLBACK_EOF");
    });

    it("exits gracefully when no fallback is provided", () => {
      const script = buildThinHookStub("session_start", "claude");

      expect(script).toContain("run_fallback()");
      expect(script).toContain("exit 0");
    });

    it("passes stdin to dispatch script", () => {
      const script = buildThinHookStub("session_start", "claude");

      expect(script).toContain('HOOK_INPUT="$(cat)"');
      expect(script).toContain('printf \'%s\' "$HOOK_INPUT"');
    });

    it("validates fetched script starts with shebang", () => {
      const script = buildThinHookStub("session_start", "claude");

      expect(script).toContain('head -1 | grep -q "^#!"');
    });
  });

  describe("buildThinHookStubFile", () => {
    it("creates a valid file entry", () => {
      const mockBuffer = (content: string) => ({
        toString: (encoding: "base64") => {
          if (encoding === "base64") {
            return Buffer.from(content).toString("base64");
          }
          return content;
        },
      });

      const file = buildThinHookStubFile(
        "session_start",
        "claude",
        "/root/lifecycle/claude/session-start-hook.sh",
        mockBuffer
      );

      expect(file.destinationPath).toBe(
        "/root/lifecycle/claude/session-start-hook.sh"
      );
      expect(file.mode).toBe("755");
      expect(file.contentBase64).toBeTruthy();

      // Decode and verify content
      const decoded = Buffer.from(file.contentBase64, "base64").toString(
        "utf-8"
      );
      expect(decoded).toContain("#!/bin/bash");
      expect(decoded).toContain("session_start");
    });

    it("includes fallback script in file when provided", () => {
      const mockBuffer = (content: string) => ({
        toString: (encoding: "base64") => {
          if (encoding === "base64") {
            return Buffer.from(content).toString("base64");
          }
          return content;
        },
      });

      const file = buildThinHookStubFile(
        "session_stop",
        "claude",
        "/root/lifecycle/claude/session-stop-hook.sh",
        mockBuffer,
        {
          fallbackScript: "echo 'critical fallback'",
        }
      );

      const decoded = Buffer.from(file.contentBase64, "base64").toString(
        "utf-8"
      );
      expect(decoded).toContain("critical fallback");
    });
  });
});
