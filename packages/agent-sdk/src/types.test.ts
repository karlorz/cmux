import { describe, it, expect } from "vitest";
import {
  AgentIdSchema,
  SandboxProviderSchema,
  SpawnOptionsSchema,
  CheckpointOptionsSchema,
  MigrateOptionsSchema,
  SpawnManyOptionsSchema,
  PermissionModeSchema,
  SettingSourceSchema,
  SystemPromptConfigSchema,
  MODEL_PRICING,
  parseAgentId,
  calculateCost,
  getModelPricing,
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

describe("SpawnManyOptionsSchema", () => {
  it("should accept valid parallel spawn options", () => {
    const result = SpawnManyOptionsSchema.parse({
      tasks: [
        { agent: "claude/opus-4.5", prompt: "Task 1" },
        { agent: "codex/gpt-5.4", prompt: "Task 2" },
      ],
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.failFast).toBe(false);
    expect(result.devshPath).toBe("devsh");
  });

  it("should apply defaults to task items", () => {
    const result = SpawnManyOptionsSchema.parse({
      tasks: [{ agent: "gemini/2.5-pro", prompt: "Test" }],
    });

    expect(result.tasks[0].provider).toBe("pve-lxc");
    expect(result.tasks[0].branch).toBe("main");
    expect(result.tasks[0].timeoutMs).toBe(600000);
  });

  it("should accept concurrency and failFast options", () => {
    const result = SpawnManyOptionsSchema.parse({
      tasks: [{ agent: "amp/claude-3.5", prompt: "Test" }],
      concurrency: 3,
      failFast: true,
    });

    expect(result.concurrency).toBe(3);
    expect(result.failFast).toBe(true);
  });

  it("should accept optional task names", () => {
    const result = SpawnManyOptionsSchema.parse({
      tasks: [
        { name: "auth-refactor", agent: "claude/opus-4.5", prompt: "Refactor auth" },
        { agent: "codex/gpt-5.4", prompt: "Add tests" },
      ],
    });

    expect(result.tasks[0].name).toBe("auth-refactor");
    expect(result.tasks[1].name).toBeUndefined();
  });
});

describe("MODEL_PRICING", () => {
  it("should have pricing for Claude models", () => {
    expect(MODEL_PRICING["claude-opus-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-opus-4-6"].inputPerMillion).toBe(15);
    expect(MODEL_PRICING["claude-opus-4-6"].outputPerMillion).toBe(75);
  });

  it("should have pricing for Codex models", () => {
    expect(MODEL_PRICING["gpt-5.4"]).toBeDefined();
    expect(MODEL_PRICING["gpt-5.1-codex-mini"]).toBeDefined();
  });

  it("should have pricing for Gemini models", () => {
    expect(MODEL_PRICING["2.5-pro"]).toBeDefined();
    expect(MODEL_PRICING["2.5-flash"]).toBeDefined();
  });

  it("should include cache pricing for Claude models", () => {
    const opus = MODEL_PRICING["claude-opus-4-6"];
    expect(opus.cacheReadPerMillion).toBe(1.5);
    expect(opus.cacheWritePerMillion).toBe(18.75);
  });
});

describe("calculateCost", () => {
  it("should calculate basic input/output costs", () => {
    const tokens = {
      inputTokens: 1000000,
      outputTokens: 500000,
      totalTokens: 1500000,
    };
    const pricing = { inputPerMillion: 10, outputPerMillion: 30 };

    const cost = calculateCost(tokens, pricing);

    expect(cost.inputCost).toBe(10);
    expect(cost.outputCost).toBe(15);
    expect(cost.totalCost).toBe(25);
    expect(cost.currency).toBe("USD");
  });

  it("should include cache costs when applicable", () => {
    const tokens = {
      inputTokens: 100000,
      outputTokens: 50000,
      cacheReadTokens: 200000,
      cacheWriteTokens: 100000,
      totalTokens: 150000,
    };
    const pricing = {
      inputPerMillion: 15,
      outputPerMillion: 75,
      cacheReadPerMillion: 1.5,
      cacheWritePerMillion: 18.75,
    };

    const cost = calculateCost(tokens, pricing);

    expect(cost.inputCost).toBeCloseTo(1.5);
    expect(cost.outputCost).toBeCloseTo(3.75);
    expect(cost.cacheCost).toBeCloseTo(0.3 + 1.875);
    expect(cost.totalCost).toBeCloseTo(1.5 + 3.75 + 0.3 + 1.875);
  });

  it("should handle zero tokens", () => {
    const tokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const pricing = { inputPerMillion: 15, outputPerMillion: 75 };

    const cost = calculateCost(tokens, pricing);

    expect(cost.totalCost).toBe(0);
  });
});

describe("getModelPricing", () => {
  it("should return pricing for exact model match", () => {
    const pricing = getModelPricing("claude-opus-4-6");

    expect(pricing).toBeDefined();
    expect(pricing!.inputPerMillion).toBe(15);
  });

  it("should return pricing for partial model match", () => {
    const pricing = getModelPricing("opus-4.5");

    expect(pricing).toBeDefined();
    expect(pricing!.inputPerMillion).toBe(15);
  });

  it("should return undefined for unknown models", () => {
    const pricing = getModelPricing("unknown-model-xyz");

    expect(pricing).toBeUndefined();
  });

  it("should normalize model names for matching", () => {
    const pricing1 = getModelPricing("gpt-5.4");
    const pricing2 = getModelPricing("gpt54");

    expect(pricing1).toBeDefined();
    expect(pricing2).toBeDefined();
  });
});

describe("PermissionModeSchema", () => {
  it("should accept all valid permission modes", () => {
    expect(PermissionModeSchema.parse("default")).toBe("default");
    expect(PermissionModeSchema.parse("acceptEdits")).toBe("acceptEdits");
    expect(PermissionModeSchema.parse("bypassPermissions")).toBe("bypassPermissions");
    expect(PermissionModeSchema.parse("plan")).toBe("plan");
    expect(PermissionModeSchema.parse("delegate")).toBe("delegate");
    expect(PermissionModeSchema.parse("dontAsk")).toBe("dontAsk");
  });

  it("should reject invalid permission modes", () => {
    expect(() => PermissionModeSchema.parse("invalid")).toThrow();
    expect(() => PermissionModeSchema.parse("yolo")).toThrow();
  });
});

describe("SettingSourceSchema", () => {
  it("should accept all valid setting sources", () => {
    expect(SettingSourceSchema.parse("user")).toBe("user");
    expect(SettingSourceSchema.parse("project")).toBe("project");
    expect(SettingSourceSchema.parse("local")).toBe("local");
  });

  it("should reject invalid setting sources", () => {
    expect(() => SettingSourceSchema.parse("invalid")).toThrow();
    expect(() => SettingSourceSchema.parse("global")).toThrow();
  });
});

describe("SystemPromptConfigSchema", () => {
  it("should accept preset system prompts", () => {
    const result = SystemPromptConfigSchema.parse({
      type: "preset",
      preset: "claude_code",
    });
    expect(result).toEqual({ type: "preset", preset: "claude_code" });
  });

  it("should accept all preset types", () => {
    expect(SystemPromptConfigSchema.parse({ type: "preset", preset: "claude_code" })).toBeDefined();
    expect(SystemPromptConfigSchema.parse({ type: "preset", preset: "minimal" })).toBeDefined();
    expect(SystemPromptConfigSchema.parse({ type: "preset", preset: "custom" })).toBeDefined();
  });

  it("should accept custom system prompts", () => {
    const result = SystemPromptConfigSchema.parse({
      type: "custom",
      content: "You are a helpful assistant.",
    });
    expect(result).toEqual({
      type: "custom",
      content: "You are a helpful assistant.",
    });
  });

  it("should reject invalid system prompt types", () => {
    expect(() =>
      SystemPromptConfigSchema.parse({
        type: "invalid",
        content: "test",
      })
    ).toThrow();
  });

  it("should reject preset with missing preset field", () => {
    expect(() =>
      SystemPromptConfigSchema.parse({
        type: "preset",
      })
    ).toThrow();
  });

  it("should reject custom with missing content field", () => {
    expect(() =>
      SystemPromptConfigSchema.parse({
        type: "custom",
      })
    ).toThrow();
  });
});

describe("SpawnOptionsSchema Claude Agent SDK options", () => {
  it("should accept permissionMode option", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      permissionMode: "acceptEdits",
    });
    expect(result.permissionMode).toBe("acceptEdits");
  });

  it("should accept settingSources option", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      settingSources: ["user", "project"],
    });
    expect(result.settingSources).toEqual(["user", "project"]);
  });

  it("should accept systemPrompt preset option", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      systemPrompt: { type: "preset", preset: "minimal" },
    });
    expect(result.systemPrompt).toEqual({ type: "preset", preset: "minimal" });
  });

  it("should accept systemPrompt custom option", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      systemPrompt: { type: "custom", content: "Custom prompt" },
    });
    expect(result.systemPrompt).toEqual({ type: "custom", content: "Custom prompt" });
  });

  it("should accept allowedTools option", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      allowedTools: ["Read", "Write", "Bash"],
    });
    expect(result.allowedTools).toEqual(["Read", "Write", "Bash"]);
  });

  it("should accept disallowedTools option", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      disallowedTools: ["Bash", "Agent"],
    });
    expect(result.disallowedTools).toEqual(["Bash", "Agent"]);
  });

  it("should accept all Claude Agent SDK options together", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.5",
      prompt: "Test prompt",
      permissionMode: "bypassPermissions",
      settingSources: ["project", "local"],
      systemPrompt: { type: "preset", preset: "claude_code" },
      allowedTools: ["Read", "Grep", "Glob"],
      disallowedTools: ["Bash"],
    });

    expect(result.permissionMode).toBe("bypassPermissions");
    expect(result.settingSources).toEqual(["project", "local"]);
    expect(result.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
    expect(result.allowedTools).toEqual(["Read", "Grep", "Glob"]);
    expect(result.disallowedTools).toEqual(["Bash"]);
  });

  it("should allow omitting Claude Agent SDK options for non-Claude agents", () => {
    const result = SpawnOptionsSchema.parse({
      agent: "codex/gpt-5.4",
      prompt: "Test prompt",
    });

    expect(result.permissionMode).toBeUndefined();
    expect(result.settingSources).toBeUndefined();
    expect(result.systemPrompt).toBeUndefined();
    expect(result.allowedTools).toBeUndefined();
    expect(result.disallowedTools).toBeUndefined();
  });
});
