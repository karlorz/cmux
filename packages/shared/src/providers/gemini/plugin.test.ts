import { describe, expect, it } from "vitest";
import { geminiPlugin } from "./plugin";

describe("geminiPlugin", () => {
  describe("manifest", () => {
    it("has id gemini", () => {
      expect(geminiPlugin.manifest.id).toBe("gemini");
    });

    it("has name Google Gemini", () => {
      expect(geminiPlugin.manifest.name).toBe("Google Gemini");
    });

    it("has version", () => {
      expect(geminiPlugin.manifest.version).toBeTruthy();
    });

    it("is builtin type", () => {
      expect(geminiPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has default base URL for generativelanguage API", () => {
      expect(geminiPlugin.provider.defaultBaseUrl).toContain(
        "generativelanguage.googleapis.com"
      );
    });

    it("uses openai api format", () => {
      expect(geminiPlugin.provider.apiFormat).toBe("openai");
    });

    it("requires GEMINI_API_KEY", () => {
      expect(geminiPlugin.provider.authEnvVars).toContain("GEMINI_API_KEY");
    });
  });

  describe("configs and catalog", () => {
    it("has configs array", () => {
      expect(Array.isArray(geminiPlugin.configs)).toBe(true);
    });

    it("has catalog array", () => {
      expect(Array.isArray(geminiPlugin.catalog)).toBe(true);
    });
  });
});
