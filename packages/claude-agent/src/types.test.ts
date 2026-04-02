import { describe, it, expect } from "vitest";
import {
  CmuxSandboxConfigSchema,
  CmuxAgentDefinitionSchema,
  CmuxAgentOptionsSchema,
  SandboxProviderSchema,
} from "./types.js";

describe("SandboxProviderSchema", () => {
  it("accepts valid providers", () => {
    expect(SandboxProviderSchema.parse("pve-lxc")).toBe("pve-lxc");
    expect(SandboxProviderSchema.parse("morph")).toBe("morph");
    expect(SandboxProviderSchema.parse("e2b")).toBe("e2b");
    expect(SandboxProviderSchema.parse("modal")).toBe("modal");
  });

  it("rejects invalid providers", () => {
    expect(() => SandboxProviderSchema.parse("invalid")).toThrow();
  });
});

describe("CmuxSandboxConfigSchema", () => {
  it("parses minimal config with defaults", () => {
    const config = CmuxSandboxConfigSchema.parse({});
    expect(config.provider).toBe("pve-lxc");
    expect(config.branch).toBe("main");
    expect(config.workDir).toBe("/root/workspace");
    expect(config.timeoutMs).toBe(600000);
  });

  it("parses full config", () => {
    const config = CmuxSandboxConfigSchema.parse({
      provider: "morph",
      repo: "owner/repo",
      branch: "feature",
      snapshotId: "snap_123",
      workDir: "/custom",
      timeoutMs: 300000,
      env: { FOO: "bar" },
    });
    expect(config.provider).toBe("morph");
    expect(config.repo).toBe("owner/repo");
    expect(config.branch).toBe("feature");
    expect(config.snapshotId).toBe("snap_123");
    expect(config.workDir).toBe("/custom");
    expect(config.timeoutMs).toBe(300000);
    expect(config.env).toEqual({ FOO: "bar" });
  });
});

describe("CmuxAgentDefinitionSchema", () => {
  it("parses minimal agent definition", () => {
    const agent = CmuxAgentDefinitionSchema.parse({
      description: "Test agent",
    });
    expect(agent.description).toBe("Test agent");
    expect(agent.sandbox).toBeUndefined();
  });

  it("parses agent with sandbox config", () => {
    const agent = CmuxAgentDefinitionSchema.parse({
      description: "Remote worker",
      prompt: "You are a code reviewer",
      tools: ["Read", "Grep"],
      model: "sonnet",
      sandbox: {
        provider: "pve-lxc",
        repo: "owner/repo",
      },
    });
    expect(agent.description).toBe("Remote worker");
    expect(agent.prompt).toBe("You are a code reviewer");
    expect(agent.tools).toEqual(["Read", "Grep"]);
    expect(agent.model).toBe("sonnet");
    expect(agent.sandbox?.provider).toBe("pve-lxc");
    expect(agent.sandbox?.repo).toBe("owner/repo");
  });
});

describe("CmuxAgentOptionsSchema", () => {
  it("parses minimal options with defaults", () => {
    const opts = CmuxAgentOptionsSchema.parse({});
    expect(opts.devshPath).toBe("devsh");
  });

  it("parses full options", () => {
    const opts = CmuxAgentOptionsSchema.parse({
      allowedTools: ["Read", "Agent"],
      agents: {
        worker: {
          description: "Worker agent",
          sandbox: { provider: "morph" },
        },
      },
      cwd: "/workspace",
      model: "opus",
      maxTokens: 4096,
      devshPath: "/custom/devsh",
      apiBaseUrl: "https://api.example.com",
      authToken: "token123",
    });
    expect(opts.allowedTools).toEqual(["Read", "Agent"]);
    expect(opts.agents?.worker.description).toBe("Worker agent");
    expect(opts.agents?.worker.sandbox?.provider).toBe("morph");
    expect(opts.cwd).toBe("/workspace");
    expect(opts.model).toBe("opus");
    expect(opts.maxTokens).toBe(4096);
    expect(opts.devshPath).toBe("/custom/devsh");
    expect(opts.apiBaseUrl).toBe("https://api.example.com");
    expect(opts.authToken).toBe("token123");
  });
});
