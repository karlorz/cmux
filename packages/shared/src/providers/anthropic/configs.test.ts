import { describe, expect, it } from "vitest";
import { CLAUDE_AGENT_CONFIGS, createApplyClaudeApiKeys } from "./configs";
import { ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN } from "../../apiKeys";

describe("createApplyClaudeApiKeys", () => {
  const applyApiKeys = createApplyClaudeApiKeys();

  describe("OAuth token priority", () => {
    it("prefers OAuth token over API key when both are set", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
        ANTHROPIC_API_KEY: "sk-ant-api-key-456",
      });
      expect(result.env).toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token-123");
      expect(result.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    });

    it("unsets ANTHROPIC_API_KEY when using OAuth token", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
      });
      expect(result.unsetEnv).toContain("ANTHROPIC_API_KEY");
    });

    it("sets only OAuth token in env when provided", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
      });
      expect(result.env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123" });
    });
  });

  describe("API key fallback", () => {
    it("uses API key when OAuth token is not set", async () => {
      const result = await applyApiKeys({
        ANTHROPIC_API_KEY: "sk-ant-api-key-456",
      });
      expect(result.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-ant-api-key-456");
      expect(result.env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("uses API key when OAuth token is empty string", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "",
        ANTHROPIC_API_KEY: "sk-ant-api-key-456",
      });
      expect(result.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-ant-api-key-456");
    });

    it("uses API key when OAuth token is whitespace only", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "   ",
        ANTHROPIC_API_KEY: "sk-ant-api-key-456",
      });
      expect(result.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-ant-api-key-456");
    });
  });

  describe("env var unsetting", () => {
    it("returns unsetEnv array for OAuth token path", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
      });
      expect(result.unsetEnv).toBeDefined();
      expect(Array.isArray(result.unsetEnv)).toBe(true);
    });

    it("returns unsetEnv array for API key path", async () => {
      const result = await applyApiKeys({
        ANTHROPIC_API_KEY: "sk-ant-api-key-456",
      });
      expect(result.unsetEnv).toBeDefined();
      expect(Array.isArray(result.unsetEnv)).toBe(true);
    });

    it("returns unsetEnv array when no credentials provided", async () => {
      const result = await applyApiKeys({});
      expect(result.unsetEnv).toBeDefined();
      expect(Array.isArray(result.unsetEnv)).toBe(true);
    });
  });

  describe("no credentials", () => {
    it("returns empty env when no credentials provided", async () => {
      const result = await applyApiKeys({});
      expect(result.env).toEqual({});
    });

    it("returns empty env when both credentials are empty", async () => {
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "",
        ANTHROPIC_API_KEY: "",
      });
      expect(result.env).toEqual({});
    });
  });
});

describe("CLAUDE_AGENT_CONFIGS", () => {
  it("is an array of agent configs", () => {
    expect(Array.isArray(CLAUDE_AGENT_CONFIGS)).toBe(true);
    expect(CLAUDE_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  it("all configs have required fields", () => {
    for (const config of CLAUDE_AGENT_CONFIGS) {
      expect(config).toHaveProperty("name");
      expect(config).toHaveProperty("command");
      expect(config).toHaveProperty("args");
      expect(config).toHaveProperty("environment");
      expect(config).toHaveProperty("checkRequirements");
      expect(config).toHaveProperty("apiKeys");
      expect(config).toHaveProperty("applyApiKeys");
      expect(config).toHaveProperty("completionDetector");
    }
  });

  it("all configs use claude command", () => {
    for (const config of CLAUDE_AGENT_CONFIGS) {
      expect(config.command).toBe("claude");
    }
  });

  it("all configs have name starting with claude/", () => {
    for (const config of CLAUDE_AGENT_CONFIGS) {
      expect(config.name).toMatch(/^claude\//);
    }
  });

  it("all configs have --dangerously-skip-permissions flag", () => {
    for (const config of CLAUDE_AGENT_CONFIGS) {
      expect(config.args).toContain("--dangerously-skip-permissions");
    }
  });

  it("all configs have --model flag with a model ID", () => {
    for (const config of CLAUDE_AGENT_CONFIGS) {
      const modelIndex = config.args.indexOf("--model");
      expect(modelIndex).toBeGreaterThan(-1);
      expect(config.args[modelIndex + 1]).toBeDefined();
    }
  });

  it("all configs have both OAuth and API key in apiKeys", () => {
    for (const config of CLAUDE_AGENT_CONFIGS) {
      expect(config.apiKeys).toContain(CLAUDE_CODE_OAUTH_TOKEN);
      expect(config.apiKeys).toContain(ANTHROPIC_API_KEY);
    }
  });

  describe("model mapping", () => {
    it("includes opus-4.6 config", () => {
      const config = CLAUDE_AGENT_CONFIGS.find((c) => c.name === "claude/opus-4.6");
      expect(config).toBeDefined();
      expect(config?.args).toContain("opus");
    });

    it("includes opus-4.5 config", () => {
      const config = CLAUDE_AGENT_CONFIGS.find((c) => c.name === "claude/opus-4.5");
      expect(config).toBeDefined();
      expect(config?.args).toContain("opus");
    });

    it("includes sonnet-4.5 config", () => {
      const config = CLAUDE_AGENT_CONFIGS.find((c) => c.name === "claude/sonnet-4.5");
      expect(config).toBeDefined();
      expect(config?.args).toContain("sonnet");
    });

    it("includes haiku-4.5 config", () => {
      const config = CLAUDE_AGENT_CONFIGS.find((c) => c.name === "claude/haiku-4.5");
      expect(config).toBeDefined();
      expect(config?.args).toContain("haiku");
    });
  });
});
