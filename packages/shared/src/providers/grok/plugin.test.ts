import { describe, expect, it } from "vitest";
import { grokPlugin } from "./plugin";

describe("grokPlugin", () => {
  describe("manifest", () => {
    it("has id grok", () => {
      expect(grokPlugin.manifest.id).toBe("grok");
    });

    it("has name Grok", () => {
      expect(grokPlugin.manifest.name).toBe("Grok");
    });

    it("has version", () => {
      expect(grokPlugin.manifest.version).toBeTruthy();
    });

    it("is builtin type", () => {
      expect(grokPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has default base URL for xAI API", () => {
      expect(grokPlugin.provider.defaultBaseUrl).toBe("https://api.x.ai/v1");
    });

    it("uses openai api format", () => {
      expect(grokPlugin.provider.apiFormat).toBe("openai");
    });

    it("requires XAI_API_KEY", () => {
      expect(grokPlugin.provider.authEnvVars).toContain("XAI_API_KEY");
    });
  });

  describe("configs and catalog", () => {
    it("has configs array", () => {
      expect(Array.isArray(grokPlugin.configs)).toBe(true);
    });

    it("has catalog array", () => {
      expect(Array.isArray(grokPlugin.catalog)).toBe(true);
    });
  });
});
