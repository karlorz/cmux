import { describe, it, expect } from "vitest";
import {
  AgentIdSchema,
  SandboxProviderSchema,
  SpawnOptionsSchema,
  CheckpointOptionsSchema,
  MigrateOptionsSchema,
  parseAgentId,
} from "./types.js";

describe("AgentIdSchema", () => {
  it("should accept valid agent IDs", () => {
    expect(AgentIdSchema.parse("claude/opus-4.5")).toBe("claude/opus-4.5");
    expect(AgentIdSchema.parse("codex/gpt-5.4")).toBe("codex/gpt-5.4");
    expect(AgentIdSchema.parse("gemini/2.5-pro")).toBe("gemini/2.5-pro");
    expect(AgentIdSchema.parse("amp/claude-3.5")).toBe("amp/claude-3.5");
    expect(AgentIdSchema.parse("opencode/big-pickle")).toBe("opencode/big-pickle");
  });

  it("should reject invalid agent IDs", () => {
    expect(() => AgentIdSchema.parse("invalid")).toThrow();
    expect(() => AgentIdSchema.parse("unknown/model")).toThrow();
    expect(() => AgentIdSchema.parse("claude")).toThrow();
    expect(() => AgentIdSchema.parse("/opus")).toThrow();
  });
});

describe("parseAgentId", () => {
  it("should parse agent ID into backend and model", () => {
    expect(parseAgentId("claude/opus-4.5")).toEqual({
      backend: "claude",
      model: "opus-4.5",
    });
    expect(parseAgentId("codex/gpt-5.4-xhigh")).toEqual({
      backend: "codex",
      model: "gpt-5.4-xhigh",
    });
  });
});

describe("SandboxProviderSchema", () => {
  it("should accept valid providers", () => {
    expect(SandboxProviderSchema.parse("pve-lxc")).toBe("pve-lxc");
    expect(SandboxProviderSchema.parse("morph")).toBe("morph");
    expect(SandboxProviderSchema.parse("e2b")).toBe("e2b");
    expect(SandboxProviderSchema.parse("modal")).toBe("modal");
    expect(SandboxProviderSchema.parse("local")).toBe("local");
  });

  it("should reject invalid providers", () => {
    expect(() => SandboxProviderSchema.parse("invalid")).toThrow();
    expect(() => SandboxProviderSchema.parse("docker")).toThrow();
  });
});

describe("SpawnOptionsSchema", () => {
  it("should apply defaults correctly", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
    });

    expect(result.provider).toBe("pve-lxc");
    expect(result.branch).toBe("main");
    expect(result.workDir).toBe("/root/workspace");
    expect(result.timeoutMs).toBe(600000);
    expect(result.sync).toBe(true);
    expect(result.devshPath).toBe("devsh");
  });

  it("should allow overriding defaults", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "codex/gpt-5.4",
      prompt: "Test prompt",
      provider: "morph",
      branch: "feature/test",
      timeoutMs: 300000,
      sync: false,
    });

    expect(result.provider).toBe("morph");
    expect(result.branch).toBe("feature/test");
    expect(result.timeoutMs).toBe(300000);
    expect(result.sync).toBe(false);
  });

  it("should accept optional fields", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "gemini/2.5-pro",
      prompt: "Test",
      repo: "owner/repo",
      snapshotId: "snap-123",
      env: { KEY: "value" },
    });

    expect(result.repo).toBe("owner/repo");
    expect(result.snapshotId).toBe("snap-123");
    expect(result.env).toEqual({ KEY: "value" });
  });
});

describe("CheckpointOptionsSchema", () => {
  it("should require taskId", () => {
    const result = CheckpointOptionsSchema.parse({
      taskId: "task_123",
    });

    expect(result.taskId).toBe("task_123");
    expect(result.devshPath).toBe("devsh");
    expect(result.label).toBeUndefined();
  });

  it("should accept optional label", () => {
    const result = CheckpointOptionsSchema.parse({
      taskId: "task_123",
      label: "before-refactor",
    });

    expect(result.label).toBe("before-refactor");
  });
});

describe("MigrateOptionsSchema", () => {
  it("should require source and targetProvider", () => {
    const result = MigrateOptionsSchema.parse({
      source: "session_abc123",
      targetProvider: "morph",
    });

    expect(result.source).toBe("session_abc123");
    expect(result.targetProvider).toBe("morph");
    expect(result.devshPath).toBe("devsh");
  });

  it("should accept optional fields", () => {
    const result = MigrateOptionsSchema.parse({
      source: "checkpoint_xyz",
      targetProvider: "e2b",
      repo: "owner/repo",
      branch: "feature/test",
      message: "Continue the work",
    });

    expect(result.repo).toBe("owner/repo");
    expect(result.branch).toBe("feature/test");
    expect(result.message).toBe("Continue the work");
  });

  it("should validate targetProvider enum", () => {
    expect(() =>
      MigrateOptionsSchema.parse({
        source: "session_123",
        targetProvider: "invalid",
      })
    ).toThrow();
  });
});
