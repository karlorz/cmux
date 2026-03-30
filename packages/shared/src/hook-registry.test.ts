import { describe, it, expect } from "vitest";
import {
  HOOK_REGISTRY,
  getHookDefinition,
  isHookSupported,
  getHooksForProvider,
  isHookCritical,
  getDispatchScript,
} from "./hook-registry";

describe("hook-registry", () => {
  describe("HOOK_REGISTRY", () => {
    it("contains expected hook types", () => {
      const types = HOOK_REGISTRY.map((h) => h.type);

      expect(types).toContain("session_start");
      expect(types).toContain("session_stop");
      expect(types).toContain("error");
      expect(types).toContain("context_warning");
    });

    it("marks session_stop as critical", () => {
      const sessionStop = HOOK_REGISTRY.find((h) => h.type === "session_stop");
      expect(sessionStop?.critical).toBe(true);
    });

    it("marks session_start as non-critical", () => {
      const sessionStart = HOOK_REGISTRY.find((h) => h.type === "session_start");
      expect(sessionStart?.critical).toBe(false);
    });
  });

  describe("getHookDefinition", () => {
    it("returns definition for known hook type", () => {
      const def = getHookDefinition("session_start");

      expect(def).toBeDefined();
      expect(def?.type).toBe("session_start");
      expect(def?.providers).toContain("claude");
    });

    it("returns undefined for unknown hook type", () => {
      // @ts-expect-error Testing unknown type
      const def = getHookDefinition("unknown_type");
      expect(def).toBeUndefined();
    });
  });

  describe("isHookSupported", () => {
    it("returns true for supported provider/hook combination", () => {
      expect(isHookSupported("session_start", "claude")).toBe(true);
      expect(isHookSupported("session_start", "codex")).toBe(true);
      expect(isHookSupported("session_stop", "claude")).toBe(true);
    });

    it("returns false for unsupported combinations", () => {
      // context_warning is Claude-only
      expect(isHookSupported("context_warning", "codex")).toBe(false);
      expect(isHookSupported("context_warning", "gemini")).toBe(false);
    });

    it("returns false for unknown hook types", () => {
      // @ts-expect-error Testing unknown type
      expect(isHookSupported("unknown_type", "claude")).toBe(false);
    });
  });

  describe("getHooksForProvider", () => {
    it("returns hooks for claude provider", () => {
      const hooks = getHooksForProvider("claude");

      expect(hooks.length).toBeGreaterThan(0);
      expect(hooks.some((h) => h.type === "session_start")).toBe(true);
      expect(hooks.some((h) => h.type === "context_warning")).toBe(true);
    });

    it("returns hooks for codex provider", () => {
      const hooks = getHooksForProvider("codex");

      expect(hooks.length).toBeGreaterThan(0);
      expect(hooks.some((h) => h.type === "session_start")).toBe(true);
      // context_warning is Claude-only
      expect(hooks.some((h) => h.type === "context_warning")).toBe(false);
    });
  });

  describe("isHookCritical", () => {
    it("returns true for critical hooks", () => {
      expect(isHookCritical("session_stop")).toBe(true);
    });

    it("returns false for non-critical hooks", () => {
      expect(isHookCritical("session_start")).toBe(false);
      expect(isHookCritical("error")).toBe(false);
    });
  });

  describe("getDispatchScript", () => {
    it("returns null for unsupported combinations", () => {
      expect(getDispatchScript("context_warning", "codex")).toBeNull();
    });

    it("returns valid script for session_start", () => {
      const script = getDispatchScript("session_start", "claude");

      expect(script).toBeTruthy();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("session_start");
      expect(script).toContain("claude");
    });

    it("returns valid script for session_stop with memory sync", () => {
      const script = getDispatchScript("session_stop", "claude");

      expect(script).toBeTruthy();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("sync.sh");
      expect(script).toContain("done.txt");
    });

    it("returns valid script for error hook", () => {
      const script = getDispatchScript("error", "codex");

      expect(script).toBeTruthy();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("ERROR_MSG");
      expect(script).toContain("codex");
    });

    it("returns valid script for context_warning (claude only)", () => {
      const script = getDispatchScript("context_warning", "claude");

      expect(script).toBeTruthy();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("TRIGGER");
      expect(script).toContain("context_warning");
    });

    it("returns valid script for tool_call", () => {
      const script = getDispatchScript("tool_call", "claude");

      expect(script).toBeTruthy();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("TOOL_NAME");
      expect(script).toContain("SUMMARY");
    });

    it("includes CMUX environment variable checks", () => {
      const script = getDispatchScript("session_start", "claude");

      expect(script).toContain("CMUX_TASK_RUN_JWT");
      expect(script).toContain("CMUX_CALLBACK_URL");
      expect(script).toContain("CMUX_TASK_RUN_ID");
    });

    it("uses non-blocking curl for activity events", () => {
      const script = getDispatchScript("session_start", "claude");

      // Script should run curl in background
      expect(script).toContain(") &");
    });

    it("uses appropriate log file path for provider", () => {
      const claudeScript = getDispatchScript("session_start", "claude");
      const codexScript = getDispatchScript("session_start", "codex");

      expect(claudeScript).toContain("/root/lifecycle/claude-hook.log");
      expect(codexScript).toContain("/root/lifecycle/codex-hook.log");
    });
  });
});
