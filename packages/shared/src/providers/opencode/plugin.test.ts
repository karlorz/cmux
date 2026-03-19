import { describe, expect, it } from "vitest";
import { opencodePlugin } from "./plugin";
import { OPENROUTER_API_KEY, OPENROUTER_BASE_URL_KEY } from "../../apiKeys";
import { OPENCODE_CATALOG } from "./catalog";
import { OPENCODE_AGENT_CONFIGS } from "./configs";

describe("opencodePlugin", () => {
  describe("manifest", () => {
    it("has id opencode", () => {
      expect(opencodePlugin.manifest.id).toBe("opencode");
    });

    it("has name OpenCode", () => {
      expect(opencodePlugin.manifest.name).toBe("OpenCode");
    });

    it("has version 1.0.0", () => {
      expect(opencodePlugin.manifest.version).toBe("1.0.0");
    });

    it("has description", () => {
      expect(opencodePlugin.manifest.description).toBe(
        "OpenCode agents supporting multiple model providers"
      );
    });

    it("has type builtin", () => {
      expect(opencodePlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has defaultBaseUrl for OpenRouter API", () => {
      expect(opencodePlugin.provider.defaultBaseUrl).toBe(
        "https://openrouter.ai/api/v1"
      );
    });

    it("has openai apiFormat", () => {
      expect(opencodePlugin.provider.apiFormat).toBe("openai");
    });

    it("has OPENROUTER_API_KEY as authEnvVar", () => {
      expect(opencodePlugin.provider.authEnvVars).toContain("OPENROUTER_API_KEY");
    });

    it("includes OPENROUTER_API_KEY in apiKeys", () => {
      expect(opencodePlugin.provider.apiKeys).toContain(OPENROUTER_API_KEY);
    });

    it("has baseUrlKey for custom base URL", () => {
      expect(opencodePlugin.provider.baseUrlKey).toBe(OPENROUTER_BASE_URL_KEY);
    });
  });

  describe("exports", () => {
    it("exports OPENCODE_AGENT_CONFIGS as configs", () => {
      expect(opencodePlugin.configs).toBe(OPENCODE_AGENT_CONFIGS);
    });

    it("exports OPENCODE_CATALOG as catalog", () => {
      expect(opencodePlugin.catalog).toBe(OPENCODE_CATALOG);
    });
  });
});
