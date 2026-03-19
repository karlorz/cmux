import { describe, expect, it } from "vitest";
import { CLAUDE_AGENT_CONFIGS, createApplyClaudeApiKeys } from "./configs";
import { ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN } from "../../apiKeys";

describe("CLAUDE_AGENT_CONFIGS", () => {
  it("is a non-empty array", () => {
    expect(CLAUDE_AGENT_CONFIGS).toBeInstanceOf(Array);
    expect(CLAUDE_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  describe("config structure", () => {
    it("all configs have names starting with claude/", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.name).toMatch(/^claude\//);
      }
    });

    it("all configs use claude command", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.command).toBe("claude");
      }
    });

    it("all configs have --model and permission flags", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.args).toContain("--model");
        expect(config.args).toContain("--allow-dangerously-skip-permissions");
        expect(config.args).toContain("--dangerously-skip-permissions");
      }
    });

    it("all configs have --ide flag", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.args).toContain("--ide");
      }
    });

    it("all configs have both OAuth and API key in apiKeys", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.apiKeys).toContain(CLAUDE_CODE_OAUTH_TOKEN);
        expect(config.apiKeys).toContain(ANTHROPIC_API_KEY);
      }
    });

    it("all configs have applyApiKeys function", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.applyApiKeys).toBeInstanceOf(Function);
      }
    });

    it("all configs have checkRequirements function", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.checkRequirements).toBeInstanceOf(Function);
      }
    });

    it("all configs have completionDetector function", () => {
      for (const config of CLAUDE_AGENT_CONFIGS) {
        expect(config.completionDetector).toBeInstanceOf(Function);
      }
    });
  });

  describe("model variations", () => {
    it("includes opus-4.6 model", () => {
      const config = CLAUDE_AGENT_CONFIGS.find(
        (c) => c.name === "claude/opus-4.6"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("claude-opus-4-6");
    });

    it("includes opus-4.5 model", () => {
      const config = CLAUDE_AGENT_CONFIGS.find(
        (c) => c.name === "claude/opus-4.5"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("claude-opus-4-5-20251101");
    });

    it("includes haiku-4.5 model", () => {
      const config = CLAUDE_AGENT_CONFIGS.find(
        (c) => c.name === "claude/haiku-4.5"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("claude-haiku-4-5-20251001");
    });
  });
});

describe("createApplyClaudeApiKeys", () => {
  it("returns a function", () => {
    const applyApiKeys = createApplyClaudeApiKeys();
    expect(applyApiKeys).toBeInstanceOf(Function);
  });

  describe("key priority", () => {
    it("prioritizes OAuth token over API key", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
        ANTHROPIC_API_KEY: "sk-api-key-456",
      });

      expect(result.env).toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token-123");
      expect(result.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    });

    it("falls back to API key when OAuth not provided", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({
        ANTHROPIC_API_KEY: "sk-api-key-456",
      });

      expect(result.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-api-key-456");
      expect(result.env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("returns empty env when no credentials provided", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({});

      expect(result.env).toEqual({});
    });

    it("ignores empty OAuth token", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "",
        ANTHROPIC_API_KEY: "sk-api-key-456",
      });

      expect(result.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-api-key-456");
    });

    it("ignores whitespace-only OAuth token", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "   ",
        ANTHROPIC_API_KEY: "sk-api-key-456",
      });

      expect(result.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-api-key-456");
    });
  });

  describe("unsetEnv", () => {
    it("includes unsetEnv in result", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
      });

      expect(result.unsetEnv).toBeInstanceOf(Array);
    });

    it("adds ANTHROPIC_API_KEY to unsetEnv when using OAuth", async () => {
      const applyApiKeys = createApplyClaudeApiKeys();
      const result = await applyApiKeys({
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
      });

      expect(result.unsetEnv).toContain("ANTHROPIC_API_KEY");
    });
  });
});
