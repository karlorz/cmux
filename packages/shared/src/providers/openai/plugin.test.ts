import { describe, expect, it } from "vitest";
import { openaiPlugin } from "./plugin";

describe("openaiPlugin", () => {
  describe("manifest", () => {
    it("has id openai", () => {
      expect(openaiPlugin.manifest.id).toBe("openai");
    });

    it("has name OpenAI", () => {
      expect(openaiPlugin.manifest.name).toBe("OpenAI");
    });

    it("has version", () => {
      expect(openaiPlugin.manifest.version).toBeTruthy();
    });

    it("is builtin type", () => {
      expect(openaiPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has default base URL for OpenAI API", () => {
      expect(openaiPlugin.provider.defaultBaseUrl).toBe(
        "https://api.openai.com/v1"
      );
    });

    it("uses openai api format", () => {
      expect(openaiPlugin.provider.apiFormat).toBe("openai");
    });

    it("requires OPENAI_API_KEY", () => {
      expect(openaiPlugin.provider.authEnvVars).toContain("OPENAI_API_KEY");
    });
  });

  describe("configs and catalog", () => {
    it("has configs array", () => {
      expect(Array.isArray(openaiPlugin.configs)).toBe(true);
    });

    it("has catalog array", () => {
      expect(Array.isArray(openaiPlugin.catalog)).toBe(true);
    });
  });
});
