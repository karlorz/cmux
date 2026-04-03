import { describe, it, expect } from "vitest";
import {
  SpawnToolSchema,
  StatusToolSchema,
  WaitToolSchema,
  InjectToolSchema,
  CheckpointToolSchema,
  MigrateToolSchema,
  ListToolSchema,
  TOOL_DEFINITIONS,
} from "./tools.js";

describe("SpawnToolSchema", () => {
  it("should accept valid spawn input with all fields", () => {
    const input = {
      agent: "claude/opus-4.5",
      prompt: "Fix the bug",
      provider: "pve-lxc" as const,
      repo: "owner/repo",
      branch: "main",
      timeoutMs: 300000,
    };
    const result = SpawnToolSchema.parse(input);
    expect(result.agent).toBe("claude/opus-4.5");
    expect(result.provider).toBe("pve-lxc");
  });

  it("should accept minimal spawn input", () => {
    const input = {
      agent: "codex/gpt-5.4",
      prompt: "Review code",
    };
    const result = SpawnToolSchema.parse(input);
    expect(result.agent).toBe("codex/gpt-5.4");
    expect(result.provider).toBeUndefined();
  });

  it("should reject invalid agent format", () => {
    const input = {
      agent: "invalid-agent",
      prompt: "Test",
    };
    expect(() => SpawnToolSchema.parse(input)).toThrow();
  });

  it("should accept all valid backends", () => {
    const backends = ["claude", "codex", "gemini", "amp", "opencode"];
    for (const backend of backends) {
      const input = {
        agent: `${backend}/model-1`,
        prompt: "Test",
      };
      const result = SpawnToolSchema.parse(input);
      expect(result.agent).toBe(`${backend}/model-1`);
    }
  });

  it("should accept all valid providers", () => {
    const providers = ["pve-lxc", "morph", "e2b", "modal", "local"] as const;
    for (const provider of providers) {
      const input = {
        agent: "claude/opus-4.5",
        prompt: "Test",
        provider,
      };
      const result = SpawnToolSchema.parse(input);
      expect(result.provider).toBe(provider);
    }
  });

  it("should accept Claude Agent SDK options", () => {
    const input = {
      agent: "claude/opus-4.5",
      prompt: "Test",
      permissionMode: "acceptEdits" as const,
      settingSources: ["user", "project"] as const,
      systemPromptPreset: "minimal" as const,
      allowedTools: ["Read", "Write"],
      disallowedTools: ["Bash"],
    };
    const result = SpawnToolSchema.parse(input);
    expect(result.permissionMode).toBe("acceptEdits");
    expect(result.settingSources).toEqual(["user", "project"]);
    expect(result.systemPromptPreset).toBe("minimal");
    expect(result.allowedTools).toEqual(["Read", "Write"]);
    expect(result.disallowedTools).toEqual(["Bash"]);
  });

  it("should accept custom system prompt", () => {
    const input = {
      agent: "claude/opus-4.5",
      prompt: "Test",
      systemPrompt: "You are a helpful code reviewer.",
    };
    const result = SpawnToolSchema.parse(input);
    expect(result.systemPrompt).toBe("You are a helpful code reviewer.");
  });

  it("should reject invalid permission mode", () => {
    const input = {
      agent: "claude/opus-4.5",
      prompt: "Test",
      permissionMode: "invalid",
    };
    expect(() => SpawnToolSchema.parse(input)).toThrow();
  });
});

describe("StatusToolSchema", () => {
  it("should accept valid task ID", () => {
    const input = { taskId: "task_abc123" };
    const result = StatusToolSchema.parse(input);
    expect(result.taskId).toBe("task_abc123");
  });

  it("should reject missing task ID", () => {
    expect(() => StatusToolSchema.parse({})).toThrow();
  });
});

describe("WaitToolSchema", () => {
  it("should accept valid wait input", () => {
    const input = { taskId: "task_123", timeoutMs: 60000 };
    const result = WaitToolSchema.parse(input);
    expect(result.taskId).toBe("task_123");
    expect(result.timeoutMs).toBe(60000);
  });

  it("should apply default timeout", () => {
    const input = { taskId: "task_123" };
    const result = WaitToolSchema.parse(input);
    expect(result.timeoutMs).toBe(300000);
  });
});

describe("InjectToolSchema", () => {
  it("should accept inject with provider migration", () => {
    const input = {
      sessionId: "sess_abc",
      message: "Continue the work",
      provider: "morph" as const,
    };
    const result = InjectToolSchema.parse(input);
    expect(result.sessionId).toBe("sess_abc");
    expect(result.provider).toBe("morph");
  });

  it("should accept inject without provider", () => {
    const input = {
      sessionId: "sess_abc",
      message: "Continue",
    };
    const result = InjectToolSchema.parse(input);
    expect(result.provider).toBeUndefined();
  });
});

describe("CheckpointToolSchema", () => {
  it("should accept checkpoint with label", () => {
    const input = { taskId: "task_123", label: "before-refactor" };
    const result = CheckpointToolSchema.parse(input);
    expect(result.label).toBe("before-refactor");
  });

  it("should accept checkpoint without label", () => {
    const input = { taskId: "task_123" };
    const result = CheckpointToolSchema.parse(input);
    expect(result.label).toBeUndefined();
  });
});

describe("MigrateToolSchema", () => {
  it("should accept valid migration", () => {
    const input = {
      source: "sess_abc",
      targetProvider: "e2b" as const,
      message: "Continue on E2B",
    };
    const result = MigrateToolSchema.parse(input);
    expect(result.targetProvider).toBe("e2b");
  });

  it("should reject invalid provider", () => {
    const input = {
      source: "sess_abc",
      targetProvider: "invalid",
    };
    expect(() => MigrateToolSchema.parse(input)).toThrow();
  });
});

describe("ListToolSchema", () => {
  it("should accept status filter", () => {
    const input = { status: "running" as const, limit: 20 };
    const result = ListToolSchema.parse(input);
    expect(result.status).toBe("running");
    expect(result.limit).toBe(20);
  });

  it("should apply default limit", () => {
    const input = {};
    const result = ListToolSchema.parse(input);
    expect(result.limit).toBe(10);
  });
});

describe("TOOL_DEFINITIONS", () => {
  it("should have 9 tools defined", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(9);
  });

  it("should have unique tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have descriptions for all tools", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("should have all expected tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("cmux_spawn");
    expect(names).toContain("cmux_status");
    expect(names).toContain("cmux_wait");
    expect(names).toContain("cmux_cancel");
    expect(names).toContain("cmux_results");
    expect(names).toContain("cmux_inject");
    expect(names).toContain("cmux_checkpoint");
    expect(names).toContain("cmux_migrate");
    expect(names).toContain("cmux_list");
  });
});
