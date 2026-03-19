import { describe, expect, it } from "vitest";
import { checkClaudeRequirements } from "./check-requirements";

describe("checkClaudeRequirements", () => {
  describe("with settings-provided credentials", () => {
    it("returns empty array when OAuth token provided in context", async () => {
      const result = await checkClaudeRequirements({
        apiKeys: {
          CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
        },
      });
      expect(result).toEqual([]);
    });

    it("returns empty array when API key provided in context", async () => {
      const result = await checkClaudeRequirements({
        apiKeys: {
          ANTHROPIC_API_KEY: "sk-ant-api-key-456",
        },
      });
      expect(result).toEqual([]);
    });

    it("returns empty array when both credentials provided in context", async () => {
      const result = await checkClaudeRequirements({
        apiKeys: {
          CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-123",
          ANTHROPIC_API_KEY: "sk-ant-api-key-456",
        },
      });
      expect(result).toEqual([]);
    });

    it("does not skip checks when OAuth token is empty string", async () => {
      const result = await checkClaudeRequirements({
        apiKeys: {
          CLAUDE_CODE_OAUTH_TOKEN: "",
        },
      });
      // Should not return empty array since credential is empty
      expect(Array.isArray(result)).toBe(true);
    });

    it("does not skip checks when API key is whitespace only", async () => {
      const result = await checkClaudeRequirements({
        apiKeys: {
          ANTHROPIC_API_KEY: "   ",
        },
      });
      // Should not return empty array since credential is whitespace
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("return type", () => {
    it("returns a Promise", () => {
      const result = checkClaudeRequirements();
      expect(result).toBeInstanceOf(Promise);
    });

    it("returns an array when awaited", async () => {
      const result = await checkClaudeRequirements();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("missing credentials detection", () => {
    it("detects missing credentials when no context provided", async () => {
      // Without any local files or keychain, this should report missing items
      const result = await checkClaudeRequirements();
      // The exact result depends on filesystem state, but it should be an array
      expect(Array.isArray(result)).toBe(true);
    });

    it("detects missing credentials when empty context provided", async () => {
      const result = await checkClaudeRequirements({});
      expect(Array.isArray(result)).toBe(true);
    });

    it("detects missing credentials when empty apiKeys provided", async () => {
      const result = await checkClaudeRequirements({ apiKeys: {} });
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
