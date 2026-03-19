import { describe, expect, it } from "vitest";
import { openaiPlugin } from "./plugin";
import {
  CODEX_AUTH_JSON,
  OPENAI_API_KEY,
  OPENAI_BASE_URL_KEY,
} from "../../apiKeys";
import { CODEX_CATALOG } from "./catalog";
import { CODEX_AGENT_CONFIGS } from "./configs";

describe("openaiPlugin", () => {
  describe("manifest", () => {
    it("has id openai", () => {
      expect(openaiPlugin.manifest.id).toBe("openai");
    });

    it("has name OpenAI", () => {
      expect(openaiPlugin.manifest.name).toBe("OpenAI");
    });

    it("has version 1.0.0", () => {
      expect(openaiPlugin.manifest.version).toBe("1.0.0");
    });

    it("has description", () => {
      expect(openaiPlugin.manifest.description).toBe(
        "Codex agents powered by OpenAI's GPT models"
      );
    });

    it("has type builtin", () => {
      expect(openaiPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has defaultBaseUrl for OpenAI API", () => {
      expect(openaiPlugin.provider.defaultBaseUrl).toBe(
        "https://api.openai.com/v1"
      );
    });

    it("has openai apiFormat", () => {
      expect(openaiPlugin.provider.apiFormat).toBe("openai");
    });

    it("has OPENAI_API_KEY as authEnvVar", () => {
      expect(openaiPlugin.provider.authEnvVars).toContain("OPENAI_API_KEY");
    });

    it("includes OPENAI_API_KEY in apiKeys array", () => {
      expect(openaiPlugin.provider.apiKeys).toContain(OPENAI_API_KEY);
    });

    it("includes CODEX_AUTH_JSON in apiKeys array", () => {
      expect(openaiPlugin.provider.apiKeys).toContain(CODEX_AUTH_JSON);
    });

    it("has baseUrlKey for custom base URL", () => {
      expect(openaiPlugin.provider.baseUrlKey).toBe(OPENAI_BASE_URL_KEY);
    });
  });

  describe("exports", () => {
    it("exports CODEX_AGENT_CONFIGS as configs", () => {
      expect(openaiPlugin.configs).toBe(CODEX_AGENT_CONFIGS);
    });

    it("exports CODEX_CATALOG as catalog", () => {
      expect(openaiPlugin.catalog).toBe(CODEX_CATALOG);
    });
  });
});
