import { describe, expect, it } from "vitest";
import { anthropicPlugin } from "./plugin";
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_BASE_URL_KEY,
  CLAUDE_CODE_OAUTH_TOKEN,
} from "../../apiKeys";
import { CLAUDE_CATALOG } from "./catalog";
import { CLAUDE_AGENT_CONFIGS } from "./configs";

describe("anthropicPlugin", () => {
  describe("manifest", () => {
    it("has id anthropic", () => {
      expect(anthropicPlugin.manifest.id).toBe("anthropic");
    });

    it("has name Anthropic", () => {
      expect(anthropicPlugin.manifest.name).toBe("Anthropic");
    });

    it("has version 1.0.0", () => {
      expect(anthropicPlugin.manifest.version).toBe("1.0.0");
    });

    it("has description", () => {
      expect(anthropicPlugin.manifest.description).toBe(
        "Claude Code agents powered by Anthropic's Claude models"
      );
    });

    it("has type builtin", () => {
      expect(anthropicPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has defaultBaseUrl for Anthropic API", () => {
      expect(anthropicPlugin.provider.defaultBaseUrl).toBe(
        "https://api.anthropic.com"
      );
    });

    it("has anthropic apiFormat", () => {
      expect(anthropicPlugin.provider.apiFormat).toBe("anthropic");
    });

    it("has ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN as authEnvVars", () => {
      expect(anthropicPlugin.provider.authEnvVars).toContain("ANTHROPIC_API_KEY");
      expect(anthropicPlugin.provider.authEnvVars).toContain(
        "CLAUDE_CODE_OAUTH_TOKEN"
      );
    });

    it("includes both API keys in apiKeys array", () => {
      expect(anthropicPlugin.provider.apiKeys).toContain(ANTHROPIC_API_KEY);
      expect(anthropicPlugin.provider.apiKeys).toContain(CLAUDE_CODE_OAUTH_TOKEN);
    });

    it("has baseUrlKey for custom base URL", () => {
      expect(anthropicPlugin.provider.baseUrlKey).toBe(ANTHROPIC_BASE_URL_KEY);
    });
  });

  describe("exports", () => {
    it("exports CLAUDE_AGENT_CONFIGS as configs", () => {
      expect(anthropicPlugin.configs).toBe(CLAUDE_AGENT_CONFIGS);
    });

    it("exports CLAUDE_CATALOG as catalog", () => {
      expect(anthropicPlugin.catalog).toBe(CLAUDE_CATALOG);
    });
  });
});
